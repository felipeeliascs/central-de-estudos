import { useId, useState } from "react";
import { supabase } from "./repository";
import type { Node } from "./domain";
import { maxImportBytes } from "./import-json";
import { incidenceSummary } from "./incidence";
import { previewIncidenceBatch, type IncidenceImportContext } from "./incidence-import";

export function IncidenceImporter({nodes,onSaved}:{nodes:Node[];onSaved:()=>Promise<void>}) {
 const id=useId();
 const [target,setTarget]=useState("");
 const [raw,setRaw]=useState("");
 const [preview,setPreview]=useState<ReturnType<typeof previewIncidenceBatch>|null>(null);
 const [context,setContext]=useState<IncidenceImportContext|null>(null);
 const [reviewed,setReviewed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function run(action:()=>Promise<void>) {
  setBusy(true);setError("");setMessage("");
  try {await action();} catch(e) {setError((e as Error).message);} finally {setBusy(false);}
 }
 function generate() {
  void run(async()=>{
   if(!target) throw new Error("Selecione o concurso de destino.");
   const result=await supabase!.rpc("study_incidence_import_context",{target});
   if(result.error) {
    if(result.error.code==="PGRST202"||result.error.code==="42883") throw new Error("A importação de incidência depende da migração 016 neste ambiente. O cadastro manual permanece disponível.");
    throw new Error(result.error.message);
   }
   if(!result.data?.doc||!result.data.itemMap||!Array.isArray(result.data.expected)) throw new Error("Não foi possível obter o edital e a incidência atual.");
   const ctx={target,...result.data} as IncidenceImportContext;
   const next=previewIncidenceBatch(raw,ctx);
   setContext(ctx);setPreview(next);setReviewed(false);
  });
 }
 function save() {
  if(!preview?.valid||!context||!reviewed||!preview.changes) return;
  void run(async()=>{
   const result=await supabase!.rpc("study_apply_incidence_batch",{target:context.target,batch:preview.batch,expected_document:context.doc,expected_incidence:context.expected,request_id:crypto.randomUUID()});
   if(result.error) throw new Error(result.error.message);
   setPreview(null);setContext(null);setReviewed(false);
   setMessage(`Incidência importada: ${result.data} registros alterados. Materiais e progresso preservados.`);
   await onSaved();
  });
 }
 const errors=preview?.rows.filter(x=>x.error).length??0;
 return <section className="catalog-entry" aria-label="Importar incidência JSON">
  <h3>Importar incidência JSON</h3>
  <p>Use o prompt “Calcular incidência por assunto · JSON”. Revise fontes e contagens antes de confirmar; a plataforma não verifica o conteúdo das fontes automaticamente.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {message&&<p role="status" className="success">{message}</p>}
  <fieldset disabled={busy}>
  {preview?<>
   <h4>Prévia da incidência</h4>
   <p role="status">{preview.rows.length} assuntos declarados · {preview.changes} alterações · {errors} erros.</p>
   <p>{preview.batch.board} · {preview.batch.period_start} a {preview.batch.period_end} · amostra: {preview.batch.sample} {preview.batch.measure==="exams"?"provas":"questões"}.</p>
   {errors>0&&<p role="alert" className="error">Corrija as linhas com erro antes de salvar. <a href={`#${id}-row-${preview.rows.findIndex(x=>x.error)}`}>Ir ao primeiro erro</a></p>}
   <ul className="import-preview">{[true,false].flatMap(hasError=>preview.rows.map((row,i)=>row.error===hasError&&<li key={i} id={`${id}-row-${i}`} tabIndex={-1} className={row.error?"import-row-error":""}>
    <strong>{row.name} ({row.item})</strong><p>{row.status}</p><small>{row.path}</small>
    {row.value&&<p>{incidenceSummary(row.value)} · <a href={row.value.source_url} target="_blank" rel="noreferrer">Conferir fonte</a></p>}
   </li>))}</ul>
   {preview.missing.length>0&&<details><summary>{preview.missing.length} assuntos não informados · registros anteriores preservados</summary><ul>{preview.missing.map(x=><li key={x.item}>{x.name} ({x.item})</li>)}</ul></details>}
   <p>Atualizações substituem a evidência desta banca para o assunto. Duplicatas, assuntos sem evidência e assuntos omitidos preservam os registros anteriores. Frequência histórica não é probabilidade da próxima prova.</p>
   <label className="check-label" htmlFor={`${id}-reviewed`}><input id={`${id}-reviewed`} name="incidence-reviewed" type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Conferi as fontes, a unidade, o período e as contagens da amostra.</label>
   <p id={`${id}-status`} role="status">{errors?`${errors} erros impedem salvar; nenhuma evidência foi gravada.`:!preview.valid?"Nenhuma evidência válida para importar.":preview.changes===0?"Nenhuma alteração: as evidências já estão cadastradas.":"Confira as atualizações e confirme a revisão das fontes para salvar."}</p>
   <div className="form-actions"><button type="button" className="secondary" onClick={()=>{setPreview(null);setContext(null);setReviewed(false);}}>Voltar e corrigir JSON</button><button type="button" className="primary" aria-describedby={`${id}-status`} disabled={!preview.valid||!reviewed||preview.changes===0} onClick={save}>Confirmar e salvar incidência</button></div>
  </>:<>
   <label htmlFor={`${id}-target`}>Concurso de destino da incidência<select id={`${id}-target`} name="incidence-target" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecione</option>{nodes.filter(n=>n.kind==="contest"&&!n.catalog_archived).map(n=><option value={n.id} key={n.id}>{n.name}</option>)}</select></label>
   <label htmlFor={`${id}-file`}>Arquivo JSON de incidência<input id={`${id}-file`} name="incidence-file" type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>maxImportBytes)throw new Error("$: limite de 512 KiB");setRaw(await file.text());});}}/></label>
   <label htmlFor={`${id}-raw`}>Ou cole o JSON de incidência<textarea id={`${id}-raw`} name="incidence-json" spellCheck={false} rows={12} value={raw} onChange={e=>setRaw(e.target.value)}/></label>
   <button type="button" className="primary" onClick={generate}>Gerar prévia da incidência</button>
  </>}
  </fieldset>
 </section>;
}
