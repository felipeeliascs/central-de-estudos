import { useEffect, useId, useState } from "react";
import { supabase } from "./repository";
import type { ContestDocument } from "./contest-schema";

type Entry = { id: string; name: string; managed: boolean; listed: boolean; archived: boolean; items: number };
type Preview = { entry: Entry; doc: ContestDocument; available: boolean };
const migrationMessage = "A disponibilidade exige a migração 017. Use o editor de concursos enquanto ela não estiver instalada.";
function message(error: { code?: string }) {
  return ["PGRST202", "42883"].includes(error.code ?? "") ? migrationMessage :
    error.code === "42501" ? "Você precisa ser administrador com edição neste concurso." :
    "Não foi possível concluir. Atualize a lista e gere uma nova prévia antes de tentar novamente.";
}
export function AdminCatalogAvailability({ onCatalog }: { onCatalog: () => void }) {
  const sectionId = useId();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setRows(null); setError("");
    void (async () => {
      try {
        const result = await supabase!.rpc("study_admin_catalog_availability");
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error();
        if (active) setRows(result.data);
      } catch (e) { if (active) setError(message(e as { code?: string })); }
    })();
    return () => { active = false; };
  }, [revision]);
  async function prepare(entry: Entry) {
    if (busy) return;
    setBusy(true); setError(""); setStatus(""); setPreview(null);
    try {
      const result = await supabase!.rpc("study_catalog_document", { target: entry.id });
      if (result.error) throw result.error;
      const doc = result.data as ContestDocument;
      if (!doc || !Array.isArray(doc.items) || !Array.isArray(doc.resources)) throw new Error();
      if (doc.archived && !doc.listed) { setError("Reative o concurso no editor antes de disponibilizar."); return; }
      setPreview({ entry, doc, available: !doc.listed });
    } catch (e) { setError(message(e as { code?: string })); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview || busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await supabase!.rpc("study_admin_set_catalog_visibility", {
        target: preview.entry.id, expected_document: preview.doc,
        make_available: preview.available, request_id: crypto.randomUUID(),
      });
      if (result.error) throw result.error;
      setStatus(preview.available ? "Concurso disponível no catálogo para todos os usuários autenticados." :
        "Concurso retirado da descoberta. As seleções e os estudos existentes foram preservados.");
      setPreview(null); setRevision(n => n + 1);
    } catch (e) { setError(message(e as { code?: string })); setPreview(null); }
    finally { setBusy(false); }
  }
  const filtered = rows?.filter(r => r.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <section className="admin-card" aria-labelledby={sectionId}>
    <h2 id={sectionId}>Disponibilizar concursos</h2>
    <p>Disponibilize seus concursos no catálogo de todos os usuários autenticados. Cada pessoa escolhe quais adicionar a Meus concursos; ninguém é inscrito automaticamente.</p>
    <p className="muted">Somente a estrutura e os recursos do catálogo são compartilhados. Anotações, materiais pessoais e progresso continuam privados.</p>
    <div className="admin-form">
      <label>Buscar concurso para disponibilizar<input type="search" value={search} maxLength={180} onChange={e => setSearch(e.target.value)} /></label>
      <button className="secondary" disabled={busy} onClick={() => { setPreview(null); setRevision(n => n + 1); }}>Atualizar disponibilidade</button>
      <button className="secondary" onClick={onCatalog}>Abrir editor de concursos</button>
    </div>
    {!rows && !error && <p role="status">Carregando disponibilidade…</p>}
    {filtered && (filtered.length ? <ul className="admin-list">{filtered.map(entry => <li key={entry.id}>
      <div><strong>{entry.name}</strong><small>{entry.archived ? "Arquivado" : entry.listed ? "Disponível para todos" : "Restrito"} · {entry.items} itens{!entry.managed ? " · Ainda fora do catálogo" : ""}</small></div>
      <button className="secondary" disabled={busy || (entry.archived && !entry.listed)} aria-label={`${entry.listed ? "Retirar do catálogo" : "Disponibilizar"}: ${entry.name}`} onClick={() => void prepare(entry)}>{entry.listed ? "Retirar do catálogo" : "Disponibilizar para todos"}</button>
    </li>)}</ul> : <p>Nenhum concurso encontrado com permissão de edição.</p>)}
    {preview && <section className="admin-availability-preview" aria-label="Prévia de disponibilidade">
      <h3>{preview.available ? "Disponibilizar para todos?" : "Retirar do catálogo?"}</h3>
      <p><strong>{preview.doc.name}</strong> · {preview.doc.items.length} itens · {preview.doc.resources.length} recursos do catálogo.</p>
      {!preview.entry.managed && <p>Este concurso será vinculado ao catálogo com seus IDs atuais. Materiais pessoais não serão convertidos nem compartilhados.</p>}
      <p>{preview.available ? "O concurso aparecerá no catálogo para contas autenticadas. Isso não publica o site nem altera inscrições existentes." : "Novos usuários deixarão de descobrir este concurso. Quem já o selecionou mantém acesso e histórico."}</p>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={() => setPreview(null)}>Cancelar disponibilidade</button>
        <button className="primary" disabled={busy} onClick={() => void confirm()}>{busy ? "Salvando…" : preview.available ? "Confirmar disponibilização" : "Confirmar retirada do catálogo"}</button>
      </div>
    </section>}
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
  </section>;
}
