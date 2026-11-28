import { useEffect, useState } from "react";
import { appliesTo } from "./library";
import { supabase, type Repository } from "./repository";
import type { Material, Snapshot } from "./domain";
type Equivalence = { first_topic: string; second_topic: string; coverage?: "full" | "partial"; review_notes?: string };
export function StudyLibraryLinks({ snapshot,repo,selected,link,refresh,prompts,library }: {
  snapshot: Snapshot; repo: Repository; selected: string; link: (m: Material,id: string,active: boolean)=>Promise<boolean>; refresh:()=>Promise<void>; prompts:()=>void; library:()=>void;
}) {
  const [links,setLinks]=useState<Equivalence[]>([]); const [choice,setChoice]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true; setLinks([]); setError(""); setChoice("");
    if(repo.demo || !supabase) return;
    void (async()=>{ try { const result=await supabase!.from("study_topic_equivalences").select("*").or("first_topic.eq."+selected+",second_topic.eq."+selected); if(result.error) throw result.error; if(active) setLinks(result.data ?? []); } catch { if(active) setError("Não foi possível consultar sugestões de equivalências."); } })();
    return()=>{ active=false; };
  },[selected,repo.demo]);
  const current=snapshot.materials.filter(m=>!m.catalog_archived && appliesTo(m,selected,snapshot.nodes,snapshot.materialLinks,repo.user));
  const other=(e: Equivalence)=>e.first_topic===selected?e.second_topic:e.first_topic;
  const candidates=snapshot.materials.filter(m=>!m.catalog_archived && !current.some(c=>c.id===m.id));
  async function reuse(e: Equivalence) {
    if(!window.confirm("Reaproveitar somente as etapas concluídas deste assunto integralmente equivalente? Confira profundidade e exigências do edital de destino. Pesos, prioridades, questões, sessões e revisões não serão copiados.")) return;
    setBusy(true); setError("");
    try {
      const expected=snapshot.checks.filter(c=>c.user_id===repo.user && c.topic_id===other(e)).sort((a,b)=>a.step-b.step).map(c=>({ step:c.step,done:c.done }));
      const result=await supabase!.rpc("study_reuse_equivalent_progress",{ source_topic:other(e),target_topic:selected,expected_checks:expected });
      if(result.error) throw result.error; await refresh();
    } catch(e) { setError((e as Error).message || "Não foi possível reaproveitar. Atualize os dados."); }
    finally { setBusy(false); }
  }
  return <details className="study-library-context" open={!current.length}>
    <summary>Biblioteca deste conteúdo · {current.length} materiais disponíveis</summary>
    {!current.length && <p className="muted">Ainda não há materiais vinculados a este conteúdo.</p>}
    <div className="library-toolbar"><label>Material existente para este conteúdo<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Selecione no acervo</option>{candidates.map(m=><option key={m.id} value={m.id}>{m.title} · {m.section}</option>)}</select></label><button className="secondary" disabled={!choice || busy || snapshot.libraryReady===false} onClick={async()=>{ const m=candidates.find(m=>m.id===choice); if(!m) return; setBusy(true); if(await link(m,selected,true)) setChoice(""); setBusy(false); }}>Vincular material existente</button>
      <button className="text-button" onClick={library}>Gerenciar ou importar na Biblioteca</button><button className="text-button" onClick={prompts}>Gerar conteúdo com prompts</button>
    </div>
    {links.length>0 && <section><h3>Reaproveitamento entre concursos</h3><p>Somente equivalências confirmadas são consideradas; materiais continuam sujeitos às permissões de acesso.</p>
      <ul className="equivalence-list">{links.map(e=><li key={other(e)}><strong>{snapshot.nodes.find(n=>n.id===other(e))?.name || "Assunto relacionado"}</strong><span className="catalog-badge">{e.coverage==="full"?"Integral revisada":"Parcial / a revisar"}</span><p>{e.review_notes || "Verifique os limites e complementos do edital de destino."}</p>
        <ul>{candidates.filter(m=>appliesTo(m,other(e),snapshot.nodes,snapshot.materialLinks,repo.user)).map(m=><li key={m.id}>{m.title}<button className="text-button" disabled={busy || snapshot.libraryReady===false} onClick={async()=>{ setBusy(true); await link(m,selected,true); setBusy(false); }}>Aproveitar material neste assunto</button></li>)}</ul>
        <small>{snapshot.checks.filter(c=>c.user_id===repo.user && c.topic_id===other(e) && c.done).length}/5 etapas concluídas na origem. O domínio exige evidências próprias de questões e revisões.</small>
        {e.coverage==="full" && e.review_notes && <button className="text-button" disabled={busy} onClick={()=>void reuse(e)}>Revisar e reaproveitar etapas concluídas</button>}
      </li>)}</ul>
    </section>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
