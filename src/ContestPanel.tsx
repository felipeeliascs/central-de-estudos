import { JsonImportWorkbench } from "./JsonImportWorkbench";
import { ActionMenu } from "./ActionMenu";
import { officialPortal } from "./library";
import { History, Archive, Trash2 } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";
import { parseImportJson } from "./import-json";
import { useEffect, useId, useState } from "react";
import type { Node } from "./domain";
import { steps } from "./domain";
import { ModulePage } from "./ModulePage";
import {
  compareContest,
  maxBytes,
  newContest,
  newId,
  parseContest,
  type ContestDocument,
  type Resource,
  type Source,
  type SyllabusItem,
} from "./contest-schema";
import { previewVideoBatch } from "./video-batch";
import { supabase } from "./repository";

type Edition = {
  doc: ContestDocument;
  base: ContestDocument | null;
  target: string | null;
  mode: "manual" | "duplicate" | "import";
};
type Enrollment = { contest_id: string; status: string };
type Link = { first_topic: string; second_topic: string; coverage?: "full" | "partial"; review_notes?: string };
type Receipt = {
  id: string;
  kind: string;
  created_at: string;
  summary: { name: string; version: number; items: number; resources: number };
};
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const levels = {
  discipline: "Disciplina",
  topic: "Assunto",
  subtopic: "Subassunto",
};
const resourceTypes = {
  bibliography: "Bibliografia",
  video: "Videoaula",
  legislation: "Legislação",
  material: "Material de estudo",
  external_questions: "Questões externas",
};

