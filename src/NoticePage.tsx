import { useEffect, useState } from "react";
import { ModulePage } from "./ModulePage";
import { officialPortal } from "./library";
import { supabase } from "./repository";
import type { Snapshot } from "./domain";
import type { ContestDocument, SyllabusItem } from "./contest-schema";
export function NoticePage({ id, snapshot, demo, close, study }: { id: string; snapshot: Snapshot; demo: boolean; close: () => void; study: (id: string) => void }) {
  const [doc,setDoc]=useState<ContestDocument | null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true);
  const root=snapshot.nodes.find(n=>n.id===id && n.kind==="contest");
  useEffect(()=>{
    let active=true; setDoc(null); setError(""); setLoading(true);
    void (async()=>{
      try {
        if(!root) throw new Error("Concurso não encontrado ou sem acesso.");
        let value: ContestDocument | null=null;
        if(!demo) { const result=await supabase!.from("study_catalog").select("document").eq("contest_id",id).maybeSingle(); if(result.error) throw result.error; value=result.data?.document ?? null; }
        if(!value) {
          const items: SyllabusItem[]=[];
          const visit=(parent: string)=>snapshot.nodes.filter(n=>n.parent_id===parent).forEach(n=>{ if(n.kind!=="contest") items.push({ id:n.id,parent:n.parent_id===id?null:n.parent_id,kind:n.kind,name:n.name }); visit(n.id); });
          visit(id); value={ schema_version:"1.0",type:"contest",id,name:root.name,board:root.board,notice:{version:1},items,resources:[] };
        }
        if(active) setDoc(value);
      } catch(e) { if(active) setError((e as Error).message || "Não foi possível consultar o edital."); }
      finally { if(active) setLoading(false); }
    })();
    return()=>{ active=false; };
  // Snapshot is stable while the page is open; refresh changes rerun the query.
  },[id,demo,root,snapshot.nodes]);
  function outline(parent: string | null) {
    return <ul className="notice-tree">{doc?.items.filter(i=>i.parent===parent).map(item=><li key={item.id}><details><summary><span>{item.name}{item.archived?" · Arquivado":""}</span><small>{item.questions!==undefined?item.questions+" questões":""}{item.weight!==undefined?" · Peso "+item.weight:""}</small></summary>
      {outline(item.id)}
      {doc.resources.filter(r=>r.item===item.id && r.kind==="bibliography" && !r.archived).map(r=><p key={r.id} className="notice-bibliography"><strong>{r.title}</strong>{r.author?" · "+r.author:""}{r.edition?" · "+r.edition:""}{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer">Consultar obra ↗</a>}</p>)}
    </details></li>)}</ul>;
  }
  const portal=doc?officialPortal(doc):"";
  return <ModulePage title="Abrir Edital" close={close}>
    {loading && <p role="status">Carregando edital…</p>}{error && <p role="alert">{error}</p>}
    {doc && <article className="notice-page"><header><h2>{doc.name}</h2><p>O que preciso estudar? Consulte o conteúdo programático e as exigências documentadas.</p><button className="secondary" onClick={()=>study(id)}>Estudar este concurso</button></header>
      <dl className="notice-facts">{[["Órgão",doc.organization],["Banca",doc.board],["Cargo",doc.role],["Data da prova",doc.exam_date],["Questões",doc.questions],["Peso",doc.weight]].filter(([,value])=>value!==undefined && value!=="").map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section className="notice-official"><h3>Página oficial</h3>{portal?<a href={portal} target="_blank" rel="noopener noreferrer">Acessar página oficial do concurso ↗</a>:<p className="muted">Página oficial não cadastrada. Um administrador pode incluí-la na edição do concurso.</p>}</section>
      <h3>Edital verticalizado</h3><p className="muted">Expanda disciplinas, assuntos e subassuntos. Pesos, questões e bibliografia aparecem somente quando cadastrados.</p>{outline(null)}
      {!doc.items.length && <p>Nenhum conteúdo programático cadastrado.</p>}
    </article>}
  </ModulePage>;
}
