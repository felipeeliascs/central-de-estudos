import { importQuestions } from "./questions";
import { parseDeck } from "./flashcards";
import { parseImportJson } from "./import-json";
import { safeUrl, youtubeId, isUuid, type Node } from "./domain";
import { importTypes, knownImportType, contractInstructions, type Field, type ImportType } from "./import-contracts";
import { parseContest, compareContest, type ContestDocument } from "./contest-schema";
import { previewVideoBatch } from "./video-batch";
import { previewIncidenceBatch, type IncidenceImportContext } from "./incidence-import";
import { parseLibraryBatch } from "./library-import";
import { validateTrailTopics } from "./trails";
export type ImportContext = { contest?: ContestDocument | null; contestUuid?: string; nodes?: Node[]; incidence?: IncidenceImportContext | null };
export type Issue = { code:string; path:string; message:string; label:string };
export type InputInspection = { value?: unknown; type:ImportType | null; normalized?:string; wrapped:boolean; issues:Issue[] };
export const record = (v:unknown): v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
export function inspectImportInput(raw:string):InputInspection {
  if(!raw.trim()) return {type:null,wrapped:false,issues:[]};
  // A single exact Markdown fence can be offered for confirmation, never silently extracted.
  const fenced=/^\uFEFF?\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(raw);
  const source=fenced?fenced[1]:raw;
  try {
    // Absolute upper bound before type detection; smaller per-contract bounds follow.
    const value=parseImportJson(source,1048576);
    const type=record(value)?knownImportType(value.type):null;
    const issues:Issue[]=[];
    if(!record(value)) issues.push({code:"type",path:"$",message:"Esperado um único objeto JSON.",label:"Documento"});
    else if(!type) issues.push({code:"unknown_type",path:"$.type",message:"Tipo ausente ou desconhecido. Use um dos contratos de importação da Central.",label:"Documento"});
    if(type && new TextEncoder().encode(source).length>importTypes[type].maxBytes)
      issues.push({code:"size",path:"$",message:"Arquivo acima do limite de "+importTypes[type].maxBytes/1024+" KiB para "+importTypes[type].title+".",label:"Documento"});
    return {value,type,normalized:fenced?source:undefined,wrapped:!!fenced,issues};
  } catch(e) { return {type:null,wrapped:!!fenced,issues:[{code:"syntax",path:"$",message:(e as Error).message,label:"Documento"}]}; }
}
const labelAt=(doc:Record<string,unknown>,path:string) => {
  const match=/^\$\.([a-z_]+)\[(\d+)\]/.exec(path);
  if(!match) return "Documento";
  const row=Array.isArray(doc[match[1]])?(doc[match[1]] as unknown[])[Number(match[2])]:null;
  const name=record(row)?row.title??row.name??row.front??row.statement??row.item??row.topic_id:"";
  return "Entrada "+(Number(match[2])+1)+(typeof name==="string"&&name?" · "+name.slice(0,80):"");
};
export function eligibleContextItems(context:ImportContext) {
  const items=context.contest?.items ?? [];
  const map=new Map(items.map(i=>[i.id,i]));
  return items.filter(i=>{
    if(!["topic","subtopic"].includes(i.kind)) return false;
    let current:typeof i | undefined=i; const seen=new Set<string>();
    while(current) { if(current.archived || seen.has(current.id)) return false; seen.add(current.id); current=current.parent?map.get(current.parent):undefined; }
    return !context.contest?.archived;
  });
}
export function referenceChoices(type:ImportType,path:string,document:unknown,context:ImportContext):{value:string;label:string}[] | null {
  if(type==="contest" && /\.parent$/.test(path) && record(document) && Array.isArray(document.items)) {
    const index=Number(/items\[(\d+)\]/.exec(path)?.[1]); const row=document.items[index];
    const kind=record(row)?row.kind:undefined;
    return document.items.filter(record).filter(i=>i.kind===(kind==="subtopic"?"topic":"discipline")).map(i=>({value:String(i.id ?? ""),label:String(i.name ?? i.id ?? "")+" · "+String(i.id ?? "")}));
  }
  if((type==="video_batch"||type==="incidence_batch") && /\.item$/.test(path))
    return context.contest?eligibleContextItems(context).map(i=>({value:i.id,label:i.name+" · "+i.id})):null;
  if(type==="contest" && /resources\[\d+\]\.item$/.test(path) && record(document) && Array.isArray(document.items))
    return document.items.filter(record).filter(i=>["topic","subtopic"].includes(String(i.kind))).map(i=>({value:String(i.id ?? ""),label:String(i.name ?? i.id ?? "")+" · "+String(i.id ?? "")}));
  if((type==="questions"||type==="study_trail") && (/\.topic_id$/.test(path)||/\.requires\[\d+\]$/.test(path))) {
    const nodes=context.nodes;
    if(!nodes) return null;
    const root=(node:Node)=>{let n:Node | undefined=node;const seen=new Set<string>();while(n){if(n.catalog_archived||seen.has(n.id))return undefined;seen.add(n.id);if(!n.parent_id)return n.id;n=nodes.find(p=>p.id===n!.parent_id);}return undefined;};
    return nodes.filter(n=>["topic","subtopic"].includes(n.kind)&&!!root(n)&&(!context.contestUuid||type!=="study_trail"||root(n)===context.contestUuid)).map(n=>({value:n.id,label:n.name+" · "+n.id}));
  }
  return null;
}
export function diagnoseImport(document:unknown,type:ImportType,context:ImportContext={}):Issue[] {
  const issues:Issue[]=[];
  const doc=record(document)?document:{};
  function add(code:string,path:string,message:string) { if(!issues.some(i=>i.code===code&&i.path===path&&i.message===message)) issues.push({code,path,message,label:labelAt(doc,path)}); }
  const knownUuid=new Set([...(context.nodes??[]).map(n=>n.id),context.contestUuid??""]);
  function visit(value:unknown,field:Field,path:string,present=true) {
    if(!present) { if(field.required)add("required",path,"Campo obrigatório ausente: "+field.label+"."); return; }
    if(value===null && field.nullable) return;
    if(field.values && !field.values.includes(value as string)) add("enum",path,"Use "+field.values.map(v=>JSON.stringify(v)).join(", ")+".");
    if(field.kind==="object") {
      if(!record(value)){add("type",path,"Esperado objeto em "+field.label+".");return;}
      for(const key of Object.keys(value)) if(!Object.hasOwn(field.fields??{},key)) add("unknown_field",path+"."+key,"Campo não reconhecido; revise antes de remover.");
      for(const [key,child] of Object.entries(field.fields??{})) visit(value[key],child,path+"."+key,Object.hasOwn(value,key));
      return;
    }
    if(field.kind==="array") {
      if(!Array.isArray(value)){add("type",path,"Esperada lista em "+field.label+".");return;}
      if(value.length<(field.min??0)||value.length>(field.max??Infinity)) add("range",path,"Use de "+(field.min??0)+" a "+field.max+" entradas.");
      if(field.unique && new Set(value.map(v=>typeof v==="string"?v.trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR"):JSON.stringify(v))).size!==value.length) add("duplicate",path,"A lista contém valores repetidos.");
      value.slice(0,field.max??value.length).forEach((v,i)=>visit(v,field.entry!,path+"["+i+"]"));
      return;
    }
    if(field.kind==="boolean"){if(typeof value!=="boolean")add("type",path,"Use true ou false, sem aspas.");return;}
    if(field.kind==="number") {
      if(typeof value!=="number"||!Number.isFinite(value)||(field.integer&&!Number.isInteger(value)))add("type",path,"Use um número"+(field.integer?" inteiro":"")+", sem aspas.");
      else if(value<(field.min??-Infinity)||value>(field.max??Infinity))add("range",path,"Valor deve estar entre "+field.min+" e "+field.max+".");
      return;
    }
    if(typeof value!=="string"){add("type",path,"Esperado texto em "+field.label+".");return;}
    if(field.max!==undefined && value.length>field.max)add("length",path,value.length+" caracteres; máximo "+field.max+". Reescreva sem cortar automaticamente.");
    if((field.min??1)>0 && !value.trim())add("required",path,"Preencha "+field.label+".");
    if(field.kind==="id" && !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value))add("id",path,"Use ID estável de 1 a 80 caracteres: minúsculas, números, ponto, hífen ou sublinhado.");
    if(field.kind==="uuid" && !isUuid(value) && !knownUuid.has(value))add("id",path,"Use o UUID exato fornecido pelo contexto do sistema.");
    if(field.kind==="url" && (value || field.min!==0))try{safeUrl(value);}catch{add("url",path,"Use URL HTTPS, sem usuário ou senha.");}
    if(field.kind==="date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith("0000")||!Number.isFinite(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value))add("date",path,"Use data real no formato AAAA-MM-DD.");
  }
  visit(document,importTypes[type].schema,"$");
  const rows=(key:string)=>Array.isArray(doc[key])?(doc[key] as unknown[]).filter(record):[];
  const indexed=(key:string,fn:(row:Record<string,unknown>,path:string)=>void) => { if(Array.isArray(doc[key])) (doc[key] as unknown[]).forEach((row,i)=>{if(record(row))fn(row,"$."+key+"["+i+"]");}); };
  function uniqueIds(keys:string[],field="id") {
    const seen=new Set<string>();
    for(const key of keys) indexed(key,(row,path)=>{ if(typeof row[field]!=="string")return; if(seen.has(row[field] as string))add("duplicate",path+"."+field,"ID repetido neste lote.");seen.add(row[field] as string); });
  }
  if(type==="contest") {
    uniqueIds(["items"]);uniqueIds(["resources"]);
    const map=new Map(rows("items").map(i=>[i.id,i]));
    indexed("items",(row,path)=>{
      if(row.kind==="discipline" && row.parent!==null)add("reference",path+".parent","Disciplina deve ter parent: null.");
      if(row.kind==="topic" && map.get(row.parent)?.kind!=="discipline")add("reference",path+".parent","Selecione uma disciplina existente pelo ID.");
      if(row.kind==="subtopic" && map.get(row.parent)?.kind!=="topic")add("reference",path+".parent","Selecione um assunto existente pelo ID.");
      if(Array.isArray(row.checklist)&&new Set(row.checklist).size!==row.checklist.length)add("duplicate",path+".checklist","Checklist contém etapas repetidas.");
    });
    indexed("resources",(row,path)=>{
      if(!["topic","subtopic"].includes(String(map.get(row.item)?.kind)))add("reference",path+".item","Selecione o ID exato de um assunto/subassunto deste edital.");
      resourceRules(row,path);
    });
    if(context.contest) {
      if(doc.id!==context.contest.id)add("immutable","$.id","O ID do concurso de destino deve ser preservado.");
      if(record(doc.notice)&&typeof doc.notice.version==="number"&&doc.notice.version<context.contest.notice.version)add("range","$.notice.version","A versão do edital não pode diminuir.");
      for(const key of ["items","resources"] as const) {
        const entries=Array.isArray(doc[key])?doc[key] as unknown[]:[];
        for(const old of context.contest[key]) {
          const index=entries.findIndex(row=>record(row)&&row.id===old.id); const row=entries[index] as Record<string,unknown>;
          if(index<0)add("immutable","$."+key,"O ID existente "+old.id+" foi omitido. Preserve-o e use archived: true para arquivar.");
          else for(const field of key==="items"?["kind","parent"]:["kind","item"]) if(row[field]!==old[field as keyof typeof old])add("immutable","$."+key+"["+index+"]."+field,"Preserve tipo e vínculo do ID existente "+old.id+".");
        }
      }
    }
  }
  function resourceRules(row:Record<string,unknown>,path:string) {
    if(row.kind==="bibliography" && (typeof row.author!=="string"||!row.author.trim()))add("required",path+".author","Obra bibliográfica exige autor documentado.");
    if(["video","legislation","external_questions"].includes(String(row.kind))&&!row.url)add("required",path+".url","URL obrigatória para este recurso.");
    if(row.kind==="video" && (typeof row.url!=="string"||!youtubeId(row.url)))add("url",path+".url","Use URL de um vídeo válido do YouTube.");
    if(row.kind==="material"&&!row.url&&!row.text)add("required",path+".text","Informe conteúdo ou URL do material.");
  }
  if(type==="video_batch" || type==="incidence_batch") {
    if(context.contest && doc.contest_id!==context.contest.id)add("reference","$.contest_id","Use o ID externo do concurso selecionado: "+context.contest.id+".");
    if(context.contest?.archived)add("reference","$.contest_id","O concurso está arquivado. Reative-o antes de importar.");
    const eligible=new Set(eligibleContextItems(context).map(i=>i.id));
    const groups=type==="video_batch"?["resources"]:["entries","unavailable"];
    uniqueIds(groups,type==="video_batch"?"id":"item");
    for(const group of groups) indexed(group,(row,path)=>{
      if(context.contest && !eligible.has(String(row.item)))add("reference",path+".item","Referência inválida ou arquivada. Selecione um assunto ativo do destino.");
      if(type==="video_batch") {
        resourceRules(row,path);
        const old=context.contest?.resources.find(r=>r.id===row.id);
        if(old && (old.kind!=="video"||old.item!==row.item||youtubeId(old.url??"")!==youtubeId(String(row.url??""))))add("conflict",path+".id","Este ID já pertence a outro vídeo ou vínculo. Gere um novo ID para a nova aula; o recurso anterior será preservado.");
      }
    });
    if(type==="incidence_batch") {
      if(context.contest && doc.board!==context.contest.board)add("reference","$.board","Use a banca exata do concurso selecionado.");
      if(typeof doc.period_start==="string"&&typeof doc.period_end==="string"&&doc.period_end<doc.period_start)add("range","$.period_end","O fim do período não pode ser anterior ao início.");
      if(rows("entries").length+rows("unavailable").length>1500)add("range","$.entries","O total de evidências e lacunas deve ser no máximo 1500.");
      indexed("entries",(row,path)=>{if(typeof row.occurrences==="number"&&typeof doc.sample==="number"&&row.occurrences>doc.sample)add("range",path+".occurrences","Ocorrências não podem superar a amostra. Ausência de evidência deve ir em unavailable, sem inventar zero.");});
    }
  }
  if(type==="library_batch") {
    uniqueIds(["materials"]);
    indexed("materials",(row,path)=>{
      if(row.kind==="text" && (typeof row.body!=="string"||!row.body.trim()))add("required",path+".body","Material textual exige conteúdo.");
      if(["link","youtube"].includes(String(row.kind))&&!row.url)add("required",path+".url","Informe a URL do material.");
      if(row.kind==="youtube" && !youtubeId(String(row.url??"")))add("url",path+".url","Use um vídeo válido do YouTube.");
      if(row.section==="Flashcards" && (!String(row.body??"").trim()||!String(row.back??"").trim()))add("required",path+".back","Flashcard exige frente e verso.");
    });
  }
  if(type==="questions" || type==="study_trail") indexed(type==="questions"?"questions":"topics",(row,path)=>{
    const choices=referenceChoices(type,path+".topic_id",doc,context);
    if(choices && !choices.some(c=>c.value===row.topic_id))add("reference",path+".topic_id","Selecione um assunto disponível no contexto.");
  });
  if(type==="questions") indexed("questions",(row,path)=>{
    if(Array.isArray(row.options)&&typeof row.answer==="number"&&row.answer>=row.options.length)add("range",path+".answer","A resposta deve ser um índice existente, começando em zero.");
    if(row.source==="licensed" && !row.source_url)add("required",path+".source_url","Fonte autorizada exige o link original.");
    if(row.source==="licensed" && !row.source_name)add("required",path+".source_name","Identifique a fonte autorizada.");
  });
  if(type==="flashcard_deck") indexed("cards",(row,path)=>{
    const choices=Array.isArray(row.choices)?row.choices:[];
    if(choices.length===1)add("range",path+".choices","Use zero ou de duas a oito alternativas.");
    if(choices.length && (typeof row.correct_choice!=="number"||row.correct_choice>=choices.length||row.correct_choice<0))add("range",path+".correct_choice","Selecione o índice da alternativa correta.");
    if(!choices.length && row.correct_choice!=null)add("range",path+".correct_choice","Cartão sem alternativas deve omitir correct_choice ou usar null.");
  });
  if(type==="study_trail") {
    if(context.contestUuid && doc.contest_id!==context.contestUuid)add("reference","$.contest_id","Use o UUID do concurso selecionado.");
    uniqueIds(["topics"],"topic_id");
    const choices=referenceChoices(type,"$.topics[0].topic_id",doc,context);const eligible=choices?new Set(choices.map(c=>c.value)):null;
    indexed("topics",(row,path)=>{if(Array.isArray(row.requires))row.requires.forEach((id,i)=>{if(id===row.topic_id||eligible&&!eligible.has(String(id)))add("reference",path+".requires["+i+"]","Pré-requisito deve ser outro assunto do mesmo concurso.");});});
    if(!issues.length) try{validateTrailTopics(rows("topics") as never,eligible??new Set(rows("topics").map(r=>String(r.topic_id))));}catch(e){add("cycle","$.topics",(e as Error).message);}
  }
  // Reuse final domain validation once fields/references are consistent.
  if(!issues.length) try {
    const raw=JSON.stringify(document);
    if(type==="contest"){const next=parseContest(raw); if(context.contest)compareContest(context.contest,next);}
    if(type==="video_batch" && context.contest){const p=previewVideoBatch(raw,context.contest);p.rows.forEach((row,i)=>{if(row.error)add("domain","$.resources["+i+"]",row.status);});}
    if(type==="incidence_batch" && context.incidence){const p=previewIncidenceBatch(raw,context.incidence);p.rows.forEach(row=>{if(row.error)add("domain",row.path,row.status);});}
    if(type==="library_batch")parseLibraryBatch(raw);
    if(type==="flashcard_deck")parseDeck(raw);
    if(type==="questions" && context.nodes)importQuestions(raw,new Set((referenceChoices(type,"$.questions[0].topic_id",document,context)??[]).map(c=>c.value)),[]);
  } catch(e){const message=(e as Error).message;add("domain",/^\$[^: ]*/.exec(message)?.[0]??"$",message);}
  return issues;
}
export function readPath(value:unknown,path:string):unknown {
  if(path==="$")return value;
  const tokens=path.slice(2).replace(/\[(\d+)\]/g,".$1").split(".");
  let current=value;
  for(const token of tokens){if(!current||typeof current!=="object"||!Object.hasOwn(current,token))return undefined;current=(current as Record<string,unknown>)[token];}
  return current;
}
export function editPath(value:unknown,path:string,next:unknown,remove=false):unknown {
  const tokens=path.slice(2).replace(/\[(\d+)\]/g,".$1").split(".");
  if(path==="$"||!/^\$\.[a-zA-Z_][\w]*(?:\[\d+\]|\.[a-zA-Z_][\w]*)*$/.test(path)||tokens.some(t=>["__proto__","prototype","constructor"].includes(t)))throw new Error("Caminho de edição inválido.");
  const clone=structuredClone(value); let parent=clone as Record<string,unknown>;
  for(const token of tokens.slice(0,-1)){if(!parent[token]||typeof parent[token]!=="object")parent[token]={};parent=parent[token] as Record<string,unknown>;}
  const key=tokens.at(-1)!;
  if(remove){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}
  else Object.defineProperty(parent,key,{value:next,enumerable:true,writable:true,configurable:true});
  return clone;
}
export function repairInstructions(type:ImportType | null,issues:Issue[],context:ImportContext={}) {
  return ["Corrija o JSON anterior, preservando IDs, vínculos, textos válidos e dados existentes. Não trunque textos, invente referências ou altere contagens para passar na validação.",
    type?"Contrato esperado: "+type+" 1.0. Destino: "+importTypes[type].destination:"",
    "Erros a corrigir:",...issues.map(i=>i.path+" ["+i.code+"]: "+i.message),
    "IDs disponíveis do edital:",...eligibleContextItems(context).map(i=>i.id+" · "+i.name),
    "Não há envio automático para IA. Devolva somente o objeto JSON corrigido, sem cercas, introdução ou explicação."].filter(Boolean).join("\n");
}
export function contextInstructions(type:ImportType,context:ImportContext) {
  const data=type==="contest"?context.contest:undefined;
  return [contractInstructions(type),context.contest?"Concurso de destino (ID externo): "+context.contest.id+"\nBanca: "+(context.contest.board??"não informada"):"",
    context.contestUuid?"UUID do concurso (somente Trilhas): "+context.contestUuid:"",
    "IDs externos de assuntos/subassuntos elegíveis:",...eligibleContextItems(context).map(i=>i.id+" · "+i.name),
    "UUIDs de assuntos disponíveis (somente Questões/Trilhas):",...((type==="questions"||type==="study_trail")?(referenceChoices(type,"$.topics[0].topic_id",{},context)??[]).map(n=>n.value+" · "+n.label):[]),
    data?"JSON atual do edital, preserve IDs e vínculos:\n"+JSON.stringify(data,null,2):"",
    "Forneça os documentos à IA externa. Omita dados desconhecidos e indique a ausência de anexos na análise; não invente conteúdo programático."].filter(Boolean).join("\n");
}
