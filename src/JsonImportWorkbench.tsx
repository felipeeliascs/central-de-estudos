import { useEffect, useId, useMemo, useState } from "react";
import { importTypes, type Field, type ImportType } from "./import-contracts";
import { contextInstructions, diagnoseImport, editPath, inspectImportInput, readPath, record, referenceChoices, repairInstructions, type ImportContext, type Issue } from "./import-assistance";

function download(text:string,name:string) {
  const url=URL.createObjectURL(new Blob([text],{type:"application/json;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const fieldId=(prefix:string,path:string)=>prefix+"-"+path;
type EditorProps={field:Field;path:string;value:unknown;document:unknown;type:ImportType;context:ImportContext;issues:Issue[];prefix:string;focusPath:string;change:(path:string,value:unknown,remove?:boolean)=>void};
function FieldEditor(props:EditorProps) {
  const {field,path,value,document,type,context,issues,prefix,change}=props;
  const id=fieldId(prefix,path);const errors=issues.filter(i=>i.path===path); const unknown=value===undefined;
  if(field.kind==="object")return <ObjectEditor {...props}/>;
  if(field.kind==="array")return <ArrayEditor {...props}/>;
  const choices=referenceChoices(type,path,document,context);
  let immutable=path==="$.id"&&type==="contest"&&!!context.contest;
  if(type==="contest"&&context.contest&&/\.(id|kind|parent|item)$/.test(path)) {
    const rowId=readPath(document,path.replace(/\.[^.]+$/,".id"));
    immutable=immutable||[...context.contest.items,...context.contest.resources].some(i=>i.id===rowId);
  }
  const control=field.kind==="boolean"||field.values||choices ?
    <select id={id} value={unknown?"__missing__":value===null?"__null__":String(value)} disabled={immutable} aria-invalid={!!errors.length} aria-describedby={errors.length?id+"-errors":undefined} onChange={e=>{
      const v=e.target.value;
      if(v==="__missing__"){change(path,undefined,true);return;}
      change(path,v==="__null__"?null:field.kind==="boolean"?v==="true":v);
    }}>
      <option value="__missing__">{field.required?"Selecione":"Não informado (omitir)"}</option>
      {field.nullable&&<option value="__null__">Sem referência (null)</option>}
      {field.kind==="boolean"?<><option value="true">Sim (true)</option><option value="false">Não (false)</option></>:
       field.values?field.values.map(v=><option key={String(v)} value={v===null?"__null__":String(v)}>{String(v)}</option>):
       choices?.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
      {!unknown&&value!==null&&choices&&!choices.some(c=>c.value===value)&&<option value={String(value)}>Referência não encontrada: {String(value)}</option>}
      {!unknown&&field.values&&!field.values.includes(value as string)&&<option value={String(value)}>Valor inválido: {String(value)}</option>}
    </select> :
    field.long ? <textarea id={id} rows={4} value={typeof value==="string"?value:value==null?"":String(value)} readOnly={immutable} aria-invalid={!!errors.length} aria-describedby={errors.length?id+"-errors":undefined} onChange={e=>change(path,e.target.value)}/> :
    <input id={id} type="text" inputMode={field.kind==="number"?"decimal":undefined} value={typeof value==="string"||typeof value==="number"?value:value==null?"":JSON.stringify(value)} readOnly={immutable} placeholder={field.required?"Obrigatório":"Opcional — não informado"} aria-invalid={!!errors.length} aria-describedby={errors.length?id+"-errors":undefined} onChange={e=>{
      const v=e.target.value;change(path,field.kind==="number"&&v.trim()!==""&&/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v)?Number(v):v);
    }}/>;
  return <div className={"json-field"+(errors.length?" invalid":"")}>
    <label htmlFor={id}>{field.label}{field.required?" *":""} <small>{path}</small></label>{control}
    {typeof value==="string"&&field.max!==undefined&&<small>{value.length}/{field.max} caracteres</small>}
    {immutable&&<small>Identidade existente preservada. Crie outro registro para alterar tipo ou vínculo.</small>}
    {errors.length>0&&<ul id={id+"-errors"}>{errors.map((error,i)=><li key={i}>{error.message}</li>)}</ul>}
    {field.kind==="id"&&!immutable&&(unknown||value==="")&&<button type="button" className="text-button" onClick={()=>change(path,crypto.randomUUID())}>Gerar ID deste novo registro</button>}
    {type==="video_batch"&&/resources\[\d+\]\.id$/.test(path)&&errors.some(e=>e.code==="conflict")&&<button type="button" className="secondary" onClick={()=>{if(window.confirm("Cadastrar esta aula com um novo ID, preservando o recurso anterior?"))change(path,"aula-"+crypto.randomUUID());}}>Usar novo ID para esta aula</button>}
    {!field.required&&!unknown&&<button type="button" className="text-button" onClick={()=>{if(window.confirm("Omitir o campo "+field.label+" deste rascunho? O JSON original continuará disponível."))change(path,undefined,true);}}>Omitir campo opcional</button>}
  </div>;
}
function ObjectEditor(props:EditorProps) {
  const {field,path,value,document,type,context,issues,prefix,focusPath,change}=props;
  if(!record(value))return <div id={fieldId(prefix,path)} tabIndex={-1} className="json-field invalid"><strong>{field.label}</strong><p>Esperado objeto.</p><button type="button" className="secondary" onClick={()=>change(path,{})}>Adicionar objeto vazio: {field.label}</button></div>;
  const extra=Object.keys(value).filter(key=>!Object.hasOwn(field.fields??{},key));
  return <div className="json-field-grid" id={fieldId(prefix,path)} tabIndex={-1}>
    {Object.entries(field.fields??{}).map(([key,child])=><FieldEditor key={key} field={child} path={path+"."+key} value={value[key]} document={document} type={type} context={context} issues={issues} prefix={prefix} focusPath={focusPath} change={change}/>)}
    {extra.map(key=><div className="json-field invalid" key={key} id={fieldId(prefix,path+"."+key)} tabIndex={-1}><strong>Campo desconhecido: {key}</strong><p>O valor foi preservado. Revise a origem antes de remover.</p>{/^[a-zA-Z_]\w*$/.test(key)&&!["__proto__","constructor","prototype"].includes(key)&&<button type="button" className="text-button" onClick={()=>{if(window.confirm("Remover somente o campo desconhecido "+key+" deste rascunho?"))change(path+"."+key,undefined,true);}}>Remover campo desconhecido</button>}</div>)}
  </div>;
}
function ArrayEditor(props:EditorProps) {
  const {field,path,value,document,type,context,issues,prefix,focusPath,change}=props;
  const [page,setPage]=useState(0);
  const [onlyErrors,setOnlyErrors]=useState(false);
  const [ignoredFocus,setIgnoredFocus]=useState("");
  if(!Array.isArray(value))return <div className="json-field" id={fieldId(prefix,path)} tabIndex={-1}><strong>{field.label}</strong><button type="button" className="text-button" onClick={()=>change(path,[])}>Adicionar lista vazia: {field.label}</button></div>;
  const focusIndex=focusPath.startsWith(path+"[")?Number(focusPath.slice(path.length+1).split("]")[0]):-1;
  const indices=value.map((_,i)=>i).filter(i=>!onlyErrors||issues.some(e=>e.path.startsWith(path+"["+i+"]")));
  const focusPosition=ignoredFocus===focusPath?-1:indices.indexOf(focusIndex);
  const current=Math.min(focusPosition>=0?Math.floor(focusPosition/10):page,Math.max(0,Math.ceil(indices.length/10)-1));
  const visible=indices.slice(current*10,current*10+10);
  return <section className="json-array" aria-label={field.label} id={fieldId(prefix,path)} tabIndex={-1}>
    <h5>{field.label} · {value.length}</h5>
    {issues.some(i=>i.path.startsWith(path+"["))&&<label className="check-label"><input type="checkbox" checked={onlyErrors} onChange={e=>{setOnlyErrors(e.target.checked);setPage(0);}}/>Mostrar apenas registros com erro</label>}
    <div className="json-table-scroll"><table className="json-edit-table"><thead><tr><th>Registro</th><th>Revisão dos campos</th></tr></thead><tbody>{visible.map(i=>{
      const entry=value[i],rowPath=path+"["+i+"]",rowErrors=issues.filter(e=>e.path.startsWith(rowPath));
      const title=record(entry)?entry.title??entry.name??entry.front??entry.statement??entry.item??entry.topic_id:"";
      return <tr key={i} className={rowErrors.length?"has-errors":""}><th scope="row">{i+1}<small>{typeof title==="string"?title.slice(0,100):""}</small><small>{rowPath}</small>{rowErrors.length>0&&<span>{rowErrors.length} erros</span>}</th><td><details open={rowErrors.length>0||focusPath.startsWith(rowPath)}><summary>Editar registro {i+1}</summary><FieldEditor {...props} field={field.entry!} path={rowPath} value={entry} document={document} type={type} context={context} issues={issues} prefix={prefix} focusPath={focusPath} change={change}/></details></td></tr>;
    })}</tbody></table></div>
    {!value.length&&<p className="muted">Nenhum registro informado. A tabela não inventa conteúdo ausente.</p>}
    {indices.length>10&&<div className="json-pagination"><button type="button" className="text-button" disabled={!current} onClick={()=>{setIgnoredFocus(focusPath);setPage(current-1);}}>Registros anteriores</button><span>Página {current+1} de {Math.ceil(indices.length/10)}</span><button type="button" className="text-button" disabled={(current+1)*10>=indices.length} onClick={()=>{setIgnoredFocus(focusPath);setPage(current+1);}}>Próximos registros</button></div>}
  </section>;
}
export function JsonImportWorkbench({raw,onChange,accepted,context={},disabled=false}:{
  raw:string;onChange:(raw:string)=>void;accepted:ImportType[];context?:ImportContext;disabled?:boolean;
}) {
  const prefix=useId();const input=useMemo(()=>inspectImportInput(raw),[raw]);
  const [source,setSource]=useState({latest:raw,original:raw});
  const [status,setStatus]=useState("");const [focusPath,setFocusPath]=useState("");
  const [report,setReport]=useState("");
  if(source.latest!==raw)setSource({latest:raw,original:raw});
  const correctType=!!input.type&&accepted.includes(input.type);
  const issues=useMemo(()=>{
    if(input.issues.length)return input.issues;
    if(!input.type)return [];
    if(!accepted.includes(input.type))return [{code:"wrong_type",path:"$.type",message:"Arquivo de "+importTypes[input.type].title+". Abra "+importTypes[input.type].destination+". Não altere o tipo para forçar a importação.",label:"Documento"}];
    return diagnoseImport(input.value,input.type,context);
  },[input,accepted,context]);
  useEffect(()=>{if(focusPath)document.getElementById(fieldId(prefix,focusPath.split("#")[0]))?.focus();},[focusPath,prefix]);
  if(!raw.trim())return null;
  function update(next:string) {
    setSource(current=>({latest:next,original:current.original}));setStatus("");setReport("");onChange(next);
  }
  function change(path:string,value:unknown,remove=false) {
    try {update(JSON.stringify(editPath(input.value,path,value,remove),null,2));}
    catch(e){setStatus((e as Error).message);}
  }
  async function copy(text:string,message:string) {
    try {await navigator.clipboard.writeText(text);setStatus(message);}catch{setReport(text);setStatus("Não foi possível copiar automaticamente. Selecione o texto abaixo.");}
  }
  const needsContext=(input.type==="video_batch"||input.type==="incidence_batch")&&!context.contest || input.type==="study_trail"&&!context.contestUuid;
  return <section className="json-workbench" aria-label="Revisão assistida do JSON">
    <h4>Revisão assistida do JSON</h4>
    <p>Tipo identificado: <strong>{input.type?importTypes[input.type].title:"não identificado"}</strong>. O original é preservado; corrigir nesta tabela não grava no banco.</p>
    {input.wrapped&&<div className="json-wrapper-notice"><p>Foi encontrado um único JSON dentro de uma cerca de código. Confira antes de usar. Nenhuma aspa, vírgula ou valor será adivinhado.</p><button type="button" className="secondary" disabled={disabled||!input.normalized||input.issues.length>0} onClick={()=>update(input.normalized!)}>Usar somente o JSON identificado</button></div>}
    <p role="status">{issues.length?issues.length+(issues.length===1?" erro encontrado.":" erros encontrados.")+" Revise os campos antes de gerar a prévia de gravação.":input.type?"Validação local concluída. Gere a prévia de gravação para revalidar destino, duplicatas, permissões e versão.":""}</p>
    {needsContext&&<p>Selecione o destino e gere uma prévia para carregar os IDs do edital. As referências só serão verificadas com esse contexto.</p>}
    {issues.length>0&&<details className="json-issues" open><summary>Erros por campo ({issues.length})</summary><ol>{issues.map((issue,i)=><li key={i}><strong>{issue.label}</strong><p>{issue.message}</p><small>{issue.path} · {issue.code}</small>{correctType&&!input.wrapped&&input.value!==undefined&&<button type="button" className="text-button" onClick={()=>setFocusPath(issue.path+"#"+crypto.randomUUID())}>Corrigir este campo</button>}</li>)}</ol></details>}
    {correctType&&record(input.value)&&!input.wrapped&&<fieldset disabled={disabled}><details className="json-review-fields" open={issues.length>0||!!focusPath}><summary>Revisar e corrigir em tabela</summary><ObjectEditor field={importTypes[input.type!].schema} path="$" value={input.value} document={input.value} type={input.type!} context={context} issues={issues} prefix={prefix} focusPath={focusPath} change={change}/></details></fieldset>}
    <div className="json-assist-actions">
      <button type="button" className="text-button" onClick={()=>{setReport(repairInstructions(input.type,issues,context));}}>Preparar pedido de correção para IA externa</button>
      {correctType&&<button type="button" className="text-button" onClick={()=>{setReport(contextInstructions(input.type!,context));}}>Preparar contrato e IDs do contexto</button>}
      <button type="button" className="text-button" disabled={!correctType||!!issues.length||!!input.wrapped||!!needsContext} onClick={()=>download(JSON.stringify(input.value,null,2),"importacao-revisada.json")}>Baixar JSON revisado</button>
      <button type="button" className="text-button" onClick={()=>download(source.original,"importacao-original.json")}>Baixar entrada original</button>
      {source.original!==raw&&<button type="button" className="text-button" disabled={disabled} onClick={()=>{if(window.confirm("Restaurar a entrada original e descartar somente as correções deste rascunho?"))update(source.original);}}>Restaurar entrada original</button>}
    </div>
    {report&&<details className="json-repair-report" open><summary>Texto para revisar e copiar</summary><p>Somente códigos de erro, limites e contexto do edital são incluídos. O arquivo completo e os conteúdos privados não são enviados automaticamente.</p><textarea aria-label="Pedido de correção ou contrato para IA externa" readOnly rows={9} value={report}/><button type="button" className="secondary" onClick={()=>void copy(report,"Texto copiado. Use na IA externa e revise a resposta antes de importar.")}>Copiar texto revisado</button></details>}
    {status&&<p role="status">{status}</p>}
  </section>;
}