export function ContestPanel({
  startImport = false,
  nodes,
  editable,
  user,
  admin,
  close,
  refresh,
  open,
  notice = open,
}: {
  nodes: Node[];
  startImport?: boolean;
  editable: ReadonlySet<string>;
  user: string;
  admin: boolean;
  close: () => void;
  refresh: () => Promise<void>;
  open: (id: string) => void;
  notice?: (id: string) => void;
}) {
  const importId = useId();
  const [deletion, setDeletion] = useState<{ target: string; doc: ContestDocument; canDelete: boolean; reason: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [videoPreview, setVideoPreview] = useState<ReturnType<typeof previewVideoBatch> | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [raw, setRaw] = useState("");
  const [importBase, setImportBase] = useState<ContestDocument | null>(null);
  const [partialReviewed, setPartialReviewed] = useState(false);
  const partialImport = edition?.mode === "import" && !videoPreview && !edition.doc.items.length;
  function changeRaw(value: string) { setRaw(value); setPreview(null); setVideoPreview(null); setEdition(null); setPartialReviewed(false); setError(""); }
  const [importing, setImporting] = useState(startImport);
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof compareContest
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [documents, setDocuments] = useState<Record<string, ContestDocument>>(
    {},
  );
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [coverage,setCoverage] = useState<"full" | "partial">("partial");
  const [reviewNotes,setReviewNotes] = useState("");
  const roots = nodes.filter((n) => n.kind === "contest");
  const visibleRoots = roots.filter(n => {
    const doc = documents[n.id];
    return (scope === "all" || enrollments.some(e => e.contest_id === n.id && e.status === "active")) &&
      [n.name, n.board, doc?.role, doc?.organization].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR").trim());
  });
  const videoErrors = videoPreview?.rows.filter(row => row.error) ?? [];
  const db = supabase!;
  function root(id: string): string {
    const n = nodes.find((n) => n.id === id);
    return n?.parent_id ? root(n.parent_id) : (n?.id ?? "");
  }
  const topics = nodes.filter(
    (n) =>
      (n.kind === "topic" || n.kind === "subtopic") &&
      !n.catalog_archived &&
      !roots.find((r) => r.id === root(n.id))?.catalog_archived,
  );
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  async function lists() {
    const [e, l, h, d] = await Promise.all([
      db.from("study_enrollments").select("contest_id,status"),
      db.from("study_topic_equivalences").select("*"),
      admin
        ? db
            .from("study_imports")
            .select("id,kind,created_at,summary")
            .like("kind", "contest:%")
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
      db.from("study_catalog").select("contest_id,document"),
    ]);
    for (const r of [e, l, h, d]) if (r.error) throw new Error(r.error.message);
    setEnrollments(e.data as Enrollment[]);
    setLinks(l.data as Link[]);
    setReceipts(h.data as Receipt[]);
    setDocuments(
      Object.fromEntries(
        (d.data ?? []).map((row) => [
          row.contest_id,
          row.document as ContestDocument,
        ]),
      ),
    );
  }
  useEffect(() => {
    let mounted = true;
    void lists().catch((e) => {
      if (mounted) setError(e.message);
    });
    return () => {
      mounted = false;
    }; // Load once per opened panel and permission level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function read(id: string) {
    const result = await db.rpc("study_catalog_document", { target: id });
    if (result.error) throw new Error(result.error.message);
    return result.data as ContestDocument;
  }
  function reset() {
    setImportBase(null); setPartialReviewed(false);
    setDeletion(null);
    setDeleteConfirmation("");
    setEdition(null);
    setVideoPreview(null);
    setPreview(null);
    setImporting(false);
    setRaw("");
    setTarget("");
  }
  function makePreview(next: Edition) {
    const doc = parseContest(pretty(next.doc));
    setPreview(compareContest(next.base, doc));
    setEdition({ ...next, doc });
  }
  function exportDoc(doc: ContestDocument) {
    const url = URL.createObjectURL(
      new Blob([pretty(doc)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${doc.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function edit(
    rootId: string,
    mode: "manual" | "duplicate" | "export" | "archive",
  ) {
    void run(async () => {
      const doc = await read(rootId);
      reset();
      if (mode === "export") {
        exportDoc(doc);
        return;
      }
      if (mode === "duplicate") {
        setEdition({
          doc: {
            ...doc,
            id: newId(),
            name: `${doc.name.slice(0, 172)} (cópia)`,
            listed: false,
            archived: false,
          },
          base: null,
          target: null,
          mode,
        });
        return;
      }
      const value: Edition = { doc, base: doc, target: rootId, mode: "manual" };
      if (mode === "archive")
        makePreview({ ...value, doc: { ...doc, archived: !doc.archived } });
      else setEdition(value);
    });
  }
  function importPreview() {
    void run(async () => {
      const input = parseImportJson(raw);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("$: esperado objeto JSON de concurso ou lote de videoaulas.");
      if ("type" in input && input.type === "video_batch") {
        let chosen = target;
        if (!chosen) {
          const lookup = await db.from("study_catalog").select("contest_id").eq("external_id", ("contest_id" in input ? input.contest_id : undefined)).maybeSingle();
          if (lookup.error) throw new Error(lookup.error.message);
          chosen = lookup.data?.contest_id ?? "";
        }
        if (!chosen) throw new Error("Selecione um edital já cadastrado.");
        const base = await read(chosen);
        setImportBase(base);
        const result = previewVideoBatch(raw, base);
        setVideoPreview(result);
        setEdition({ doc: result.doc, base, target: chosen, mode: "import" });
        setPreview(result.rows.map(row => ({ id: row.id, name: row.title + " → " + row.item, status: row.status })));
        return;
      }
      setVideoPreview(null);
      const doc = parseContest(raw);
      let chosen = target || null;
      if (!chosen) {
        const lookup = await db
          .from("study_catalog")
          .select("contest_id")
          .eq("external_id", doc.id)
          .maybeSingle();
        if (lookup.error) throw new Error(lookup.error.message);
        chosen = lookup.data?.contest_id ?? null;
      }
      const base = chosen ? await read(chosen) : null;
      setImportBase(base);
      makePreview({
        doc,
        base,
        target: chosen,
        mode: "import",
      });
    });
  }
  function reviewDeletion(rootId: string) {
    void run(async () => {
      const doc = await read(rootId);
      const status = await db.rpc("study_contest_deletion_status", { target: rootId });
      if (status.error) {
        if (status.error.code === "PGRST202" || status.error.code === "42883")
          throw new Error("A exclusão definitiva depende da migração 015, ainda não habilitada neste ambiente. Você pode arquivar o concurso no catálogo.");
        throw new Error(status.error.message);
      }
      if (!status.data || typeof status.data.can_delete !== "boolean" || typeof status.data.reason !== "string")
        throw new Error("Não foi possível verificar os vínculos do concurso. Tente novamente.");
      setDeletion({ target: rootId, doc, canDelete: status.data.can_delete, reason: status.data.reason });
      setDeleteConfirmation("");
    });
  }
  function deleteContest() {
    if (!deletion?.canDelete || deleteConfirmation !== deletion.doc.id) return;
    void run(async () => {
      const result = await db.rpc("study_delete_contest", { target: deletion.target, expected: deletion.doc, confirmed_external_id: deleteConfirmation });
      if (result.error) {
        // A reference may have been created after the preview. Keep archiving available.
        setDeletion({ ...deletion, canDelete: false, reason: "Não foi possível excluir. Reabra a verificação ou arquive o concurso para preservar os dados." });
        throw new Error(result.error.message);
      }
      reset();
      setMessage("Concurso excluído. O histórico de operações foi preservado.");
      await Promise.all([refresh(), lists()]);
    });
  }
  function commit() {
    if (!edition || (videoPreview && !videoPreview.valid) || (partialImport && !partialReviewed)) return;
    void run(async () => {
      const result = videoPreview ? await db.rpc("study_apply_video_batch", {
        batch: videoPreview.batch, expected: edition.base, target: edition.target, request_id: newId(),
      }) : await db.rpc("study_apply_catalog", {
        doc: edition.doc,
        expected: edition.base,
        target: edition.target,
        request_id: newId(),
        operation: edition.mode,
      });
      if (result.error) throw new Error(result.error.message);
      reset();
      setMessage("Concurso salvo.");
      await Promise.all([refresh(), lists()]);
    });
  }
  return (
    <ModulePage
      title="Meus concursos"
      close={close}
      busy={busy}
    >
      <fieldset disabled={busy}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        {importing && <JsonImportWorkbench raw={raw} onChange={changeRaw} accepted={["contest","video_batch"]} context={{contest:importBase}} disabled={busy} />}
        {deletion ? (
          <section className="catalog-deletion" aria-label="Excluir concurso importado">
            <h3>Excluir concurso importado</h3>
            <p><strong>{deletion.doc.name}</strong></p>
            <p role="status">{deletion.reason}</p>
            <p>Arquivar é reversível e preserva materiais, seleções e progresso. A exclusão definitiva não pode ser desfeita e remove este edital e seus recursos importados para todas as contas.</p>
            {deletion.canDelete && <label htmlFor={`${importId}-delete`}>
              Digite o ID externo para confirmar: {deletion.doc.id}
              <input id={`${importId}-delete`} name="delete-contest-confirmation" autoComplete="off" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} />
            </label>}
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setDeletion(null)}>Cancelar exclusão</button>
              <button type="button" className="secondary" onClick={() => edit(deletion.target, "archive")}>{deletion.doc.archived ? "Reativar no catálogo" : "Arquivar no catálogo"}</button>
              <button type="button" className="primary contest-delete-button" disabled={!deletion.canDelete || deleteConfirmation !== deletion.doc.id} onClick={deleteContest}>Excluir definitivamente</button>
            </div>
          </section>
        ) : preview && edition ? (
          <>
            <h3>Prévia de alterações</h3>
            <p>
              Confira a identificação e as alterações antes de salvar. O
              histórico de estudo é preservado.
            </p>
            {videoPreview ? (
              <>
                <p role="status">{videoPreview.rows.length} vínculos na prévia · {videoPreview.rows.filter(row => !row.error && row.status.startsWith("Nova")).length} novas aulas · {videoPreview.rows.filter(row => !row.error && row.status.startsWith("Duplicata")).length} duplicatas preservadas · {videoErrors.length} erros.</p>
                {videoErrors.length > 0 && <p className="error" role="alert">Corrija {videoErrors.length} {videoErrors.length === 1 ? "aula com erro" : "aulas com erro"} antes de salvar. Os erros aparecem primeiro. <a href={`#${importId}-video-${videoPreview.rows.findIndex(row => row.error)}`}>Ir ao primeiro erro</a></p>}
                <ul className="import-preview" aria-label="Vínculos das videoaulas">
                  {[true, false].flatMap(hasError => videoPreview.rows.map((row, i) => row.error === hasError && (
                    <li id={`${importId}-video-${i}`} tabIndex={-1} className={row.error ? "import-row-error" : ""} key={i}>
                      <strong>{row.error ? "Erro · " : ""}{row.status}</strong>
                      <p>{row.title} → {row.item}</p>
                      <small>Recurso: {row.id} · Campo: $.resources[{i}]</small>
                    </li>
                  )))}
                </ul>
              </>
            ) : <ul>{preview.map((row, i) => (
              <li key={`${row.id}-${i}`}><strong>{row.status}</strong> · {row.name} <small>({row.id})</small></li>
            ))}</ul>}
            {partialImport && <div className="json-wrapper-notice"><p>Cadastro parcial: este JSON não contém conteúdo programático. Confira se o anexo de disciplinas e assuntos foi fornecido. Nenhum conteúdo será inventado.</p><label className="check-label"><input type="checkbox" checked={partialReviewed} onChange={e => setPartialReviewed(e.target.checked)} />Confirmo o cadastro parcial, sem conteúdo programático</label></div>}
            <p id={`${importId}-confirmation`} role="status">
              {videoErrors.length ? `${videoErrors.length} ${videoErrors.length === 1 ? "erro impede" : "erros impedem"} salvar. Volte e corrija as aulas destacadas; nenhum recurso foi gravado.` : "Prévia válida. Confira os vínculos antes de confirmar."}
            </p>
            <div className="form-actions">
              <button className="secondary" onClick={() => { setPreview(null); if (edition.mode === "import") { setEdition(null); setVideoPreview(null); } }}>
                {edition.mode === "import" ? "Voltar e corrigir JSON" : "Voltar"}
              </button>
              <button className="primary" aria-describedby={`${importId}-confirmation`} disabled={(!!videoPreview && !videoPreview.valid) || (!!partialImport && !partialReviewed)} onClick={commit}>
                Confirmar e salvar
              </button>
            </div>
          </>
        ) : edition && edition.mode !== "import" ? (
          <ContestEditor
            doc={edition.doc}
            set={(doc) => setEdition({ ...edition, doc })}
            cancel={reset}
            review={() => void run(async () => makePreview(edition))}
          />
        ) : importing ? (
          <>
            <h3>Importar concurso ou lote de videoaulas</h3>
            <p>Para videoaulas, use type: video_batch e o ID externo de um edital existente. A prévia mostra vínculos, duplicatas e referências inválidas. Nenhuma aula é gravada antes da confirmação.</p>
            <label htmlFor={`${importId}-target`}>
              Atualizar concurso existente
              <select
                id={`${importId}-target`} name="contest-target"
                value={target}
                onChange={(e) => { setTarget(e.target.value); setImportBase(documents[e.target.value] ?? null); setPreview(null); setPartialReviewed(false); }}
              >
                <option value="">Identificar pelo ID do JSON</option>
                {roots
                  .filter((r) => editable.has(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <label htmlFor={`${importId}-file`}>
              Arquivo JSON
              <input
                id={`${importId}-file`} name="contest-json-file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > maxBytes)
                        throw new Error("Limite de 512 KiB.");
                      changeRaw(await file.text());
                    });
                }}
              />
            </label>
            <label htmlFor={`${importId}-raw`}>
              Ou cole o JSON
              <textarea
                id={`${importId}-raw`} name="contest-json-text" spellCheck={false}
                rows={13}
                value={raw}
                onChange={(e) => changeRaw(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button className="secondary" onClick={reset}>
                Cancelar
              </button>
              <button className="primary" onClick={importPreview}>
                Gerar prévia
              </button>
            </div>
          </>
        ) : (
          <>
            {admin && (
              <div className="catalog-actions">
                <button
                  className="primary"
                  onClick={() =>
                    setEdition({
                      doc: newContest(),
                      base: null,
                      target: null,
                      mode: "manual",
                    })
                  }
                >
                  Novo concurso
                </button>
                <button
                  className="secondary"
                  onClick={() => setImporting(true)}
                >
                  Importar JSON
                </button>
              </div>
            )}
            <p className="page-description">Organize seus objetivos e encontre editais por órgão, cargo ou banca.</p>
            <div className="contest-toolbar">
              <div className="segmented" aria-label="Filtro de concursos">
                <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>Catálogo</button>
                <button aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>Meus concursos</button>
              </div>
              <label className="contest-search">Buscar por concurso, banca, cargo ou órgão<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Busque por concurso, banca, cargo…" /></label>
            </div>
            {!visibleRoots.length && <p className="chart-empty">Nenhum concurso encontrado para esta seleção.</p>}
            <p className="muted">Remover dos meus concursos altera somente sua seleção e preserva materiais e progresso. Arquivar no catálogo é uma ação administrativa. A exclusão definitiva exige confirmação e só é permitida sem dados de estudo vinculados.</p>
            <div className="contest-grid">
            {visibleRoots.map((r) => {
              const enrolled = enrollments.some(
                (e) => e.contest_id === r.id && e.status === "active",
              );
              return (
                <article className="catalog-entry contest-card" key={r.id}>
                  <h3>
                    {r.name}
                    {r.catalog_archived ? " · Arquivado" : ""}
                  </h3>
                  <span className="catalog-badge">{r.catalog_archived ? "Arquivado" : enrolled ? "Selecionado para estudar" : "Disponível no catálogo"}</span>
                  {documents[r.id]?.organization && <p>{documents[r.id].organization}</p>}
                  {documents[r.id]?.role && <p>{documents[r.id].role}</p>}
                  {r.board && <p>Banca: {r.board}</p>}

                  {documents[r.id] && (
                    <div className="contest-official">{officialPortal(documents[r.id]) ? <a href={officialPortal(documents[r.id])} target="_blank" rel="noopener noreferrer">Acessar página oficial do concurso ↗</a> : <small className="muted">Página oficial não cadastrada.</small>}</div>
                  )}
                  <div className="catalog-actions">
                    {!r.catalog_archived && (
                      <>
                        <button
                          className="secondary"
                          onClick={() =>
                            void run(async () => {
                              const result = await db
                                .from("study_enrollments")
                                .upsert(
                                  {
                                    user_id: user,
                                    contest_id: r.id,
                                    status: enrolled ? "paused" : "active",
                                  },
                                  { onConflict: "user_id,contest_id" },
                                );
                              if (result.error)
                                throw new Error(result.error.message);
                              await Promise.all([lists(), refresh()]);
                            })
                          }
                        >
                          {enrolled
                            ? "Remover dos meus concursos"
                            : "Selecionar concurso"}
                        </button>
                        <button
                          className="secondary"
                          onClick={() => open(r.id)}
                        >
                          Estudar
                        </button>
                      </>
                    )}
                    <button className="secondary" onClick={() => notice(r.id)}>Abrir Edital</button>
                    {admin && editable.has(r.id) && (
                      <ActionMenu label={`Mais ações de ${r.name}`}>
                        {(
                          ["manual", "duplicate", "export"] as const
                        ).map((mode) => (
                          <button
                            className="text-button"
                            key={mode}
                            onClick={() => edit(r.id, mode)}
                          >
                            {
                              {
                                manual: "Editar",
                                duplicate: "Duplicar",
                                export: "Exportar JSON",
                              }[mode]
                            }
                          </button>
                        ))}

                      <button type="button" className="secondary" onClick={() => edit(r.id, "archive")}><Archive size={16} aria-hidden="true" />{r.catalog_archived ? "Reativar no catálogo" : "Arquivar no catálogo"}</button>
                      <button type="button" className="text-button contest-delete-button" onClick={() => reviewDeletion(r.id)}><Trash2 size={16} aria-hidden="true" />Excluir concurso importado</button>
                      </ActionMenu>
                    )}
                  </div>
                </article>
              );
            })}
            </div>
            <details className="equivalence-panel"><summary>Equivalências entre concursos · {links.length} associações</summary>
            <p>Compare conteúdo, profundidade e exigências. A semelhança dos títulos não confirma equivalência.</p>
            {admin && (
              <>
                <h3>Revisar associação</h3>
                <p>
                  Confirme uma associação após comparar o conteúdo dos dois
                  assuntos. Cada edital mantém seu checklist.
                </p>
                <div className="catalog-fields">
                  <label>
                    Primeiro assunto
                    <select
                      value={first}
                      onChange={(e) => {
                        setFirst(e.target.value);
                        setSecond("");
                      }}
                    >
                      <option value="">Selecione</option>
                      {topics.map((n) => (
                        <option key={n.id} value={n.id}>
                          {name(root(n.id))} / {name(n.parent_id ?? "")} /{" "}
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Segundo assunto
                    <select
                      value={second}
                      onChange={(e) => setSecond(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {topics
                        .filter((n) => first && root(n.id) !== root(first))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {name(root(n.id))} / {name(n.parent_id ?? "")} /{" "}
                            {n.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div className="catalog-fields"><label>Cobertura da equivalência<select value={coverage} onChange={e => setCoverage(e.target.value as "full" | "partial")}><option value="partial">Parcial — exige complementação</option><option value="full">Integral — conteúdo e profundidade comparados</option></select></label><label>Comparação de exigências dos editais<textarea value={reviewNotes} maxLength={1000} required onChange={e => setReviewNotes(e.target.value)} placeholder="Registre profundidade, limites, diferenças e complementos necessários." /></label></div>
                <button
                  className="secondary"
                  disabled={!first || !second || !reviewNotes.trim()}
                  onClick={() =>
                    void run(async () => {
                      const result = await db.rpc("study_review_equivalence", {
                        first_id: first,
                        second_id: second,
                        confirmed: true,
                        coverage,
                        review_notes: reviewNotes,
                      });
                      if (result.error) throw new Error(result.error.message);
                      await lists();
                    })
                  }
                >
                  Confirmar equivalência
                </button>
              </>
            )}
            {links.length > 0 && (
              <ul className="equivalence-list">
                {links.map((link) => (
                  <li key={link.first_topic + link.second_topic}>
                    {name(root(link.first_topic))} / {name(link.first_topic)} ↔{" "}
                    {name(root(link.second_topic))} / {name(link.second_topic)}{" "}
                    <span className="catalog-badge">{link.coverage === "full" ? "Integral revisada" : "Parcial / a revisar"}</span><p>{link.review_notes || "Compare as exigências antes de reaproveitar progresso."}</p>
                    {admin && (
                      <button
                        className="text-button"
                        onClick={() =>
                          void run(async () => {
                            const result = await db.rpc(
                              "study_set_equivalence",
                              {
                                first_id: link.first_topic,
                                second_id: link.second_topic,
                                confirmed: false,
                              },
                            );
                            if (result.error)
                              throw new Error(result.error.message);
                            await lists();
                          })
                        }
                      >
                        Desvincular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!links.length && <p>Nenhuma equivalência confirmada.</p>}</details>
            {admin && (
              <CollapsibleSection title="Histórico de operações" description="Acompanhe as últimas importações e alterações do catálogo." meta={`${receipts.length} recentes`} icon={<History size={21} />}>
                {receipts.length ? (
                  <ol className="operation-timeline">
                    {receipts.map(r => (
                      <li key={r.id} className="operation-card">
                        <span className="operation-marker" aria-hidden="true"><History size={17} /></span>
                        <div className="operation-copy">
                          <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString("pt-BR")}</time>
                          <h3>{r.summary.name}</h3>
                          <div className="operation-tags"><span>{{ "contest:import": "Importação", "contest:manual": "Edição", "contest:duplicate": "Duplicação", "contest:delete": "Exclusão" }[r.kind] ?? "Alteração"}</span><span>Edital {r.summary.version}</span><span>{r.summary.items} itens</span><span>{r.summary.resources} recursos</span></div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="section-empty">Nenhuma operação registrada. Suas próximas importações aparecerão aqui.</p>}
              </CollapsibleSection>
            )}
          </>
        )}
      </fieldset>
    </ModulePage>
  );
}

function Text({
  label,
  value,
  set,
  type = "text",
}: {
  label: string;
  value: string | number | undefined;
  set: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value ?? ""}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
const optional = (s: string) => s || undefined;
const numeric = (s: string) => (s === "" ? undefined : Number(s));
function Sources({
  values = [],
  set,
}: {
  values?: Source[];
  set: (values: Source[]) => void;
}) {
  return (
    <details>
      <summary>Referências de origem ({values.length})</summary>
      {values.map((s, i) => (
        <div key={i} className="catalog-fields">
          <Text
            label="Título da referência"
            value={s.title}
            set={(title) =>
              set(values.map((x, j) => (j === i ? { ...x, title } : x)))
            }
          />
          <Text
            label="URL da referência"
            value={s.url}
            set={(url) =>
              set(values.map((x, j) => (j === i ? { ...x, url } : x)))
            }
          />
          <button
            className="text-button"
            onClick={() => set(values.filter((_, j) => j !== i))}
          >
            Remover referência
          </button>
        </div>
      ))}
      <button
        className="text-button"
        onClick={() => set([...values, { title: "", url: "" }])}
      >
        Adicionar referência
      </button>
    </details>
  );
}
function ContestEditor({
  doc,
  set,
  cancel,
  review,
}: {
  doc: ContestDocument;
  set: (doc: ContestDocument) => void;
  cancel: () => void;
  review: () => void;
}) {
  const [added, setAdded] = useState<string[]>([]);
  const update = (changes: Partial<ContestDocument>) =>
    set({ ...doc, ...changes });
  const editItem = (id: string, changes: Partial<SyllabusItem>) =>
    update({
      items: doc.items.map((n) => (n.id === id ? { ...n, ...changes } : n)),
    });
  const editResource = (id: string, changes: Partial<Resource>) =>
    update({
      resources: doc.resources.map((n) =>
        n.id === id ? { ...n, ...changes } : n,
      ),
    });
  function addItem(kind: SyllabusItem["kind"], parent: string | null) {
    const id = newId();
    setAdded([...added, id]);
    update({ items: [...doc.items, { id, parent, kind, name: "" }] });
  }
  function addResource(item: string) {
    const id = newId();
    setAdded([...added, id]);
    update({
      resources: [
        ...doc.resources,
        { id, item, kind: "bibliography", title: "" },
      ],
    });
  }
  function outline(parent: string | null) {
    return doc.items
      .filter((n) => n.parent === parent)
      .map((n) => (
        <details className="catalog-entry" key={n.id}>
          <summary>
            {levels[n.kind]} · {n.name || "Novo item"}
            {n.archived ? " · Arquivado" : ""}
          </summary>
          <Text
            label="Nome do item"
            value={n.name}
            set={(name) => editItem(n.id, { name })}
          />
          <div className="catalog-fields">
            <Text
              label="Quantidade de questões"
              type="number"
              value={n.questions}
              set={(s) => editItem(n.id, { questions: numeric(s) })}
            />
            <Text
              label="Peso"
              type="number"
              value={n.weight}
              set={(s) => editItem(n.id, { weight: numeric(s) })}
            />
            <Text
              label="Duração estimada em minutos"
              type="number"
              value={n.minutes}
              set={(s) => editItem(n.id, { minutes: numeric(s) })}
            />
            <label>
              Prioridade sugerida
              <select
                value={n.priority ?? ""}
                onChange={(e) =>
                  editItem(n.id, {
                    priority: optional(
                      e.target.value,
                    ) as SyllabusItem["priority"],
                  })
                }
              >
                <option value="">Não informada</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>
          </div>
          {n.kind !== "discipline" && (
            <div>
              <strong>Checklist sugerido</strong>
              {steps.map((label, index) => (
                <label className="check-label" key={label}>
                  <input
                    type="checkbox"
                    checked={n.checklist?.includes(index) ?? false}
                    onChange={(e) =>
                      editItem(n.id, {
                        checklist: e.target.checked
                          ? [...(n.checklist ?? []), index]
                          : (n.checklist ?? []).filter(
                              (step) => step !== index,
                            ),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          <Sources
            values={n.sources}
            set={(sources) => editItem(n.id, { sources })}
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!n.archived}
              onChange={(e) => editItem(n.id, { archived: e.target.checked })}
            />
            Arquivar item e ocultar seus descendentes no edital
          </label>
          {n.kind !== "subtopic" && (
            <button
              className="secondary"
              onClick={() =>
                addItem(n.kind === "discipline" ? "topic" : "subtopic", n.id)
              }
            >
              {n.kind === "discipline"
                ? "Adicionar assunto"
                : "Adicionar subassunto"}
            </button>
          )}
          {n.kind !== "discipline" && (
            <>
              <button className="secondary" onClick={() => addResource(n.id)}>
                Adicionar recurso
              </button>
              {doc.resources
                .filter((r) => r.item === n.id)
                .map((r) => (
                  <details className="catalog-entry" key={r.id}>
                    <summary>
                      {resourceTypes[r.kind]} · {r.title || "Novo recurso"}
                      {r.archived ? " · Arquivado" : ""}
                    </summary>
                    <label>
                      Tipo
                      <select
                        value={r.kind}
                        disabled={!added.includes(r.id)}
                        onChange={(e) =>
                          editResource(r.id, {
                            kind: e.target.value as Resource["kind"],
                          })
                        }
                      >
                        {Object.entries(resourceTypes).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Text
                      label="Título da obra ou material"
                      value={r.title}
                      set={(title) => editResource(r.id, { title })}
                    />
                    {r.kind === "bibliography" && (
                      <>
                        <Text
                          label="Autor"
                          value={r.author}
                          set={(s) =>
                            editResource(r.id, { author: optional(s) })
                          }
                        />
                        <Text
                          label="Edição"
                          value={r.edition}
                          set={(s) =>
                            editResource(r.id, { edition: optional(s) })
                          }
                        />
                      </>
                    )}
                    <Text
                      label="URL HTTPS"
                      value={r.url}
                      set={(s) => editResource(r.id, { url: optional(s) })}
                    />
                    <label>
                      Texto ou observações
                      <textarea
                        value={r.text ?? ""}
                        onChange={(e) =>
                          editResource(r.id, { text: optional(e.target.value) })
                        }
                      />
                    </label>
                    <Sources
                      values={r.sources}
                      set={(sources) => editResource(r.id, { sources })}
                    />
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={!!r.archived}
                        onChange={(e) =>
                          editResource(r.id, { archived: e.target.checked })
                        }
                      />
                      Arquivar recurso
                    </label>
                    {added.includes(r.id) && (
                      <button
                        className="text-button"
                        onClick={() =>
                          update({
                            resources: doc.resources.filter(
                              (x) => x.id !== r.id,
                            ),
                          })
                        }
                      >
                        Descartar novo recurso
                      </button>
                    )}
                  </details>
                ))}
            </>
          )}
          {outline(n.id)}
          {added.includes(n.id) && (
            <button
              className="text-button"
              onClick={() => {
                const remove = new Set([n.id]);
                for (let pass = 0; pass < 3; pass++)
                  for (const child of doc.items)
                    if (child.parent && remove.has(child.parent))
                      remove.add(child.id);
                update({
                  items: doc.items.filter((x) => !remove.has(x.id)),
                  resources: doc.resources.filter((x) => !remove.has(x.item)),
                });
              }}
            >
              Descartar novo item
            </button>
          )}
        </details>
      ));
  }
  return (
    <div>
      <h3>Dados do concurso</h3>
      <Text
        label="Nome do concurso"
        value={doc.name}
        set={(name) => update({ name })}
      />
      <div className="catalog-fields">
        {(
          [
            ["Órgão", "organization"],
            ["Cargo", "role"],
            ["Banca", "board"],
          ] as const
        ).map(([label, key]) => (
          <Text
            key={key}
            label={label}
            value={doc[key]}
            set={(s) => update({ [key]: optional(s) })}
          />
        ))}
        <Text
          label="Data da prova"
          type="date"
          value={doc.exam_date}
          set={(s) => update({ exam_date: optional(s) })}
        />
        <Text
          label="Total de questões"
          type="number"
          value={doc.questions}
          set={(s) => update({ questions: numeric(s) })}
        />
        <Text
          label="Peso geral"
          type="number"
          value={doc.weight}
          set={(s) => update({ weight: numeric(s) })}
        />
        <Text
          label="Versão do edital"
          type="number"
          value={doc.notice.version}
          set={(s) => update({ notice: { ...doc.notice, version: Number(s) } })}
        />
        <Text
          label="Publicação do edital"
          type="date"
          value={doc.notice.published_on}
          set={(s) =>
            update({ notice: { ...doc.notice, published_on: optional(s) } })
          }
        />
      </div>
      <Text
        label="Link oficial do edital"
        value={doc.notice.url}
        set={(s) => update({ notice: { ...doc.notice, url: optional(s) } })}
      />
      <label>Página oficial do concurso<input type="url" maxLength={2000} value={doc.sources?.find(s => s.title.trim().toLocaleLowerCase("pt-BR") === "página oficial do concurso")?.url ?? ""} placeholder="https://" onChange={e => update({ sources: [...(doc.sources ?? []).filter(s => s.title.trim().toLocaleLowerCase("pt-BR") !== "página oficial do concurso"), ...(e.target.value ? [{ title: "Página oficial do concurso", url: e.target.value }] : [])] })} /></label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={!!doc.listed}
          onChange={(e) => update({ listed: e.target.checked })}
        />
        Disponibilizar no catálogo para estudantes autenticados
      </label>
      <Sources values={doc.sources} set={(sources) => update({ sources })} />
      <h3>Edital verticalizado</h3>
      <button className="secondary" onClick={() => addItem("discipline", null)}>
        Adicionar disciplina
      </button>
      {outline(null)}
      <div className="form-actions">
        <button className="secondary" onClick={cancel}>
          Cancelar
        </button>
        <button className="primary" onClick={review}>
          Revisar alterações
        </button>
      </div>
    </div>
  );
}
