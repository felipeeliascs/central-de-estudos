/** Editable input metadata shared by diagnostics, review controls and external prompts.
 * Domain importers and Supabase RPCs remain the final authority for relational rules. */
export type ImportType = "contest" | "video_batch" | "incidence_batch" | "library_batch" | "questions" | "flashcard_deck" | "study_trail";
export type Field = {
  kind: "text" | "id" | "uuid" | "url" | "date" | "number" | "boolean" | "object" | "array";
  label: string; required?: boolean; min?: number; max?: number; integer?: boolean;
  nullable?: boolean; values?: readonly (string | number | boolean | null)[];
  fields?: Record<string,Field>; entry?: Field; unique?: boolean; long?: boolean;
};
const text=(label:string,max=180,extra:Partial<Field>={}):Field=>({kind:"text",label,max,min:1,...extra});
const num=(label:string,min=0,max=100000,extra:Partial<Field>={}):Field=>({kind:"number",label,min,max,integer:true,...extra});
const bool=(label:string):Field=>({kind:"boolean",label});
const id=(label:string,extra:Partial<Field>={}):Field=>({kind:"id",label,max:80,...extra});
const url=(label:string,extra:Partial<Field>={}):Field=>({kind:"url",label,max:2000,...extra});
const obj=(label:string,fields:Record<string,Field>):Field=>({kind:"object",label,fields});
const list=(label:string,entry:Field,max:number,min=0):Field=>({kind:"array",label,entry,max,min});
const required=(fields:Record<string,Field>,names:string)=>Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,{...field,required:names.split(" ").includes(key)}]));
const source=obj("Fonte",required({title:text("Título da fonte"),url:url("URL da fonte")},"title url"));
const metadata={archived:bool("Arquivado"),questions:num("Quantidade de questões"),weight:num("Peso",0,100000,{integer:false}),sources:list("Fontes",source,30)};
const resourceFields={id:id("ID do recurso"),item:id("Assunto vinculado"),kind:text("Tipo",180,{values:["bibliography","video","legislation","material","external_questions"]}),title:text("Título"),author:text("Autor"),edition:text("Edição"),url:url("URL"),text:text("Conteúdo",100000,{long:true}),archived:bool("Arquivado"),sources:list("Fontes",source,30)};
const syllabus=obj("Item do edital",required({id:id("ID do item"),parent:id("Pai",{nullable:true}),kind:text("Nível",180,{values:["discipline","topic","subtopic"]}),name:text("Nome"),...metadata,priority:text("Prioridade estimada",180,{values:["low","medium","high"]}),minutes:num("Minutos",1),checklist:list("Checklist",num("Etapa",0,4),5)},"id parent kind name"));
const libraryFields={id:id("ID do material"),title:text("Título"),section:text("Seção",180,{values:["Teoria e resumos","Videoaulas","Bibliografia","Legislação","Mapas mentais","Questões externas","Flashcards","Anotações pessoais"]}),kind:text("Formato",180,{values:["text","link","youtube"]}),body:text("Conteúdo",100000,{min:0,long:true}),back:text("Verso",100000,{min:0,long:true}),url:url("URL",{min:0}),author:text("Autor",180,{min:0}),work:text("Obra",180,{min:0}),edition:text("Edição",180,{min:0}),source:text("Fonte",2000,{min:0}),content_version:text("Versão do conteúdo",80,{min:0})};
const question=obj("Questão",required({topic_id:{kind:"uuid",label:"Assunto (UUID)"},statement:text("Enunciado",12000,{long:true}),options:{...list("Alternativas",text("Alternativa",1500),8,2),unique:true},answer:num("Índice da resposta",0,7),explanation:text("Explicação",12000,{long:true}),source:text("Origem",180,{values:["author","ai_generated","licensed"]}),difficulty:text("Dificuldade",180,{values:["easy","medium","hard"]}),board:text("Banca",150,{min:0}),year:num("Ano",1900,2100,{nullable:true}),source_name:text("Nome da fonte",180,{min:0}),source_url:url("Fonte original",{nullable:true,min:0}),image_url:url("Imagem",{nullable:true,min:0}),reviewed:bool("Revisada")},"topic_id statement options answer explanation source difficulty"));
const card=obj("Cartão",required({front:text("Frente",20000,{long:true}),back:text("Verso",20000,{long:true}),front_image:url("Imagem da frente",{nullable:true,min:0}),back_image:url("Imagem do verso",{nullable:true,min:0}),choices:{...list("Alternativas",text("Alternativa",500),8),unique:true},correct_choice:num("Índice da resposta",0,7,{nullable:true})},"front back"));
export const importTypes: Record<ImportType,{title:string;destination:string;maxBytes:number;schema:Field}> = {
  contest:{title:"Concurso / edital",destination:"Meus concursos → Importar JSON",maxBytes:524288,schema:obj("Concurso",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["contest"]}),id:id("ID do concurso"),name:text("Nome do concurso"),organization:text("Órgão"),role:text("Cargo"),board:text("Banca"),exam_date:{kind:"date",label:"Data da prova"},listed:bool("Disponível no catálogo"),...metadata,notice:obj("Edital",required({version:num("Versão do edital",1),url:url("URL do edital"),published_on:{kind:"date",label:"Publicação"}},"version")),items:list("Disciplinas, assuntos e subassuntos",syllabus,1500),resources:list("Recursos",obj("Recurso",required(resourceFields,"id item kind title")),2000)},"schema_version type id name notice items resources"))},
  video_batch:{title:"Videoaulas",destination:"Meus concursos → Importar JSON",maxBytes:524288,schema:obj("Lote de videoaulas",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["video_batch"]}),contest_id:id("ID externo do concurso"),resources:list("Videoaulas",obj("Aula",required({...Object.fromEntries(Object.entries(resourceFields).filter(([key])=>key!=="archived")),kind:text("Tipo",180,{values:["video"]})},"id item kind title url")),2000,1)},"schema_version type contest_id resources"))},
  incidence_batch:{title:"Incidência histórica",destination:"Desempenho → Raio-X do edital → Importar incidência JSON",maxBytes:524288,schema:obj("Incidência",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["incidence_batch"]}),contest_id:id("ID externo do concurso"),board:text("Banca"),measure:text("Unidade",180,{values:["exams","questions"]}),period_start:{kind:"date",label:"Início do período"},period_end:{kind:"date",label:"Fim do período"},sample:num("Tamanho da amostra",1,1000000),entries:list("Evidências",obj("Evidência",required({item:id("Assunto vinculado"),occurrences:num("Ocorrências",0,1000000),source_url:url("Fonte da evidência")},"item occurrences source_url")),1500),unavailable:list("Sem evidência",obj("Lacuna",required({item:id("Assunto vinculado"),reason:text("Motivo")},"item reason")),1500)},"schema_version type contest_id board measure period_start period_end sample entries unavailable"))},
  library_batch:{title:"Materiais da Biblioteca",destination:"Biblioteca → Mais opções → Importar materiais JSON",maxBytes:524288,schema:obj("Acervo",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["library_batch"]}),materials:list("Materiais",obj("Material",required(libraryFields,"id title section kind")),300,1)},"schema_version type materials"))},
  questions:{title:"Questões",destination:"Questões → Importar JSON",maxBytes:262144,schema:obj("Questões",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["questions"]}),questions:list("Questões",question,30,1)},"schema_version type questions"))},
  flashcard_deck:{title:"Flashcards",destination:"Revisões → Importar JSON",maxBytes:1048576,schema:obj("Baralho",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["flashcard_deck"]}),deck:obj("Identificação do baralho",required({title:text("Título"),author:text("Autor",180,{min:0})},"title")),cards:list("Cartões",card,500)},"schema_version type deck cards"))},
  study_trail:{title:"Trilha de estudos",destination:"Trilhas → Configurações da Trilha → Importar sugestão",maxBytes:524288,schema:obj("Trilha",required({schema_version:text("Versão",180,{values:["1.0"]}),type:text("Tipo",180,{values:["study_trail"]}),contest_id:{kind:"uuid",label:"Concurso (UUID)"},topics:list("Conteúdos da trilha",obj("Conteúdo",required({topic_id:{kind:"uuid",label:"Assunto (UUID)"},requires:{...list("Pré-requisitos",{kind:"uuid",label:"Assunto requerido"},100),unique:true},minutes:num("Minutos",5,480),estimated_priority:text("Prioridade estimada",180,{values:["low","medium","high"]})},"topic_id requires minutes estimated_priority")),1500,1)},"schema_version type contest_id topics"))}
};
export function knownImportType(value: unknown): ImportType | null {
  return typeof value==="string" && Object.hasOwn(importTypes,value) ? value as ImportType : null;
}
export function contractInstructions(type: ImportType) {
  const lines:string[]=[];
  function visit(field:Field,path:string) {
    lines.push(path+": "+field.kind+(field.required?" obrigatório":" opcional")+(field.nullable?" (aceita null)":"")+
      (field.max!==undefined?" · máximo "+field.max:"")+(field.min!==undefined?" · mínimo "+field.min:"")+
      (field.values?" · valores: "+field.values.map(v=>JSON.stringify(v)).join(", "):""));
    if(field.fields) for(const [key,child] of Object.entries(field.fields)) visit(child,path+"."+key);
    if(field.entry) visit(field.entry,path+"[]");
  }
  visit(importTypes[type].schema,"$");
  return ["Contrato "+type+" 1.0. Somente JSON, sem introdução nem cercas. Não envie campos extras.",...lines,
    "Use somente os IDs e fontes fornecidos. Não invente assuntos, bibliografias, datas, contagens ou amostras. Preserve IDs de registros existentes."].join("\n");
}
