import { parseImportJson } from "./import-json";
import { safeUrl } from "./domain";
import type { ContestDocument } from "./contest-schema";
import type { Incidence } from "./productivity-data";

export const incidenceBatchContract = 'incidence_batch 1.0: objeto com exatamente schema_version:"1.0", type:"incidence_batch", contest_id (ID externo exato do edital), board (banca exata do edital), measure ("exams" ou "questions"), period_start e period_end (AAAA-MM-DD), sample (inteiro de 1 a 1000000), entries e unavailable. entries contém objetos com exatamente item (ID externo exato de topic/subtopic), occurrences (inteiro de 0 a sample) e source_url (HTTPS verificada, até 2000 caracteres). unavailable contém item e reason (texto de 1 a 180 caracteres) para assuntos sem evidência. Não envie percentuais, nomes como IDs, UUIDs, campos extras, texto antes/depois ou cercas Markdown. Até 1500 assuntos e 512 KiB. Ausência de evidência não é ocorrência zero. A amostra, unidade e período são comuns ao lote.';
export type IncidenceBatch = { schema_version:"1.0"; type:"incidence_batch"; contest_id:string; board:string; measure:"exams"|"questions"; period_start:string; period_end:string; sample:number; entries:{item:string;occurrences:number;source_url:string}[]; unavailable:{item:string;reason:string}[] };
export type IncidenceImportContext = { target:string; doc:ContestDocument; itemMap:Record<string,string>; expected:Incidence[] };
export type IncidenceImportRow = { item:string; name:string; path:string; status:string; error:boolean; value?:Incidence };
function fail(path:string,message:string):never {throw new Error(path+": "+message);}
function object(value:unknown,path:string,keys:string[]) {
 if(!value||typeof value!=="object"||Array.isArray(value)) return fail(path,"esperado objeto");
 const result=value as Record<string,unknown>;
 for(const key of Object.keys(result)) if(!keys.includes(key)) fail(path+"."+key,"campo desconhecido");
 return result;
}
function text(value:unknown,path:string,max=180):string {
 if(typeof value!=="string"||!value.trim()||value.length>max) return fail(path,`esperado texto de 1 a ${max} caracteres`);
 return value;
}
function date(value:unknown,path:string) {
 const day=text(value,path,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day.startsWith("0000")||!Number.isFinite(Date.parse(day+"T00:00:00Z"))||new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day) fail(path,"use uma data válida AAAA-MM-DD");
 return day;
}
function integer(value:unknown,path:string,max:number,min=0):number {
 if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max) return fail(path,`use um inteiro entre ${min} e ${max}`);
 return value;
}
export function eligibleIncidenceItems(doc:ContestDocument) {
 const map=new Map(doc.items.map(x=>[x.id,x]));
 return doc.items.filter(x=>{
  if(x.kind!=="topic"&&x.kind!=="subtopic") return false;
  let item:typeof x|undefined=x;
  while(item) { if(item.archived)return false; item=item.parent?map.get(item.parent):undefined; }
  return true;
 });
}
export function previewIncidenceBatch(raw:string,context:IncidenceImportContext) {
 const input=object(parseImportJson(raw),"$",["schema_version","type","contest_id","board","measure","period_start","period_end","sample","entries","unavailable"]);
 if(input.schema_version!=="1.0") fail("$.schema_version","use 1.0");
 if(input.type!=="incidence_batch") fail("$.type","use incidence_batch");
 if(input.contest_id!==context.doc.id) fail("$.contest_id","use o ID externo exato do edital de destino");
 if(context.doc.archived) fail("$.contest_id","reative o concurso antes de importar");
 const board=text(input.board,"$.board");
 if(!context.doc.board?.trim()||board!==context.doc.board) fail("$.board","use a banca exata do edital; corrija o catálogo se necessário");
 if(input.measure!=="exams"&&input.measure!=="questions") fail("$.measure","use exams ou questions");
 const measure=input.measure as "exams"|"questions";
 const start=date(input.period_start,"$.period_start"),end=date(input.period_end,"$.period_end");
 if(end<start) fail("$.period_end","não pode ser anterior ao início do período");
 const sample=integer(input.sample,"$.sample",1000000,1);
 if(!Array.isArray(input.entries)||input.entries.length>1500) fail("$.entries","esperada lista com até 1500 registros");
 if(!Array.isArray(input.unavailable)||input.unavailable.length>1500) fail("$.unavailable","esperada lista com até 1500 registros");
 const entries=input.entries as unknown[],unavailable=input.unavailable as unknown[];
 if(entries.length+unavailable.length>1500) fail("$","limite de 1500 assuntos no lote");
 const eligible=eligibleIncidenceItems(context.doc);
 const seen=new Set<string>();
 const rows:IncidenceImportRow[]=[];
 for(const [kind,list] of [["entries",entries],["unavailable",unavailable]] as const) list.forEach((rawEntry,i)=>{
  const path=`$.${kind}[${i}]`;
  let item="";
  try {
   const e=object(rawEntry,path,kind==="entries"?["item","occurrences","source_url"]:["item","reason"]);
   item=text(e.item,path+".item",80);
   const topic=eligible.find(x=>x.id===item);
   if(!topic||!context.itemMap[item]) fail(path+".item","referência inválida ou arquivada; use o ID externo do assunto/subassunto");
   if(seen.has(item)) fail(path+".item","assunto duplicado no lote");
   seen.add(item);
   if(kind==="unavailable") {
    const reason=text(e.reason,path+".reason");
    rows.push({item,name:topic.name,path,status:"Sem evidência · "+reason+" · registro anterior preservado",error:false});
    return;
   }
   const occurrences=integer(e.occurrences,path+".occurrences",sample);
   const source=text(e.source_url,path+".source_url",2000);
   try {safeUrl(source);} catch {fail(path+".source_url","use URL HTTPS sem credenciais");}
   const value:Incidence={topic_id:context.itemMap[item],board,measure,sample,occurrences,source_url:source,period_start:start,period_end:end};
   const prior=context.expected.find(x=>x.topic_id===value.topic_id&&x.board===board);
   const same=prior&&(["measure","sample","occurrences","source_url","period_start","period_end"] as const).every(key=>prior[key]===value[key]);
   rows.push({item,name:topic.name,path,status:same?"Duplicata · preservada":prior?"Atualização · substitui a evidência anterior desta banca":"Nova evidência",error:false,value});
  } catch(error) { rows.push({item,name:eligible.find(x=>x.id===item)?.name??"Assunto inválido",path,status:(error as Error).message,error:true}); }
 });
 const missing=eligible.filter(x=>!seen.has(x.id)).map(x=>({item:x.id,name:x.name}));
 return {batch:input as unknown as IncidenceBatch,rows,missing,valid:rows.every(x=>!x.error)&&rows.some(x=>x.value),changes:rows.filter(x=>x.value&&!x.status.startsWith("Duplicata")).length};
}
