import { useId, useState } from "react";
import { maxImportBytes } from "./import-json";
import { libraryContract, parseLibraryBatch, materialFromEntry, type LibraryEntry } from "./library-import";
import { possibleDuplicates } from "./library";
import type { Material, Snapshot } from "./domain";
import { supabase, type Repository } from "./repository";
type Decision = { action: "create" | "use" | "update"; existing: string };
export function LibraryImporter({ snapshot, repo, refresh }: { snapshot: Snapshot; repo: Repository; refresh: () => Promise<void> }) {
  const id = useId(); const [raw,setRaw] = useState(""); const [entries,setEntries] = useState<LibraryEntry[] | null>(null);
  const [decisions,setDecisions] = useState<Record<string,Decision>>({});
  const [target,setTarget] = useState(""); const [error,setError] = useState(""); const [status,setStatus] = useState(""); const [busy,setBusy] = useState(false);
  const candidates = (entry: LibraryEntry) => {
    const m = materialFromEntry(entry,repo.user); return snapshot.materials.filter(existing => existing.library_key === entry.id || possibleDuplicates(m,[existing]).length);
  };
  function preview() { setError(""); setStatus(""); try { const next = parseLibraryBatch(raw); setEntries(next); setDecisions({}); } catch(e) { setError((e as Error).message); } }
  const unresolved = entries?.filter(e => candidates(e).length && !decisions[e.id]).length ?? 0;
  async function confirm() {
    if (!entries || unresolved || busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const plan = entries.map(entry => {
        const choice = decisions[entry.id] ?? { action: "create", existing: "" };
        const existing = snapshot.materials.find(m => m.id === choice.existing);
        return { entry, action: choice.action, existing_id: existing?.id ?? null, expected_updated_at: (existing as Material & { updated_at?: string })?.updated_at ?? null };
      });
      if (repo.demo) {
        // The demo has no transaction API: do not pretend batch atomicity.
        throw new Error("A importação em lote exige o banco de teste conectado. Use o cadastro individual na demonstração.");
      }
      const result = await supabase!.rpc("study_import_library_batch", { operations: plan, target: target || null, request_id: crypto.randomUUID() });
      if (result.error) throw result.error;
      await refresh(); setEntries(null);
      setStatus("Lote aplicado. Materiais e vínculos atualizados sem alterar o progresso.");
    } catch(e) { setError((e as { code?: string }).code === "PGRST202" ? "A importação exige a migração 018." : (e as Error).message || "Não foi possível importar. Gere a prévia novamente."); }
    finally { setBusy(false); }
  }
  return <section className="admin-card"><h2>Importar materiais do acervo</h2><p>Use library_batch 1.0. Arquivos PDF e imagens são enviados no cadastro individual. O lote não muda contratos de concursos, videoaulas, questões ou flashcards.</p>
    <details><summary>Contrato e prompt para IA externa</summary><pre>{libraryContract}</pre><p>Peça à IA externa: produza somente esse JSON, com IDs estáveis, um material por entrada, sem cercas de código e sem campos extras. Use apenas conteúdo e fontes fornecidos; não invente autor, obra, edição ou referências. Se não houver evidência, omita os campos opcionais. Formatos aceitos: text, link e youtube. Não inclua dados pessoais, chaves ou arquivos binários.</p></details>
    <label htmlFor={id+"-file"}>Arquivo JSON de materiais<input id={id+"-file"} name="library-json-file" type="file" accept=".json,application/json" disabled={busy} onChange={async e => { const file=e.target.files?.[0]; if (!file) return; setError(""); try { if (file.size>maxImportBytes) throw new Error("Limite de 512 KiB."); setRaw(await file.text()); setEntries(null); } catch(e) { setError((e as Error).message); } }} /></label>
    <label htmlFor={id+"-raw"}>Ou cole o JSON de materiais<textarea id={id+"-raw"} name="library-json" value={raw} rows={8} disabled={busy} onChange={e => { setRaw(e.target.value); setEntries(null); }} /></label>
    <label>Vincular lote a um conteúdo (opcional)<select value={target} disabled={busy} onChange={e => { setTarget(e.target.value); setEntries(null); }}><option value="">Somente no acervo, sem concurso</option>{snapshot.nodes.filter(n=>!n.catalog_archived).map(n => <option key={n.id} value={n.id}>{n.kind} · {n.name}</option>)}</select></label>
    <button className="secondary" disabled={busy} onClick={preview}>Gerar prévia de materiais</button>
    {entries && <><h3>Prévia · {entries.length} materiais</h3><ol className="library-import-preview">{entries.map((entry,index) => {
      const matches = candidates(entry); const decision = decisions[entry.id];
      return <li key={entry.id}><strong>{entry.title}</strong><small>$.materials[{index}] · {entry.id} · {entry.section}</small>
        {matches.length ? <><p>Possível duplicidade. Compare fonte, conteúdo e versão; escolha uma ação.</p><label>Ação para {entry.title}<select value={decision ? decision.action+":"+decision.existing : ""} onChange={e => { const [action,...rest]=e.target.value.split(":"); if (!action) { setDecisions(d => { const next={...d}; delete next[entry.id]; return next; }); return; } setDecisions(d=>({...d,[entry.id]:{ action: action as Decision["action"],existing: rest.join(":") }})); }}><option value="">Selecione uma ação</option>{matches.flatMap(m => [<option key={"use"+m.id} value={"use:"+m.id}>Utilizar existente: {m.title}</option>, ...(m.owner_id===repo.user && !m.catalog_managed && !m.file_path ? [<option key={"update"+m.id} value={"update:"+m.id}>Atualizar existente em todos os vínculos: {m.title}</option>] : [])])}<option value="create:">Manter ambos como distintos</option></select></label></> : <p>Novo material</p>}
      </li>;
    })}</ol><p>{unresolved ? unresolved+" duplicidades aguardam decisão." : "Confira as decisões antes de salvar. Atualizações refletem em todos os vínculos."}</p>
      <button className="primary" disabled={busy || !!unresolved || snapshot.libraryReady === false} onClick={() => { if (Object.values(decisions).some(d=>d.action==="update") && !window.confirm("Atualizar os materiais escolhidos em todos os vínculos? O progresso será preservado.")) return; void confirm(); }}>Confirmar importação de materiais</button><button className="text-button" onClick={()=>setEntries(null)} disabled={busy}>Voltar e corrigir materiais</button></>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
