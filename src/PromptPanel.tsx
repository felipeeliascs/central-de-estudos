import { useEffect, useId, useState } from "react";
import { ModulePage } from "./ModulePage";
import { productivityStore } from "./productivity-data";
import { supabase } from "./repository";
import {
  buildPrompt,
  libraryPromptIds,
  templates,
  type Context,
  type PromptTemplate,
} from "./prompts";
import { contractExamples } from "./prompt-contracts";
import type { Node } from "./domain";
import { parseContest, type ContestDocument } from "./contest-schema";

export function PromptPanel({
  nodes,
  user,
  demo,
  close,
  openImporter,
  openTrails,
  openIncidence,
  openLibrary,
  startTrail = false,
}: {
  nodes: Node[];
  user: string;
  demo: boolean;
  close: () => void;
  openTrails?: () => void;
  openIncidence?: () => void;
  openLibrary?: () => void;
  startTrail?: boolean;
  openImporter: (target: "contest" | "cards" | "questions") => void;
}) {
  const promptId = useId();
  const [custom, setCustom] = useState<PromptTemplate[]>([]);
  const [id, setId] = useState(startTrail ? "trilhas" : templates[0].id);
  const [admin, setAdmin] = useState(false);
  const [documents, setDocuments] = useState<Record<string, ContestDocument>>(
    {},
  );
  const [contest, setContest] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [topic, setTopic] = useState("");
  const [board, setBoard] = useState("");
  const [role, setRole] = useState("");
  const [author, setAuthor] = useState("");
  const [work, setWork] = useState("");
  const [incidenceMeasure, setIncidenceMeasure] = useState<"exams" | "questions">("exams");
  const [videoMode, setVideoMode] = useState<"fixed" | "complete">("fixed");
  const [mockBatch, setMockBatch] = useState(1);
  const [quantity, setQuantity] = useState(5);
  const [difficulty, setDifficulty] = useState("Média");
  const [existing, setExisting] = useState("");
  const [performance, setPerformance] = useState("");
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (demo) return;
    const [roleResult, versions, docs] = await Promise.all([
      supabase!.rpc("study_catalog_admin"),
      supabase!
        .from("prompt_template_versions")
        .select(
          "template_id,revision,body,steps,example,target,prompt_templates(title,description)",
        )
        .order("revision", { ascending: false }),
      supabase!.from("study_catalog").select("contest_id,document"),
    ]);
    for (const result of [roleResult, versions, docs])
      if (result.error) throw new Error(result.error.message);
    setAdmin(roleResult.data === true);
    const seen = new Set<string>();
    setCustom(
      (versions.data ?? []).flatMap((row) => {
        if (seen.has(row.template_id)) return [];
        seen.add(row.template_id);
        const meta = row.prompt_templates as unknown as {
          title: string;
          description: string;
        };
        return [
          {
            id: row.template_id,
            title: meta.title,
            description: meta.description,
            body: row.body,
            steps: row.steps,
            example: row.example,
            target: row.target as PromptTemplate["target"],
            revision: row.revision,
          },
        ];
      }),
    );
    setDocuments(
      Object.fromEntries(
        (docs.data ?? []).map((row) => [
          row.contest_id,
          row.document as ContestDocument,
        ]),
      ),
    );
  }
  useEffect(() => {
    let active = true;
    void load().catch((e) => {
      if (active) setError((e as Error).message);
    });
    return () => {
      active = false;
    }; // Account and panel are recreated together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, demo]);
  const all = [...templates, ...custom];
  const selected = all.find((t) => t.id === id) ?? templates[0];
  const contests = nodes.filter((n) => n.kind === "contest");
  const disciplines = nodes.filter(
    (n) => n.kind === "discipline" && (!contest || n.parent_id === contest),
  );
  function path(id: string) {
    const result: Node[] = [];
    let node = nodes.find((n) => n.id === id);
    while (node) {
      result.unshift(node);
      const parent = node.parent_id;
      node = nodes.find((n) => n.id === parent);
    }
    return result;
  }
  const subjects = nodes.filter(
    (n) =>
      (n.kind === "topic" || n.kind === "subtopic") &&
      (!contest || path(n.id)[0]?.id === contest) &&
      (!discipline || path(n.id)[1]?.id === discipline),
  );
  const context: Context = {
    contest: nodes.find((n) => n.id === contest)?.name ?? "",
    board,
    role,
    discipline: nodes.find((n) => n.id === discipline)?.name ?? "",
    topic: nodes.find((n) => n.id === topic)?.name ?? "",
    topicId: selected.id === "videos" ? (nodes.find(n => n.id === topic)?.catalog_key ?? "") : topic,
    author,
    work,
    quantity,
    mockBatch,
    questionTopics: nodes.filter(n => (n.kind === "topic" || n.kind === "subtopic") && path(n.id)[0]?.id === contest).map(n => ({topic_id:n.id,name:n.name,discipline_id: path(n.id)[1]?.catalog_key ?? "",discipline_name:path(n.id)[1]?.name ?? ""})),
    videoMode,
    incidenceMeasure,
    difficulty,
    existing,
    performance,
    trailContest: contest,
    trailTopics: subjects.map(n => ({ topic_id: n.id, name: n.name, parent_id: n.parent_id })),
  };
  let previewText: string;
  try { previewText = buildPrompt(selected, context); }
  catch (e) { previewText = "Corrija o contexto antes de copiar: " + (e as Error).message; }
  async function copy() {
    try {
      if (selected.id === "trilhas" && (!contest || !subjects.length)) throw new Error("Selecione um concurso com assuntos antes de copiar.");
      if ((selected.id === "videos" || selected.id === "incidencia-json")) parseContest(existing);
      if (selected.target === "questions" && selected.id !== "simulados" && !topic)
        throw new Error("Selecione um assunto para preencher o identificador.");
      if (selected.id === "simulados" && !contest) throw new Error("Selecione um concurso para preparar os lotes do simulado.");
      if (selected.id === "desempenho" && !performance.trim())
        throw new Error("Gere e revise os dados agregados antes de copiar.");
      await navigator.clipboard.writeText(buildPrompt(selected, context));
      setStatus("Prompt copiado.");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function aggregate() {
    setBusy(true);
    setError("");
    try {
      const data = await productivityStore(user, demo).load();
      const ids = new Set(
        subjects.filter((n) => !topic || n.id === topic).map((n) => n.id),
      );
      const sessions = data.sessions.filter((s) => ids.has(s.topic_id));
      const results = data.results.filter((r) => ids.has(r.topic_id));
      const answers = data.answers.filter(
        (a) => a.study_questions && ids.has(a.study_questions.topic_id),
      );
      const answered =
        results.reduce((s, r) => s + r.answered, 0) + answers.length;
      const correct =
        results.reduce((s, r) => s + r.correct, 0) +
        answers.filter((a) => a.correct).length;
      setPerformance(
        JSON.stringify(
          {
            assuntos: ids.size,
            minutos_liquidos: Math.round(
              sessions.reduce((s, x) => s + x.seconds, 0) / 60,
            ),
            questoes: answered,
            acertos: correct,
            erros: answered - correct,
            intervalo: "Todo o histórico disponível da seleção",
          },
          null,
          2,
        ),
      );
      setStatus("Revise e edite os dados antes de copiar.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!editing || demo) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase!.rpc("prompt_publish", {
        template_ref: editing.id || null,
        title_value: editing.title,
        description_value: editing.description,
        body_value: editing.body,
        steps_value: editing.steps,
        example_value: editing.example,
        target_value: editing.target,
      });
      if (result.error) throw new Error(result.error.message);
      await load();
      setEditing(null);
      setStatus("Nova versão publicada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModulePage
      title="Central de Prompts e Inteligência Artificial"
      close={close}
      busy={busy}
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void publish();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Título
              <input
                required
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <label>
              Descrição
              <textarea
                required
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label>
              Instruções do prompt
              <textarea
                required
                rows={8}
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </label>
            <label>
              Passo a passo
              <textarea
                required
                value={editing.steps}
                onChange={(e) =>
                  setEditing({ ...editing, steps: e.target.value })
                }
              />
            </label>
            <label>
              Exemplo de uso
              <textarea
                required
                value={editing.example}
                onChange={(e) =>
                  setEditing({ ...editing, example: e.target.value })
                }
              />
            </label>
            <label>
              Importador
              <select
                value={editing.target}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    target: e.target.value as PromptTemplate["target"],
                  })
                }
              >
                <option value="none">Nenhum</option>
                <option value="contest">Concurso</option>
                <option value="cards">Flashcards</option>
                <option value="questions">Questões</option>
              </select>
            </label>
            <button className="primary">Publicar nova versão</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </fieldset>
        </form>
      ) : (
        <>
          <label>
            Modelo
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setError("");
                setStatus("");
              }}
            >
              {all.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} · v{t.revision}
                </option>
              ))}
            </select>
          </label>
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          <p>{selected.steps}</p>
          <p>{selected.example}</p>
          <div className="catalog-fields">
            <label>
              Concurso
              <select
                value={contest}
                onChange={(e) => {
                  const value = e.target.value;
                  setContest(value);
                  setDiscipline("");
                  setTopic("");
                  const node = nodes.find((n) => n.id === value);
                  setBoard(node?.board ?? "");
                  setRole(documents[value]?.role ?? "");
                  setExisting(
                    documents[value]
                      ? JSON.stringify(documents[value], null, 2)
                      : "",
                  );
                }}
              >
                <option value="">Não selecionado</option>
                {contests.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Banca
              <input value={board} onChange={(e) => setBoard(e.target.value)} />
            </label>
            <label>
              Cargo
              <input value={role} onChange={(e) => setRole(e.target.value)} />
            </label>
            <label>
              Disciplina
              <select
                value={discipline}
                onChange={(e) => {
                  setDiscipline(e.target.value);
                  setTopic("");
                }}
              >
                <option value="">Não selecionada</option>
                {disciplines.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assunto
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">Não selecionado</option>
                {subjects.map((n) => (
                  <option value={n.id} key={n.id}>
                    {path(n.id)
                      .map((x) => x.name)
                      .join(" / ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Autor
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
            <label>
              Obra
              <input value={work} onChange={(e) => setWork(e.target.value)} />
            </label>
            {selected.id === "videos" && <label>
              Cobertura das videoaulas
              <select id={`${promptId}-video-coverage`} name="video-coverage" value={videoMode} onChange={e => setVideoMode(e.target.value as "fixed" | "complete")}>
                <option value="fixed">Quantidade fixa</option>
                <option value="complete">Cobertura completa do edital</option>
              </select>
            </label>}
            {selected.id === "simulados" && <label>Lote do simulado<input type="number" min={1} max={100} value={mockBatch} onChange={e=>setMockBatch(Number(e.target.value))}/></label>}
            {selected.id !== "simulados" && selected.id !== "incidencia-json" && !(selected.id === "videos" && videoMode === "complete") && <label>
              Quantidade
              <input
                type="number"
                min={1}
                max={selected.target === "questions" ? 30 : 500}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>}
            <label>
              Dificuldade
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option>Fácil</option>
                <option>Média</option>
                <option>Difícil</option>
              </select>
            </label>
          </div>
          {selected.id === "videos" && videoMode === "complete" && <p role="status">A cobertura usa todos os assuntos e subassuntos ativos do JSON abaixo, incluindo assuntos com subassuntos. Não é limitada pelos filtros nem pela quantidade fixa. A meta e os IDs aparecem na prévia do prompt; URLs não verificadas não devem ser inventadas.</p>}
          {selected.id === "incidencia-json" && <label>Unidade para calcular incidência<select id={`${promptId}-incidence-measure`} name="incidence-measure" value={incidenceMeasure} onChange={e=>setIncidenceMeasure(e.target.value as "exams" | "questions")}><option value="exams">Provas com o assunto / provas analisadas</option><option value="questions">Questões do assunto / questões analisadas</option></select></label>}
          {(selected.id === "retificacao" || selected.id === "videos" || selected.id === "incidencia-json" || selected.id === "simulados") && (
            <label>
              JSON atual do concurso
              <textarea
                rows={8}
                value={existing}
                onChange={(e) => setExisting(e.target.value)}
              />
            </label>
          )}
          {selected.id === "desempenho" && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void aggregate()}
              >
                Gerar dados agregados
              </button>
              <label>
                Revise os dados antes de copiar
                <textarea
                  rows={8}
                  value={performance}
                  onChange={(e) => setPerformance(e.target.value)}
                />
              </label>
            </>
          )}
          <details>
            <summary>Prévia do prompt</summary>
            <pre className="prompt-preview">
              {previewText}
            </pre>
          </details>
          <div className="catalog-actions">
            <button className="primary" onClick={() => void copy()}>
              Copiar prompt
            </button>
            <a
              className="secondary"
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir ChatGPT
            </a>
            {selected.id === "incidencia-json" && openIncidence && <button className="secondary" onClick={openIncidence}>Abrir importador de incidência</button>}
            {libraryPromptIds.includes(selected.id) && openLibrary && <button className="secondary" onClick={openLibrary}>Abrir importador da Biblioteca</button>}
            {selected.id === "trilhas" && openTrails && <button className="secondary" onClick={openTrails}>Abrir importador de Trilhas</button>}
            {selected.target !== "none" && (
              <button
                className="secondary"
                onClick={() =>
                  openImporter(
                    selected.target as "contest" | "cards" | "questions",
                  )
                }
              >
                Abrir importador
              </button>
            )}
          </div>
          {selected.target === "none" && selected.id !== "trilhas" && selected.id !== "incidencia-json" && !libraryPromptIds.includes(selected.id) && (
            <p>
              A resposta é textual. Revise e cadastre os dados na seção
              correspondente.
            </p>
          )}
          {admin && (
            <div className="catalog-actions">
              <button
                className="secondary"
                onClick={() =>
                  setEditing({
                    id: "",
                    title: "",
                    description: "",
                    body: "",
                    steps: "",
                    example: "",
                    target: "none",
                    revision: 0,
                  })
                }
              >
                Cadastrar prompt
              </button>
              {custom.some((x) => x.id === selected.id) && (
                <button
                  className="secondary"
                  onClick={() => setEditing(selected)}
                >
                  Editar e criar versão
                </button>
              )}
            </div>
          )}
          <details>
            <summary>Exemplos aceitos pelos importadores</summary>
            <pre className="prompt-preview">
              {JSON.stringify(contractExamples, null, 2)}
            </pre>
          </details>
        </>
      )}
    </ModulePage>
  );
}
