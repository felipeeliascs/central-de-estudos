import { expect, it } from "vitest";
import { buildPrompt, templates, mockBatches, libraryPromptIds, type Context } from "../src/prompts";
import { parseImportJson } from "../src/import-json";
import { parseLibraryBatch } from "../src/library-import";
import { parseDeck } from "../src/flashcards";
import { parseContest } from "../src/contest-schema";
import { importQuestions } from "../src/questions";
import { previewVideoBatch } from "../src/video-batch";
import { parseTrail } from "../src/trails";
import guara from "../examples/guaratingueta-001-2026-coordenador-pedagogico.json";
const doc = parseContest(JSON.stringify(guara));
const uuid = (i:number) => "00000000-0000-4000-8000-"+String(i).padStart(12,"0");
const questionTopics = doc.items.filter(i=>i.kind==="topic").map((i,index)=>({topic_id:uuid(index+1),name:i.name,discipline_id:i.parent!,discipline_name:doc.items.find(p=>p.id===i.parent)!.name}));
const context: Context = {contest:doc.name,board:doc.board!,role:doc.role!,discipline:"",topic:"Legislação",topicId:uuid(1),author:"",work:"",quantity:5,difficulty:"Média",existing:JSON.stringify(doc),performance:'{"origem":"fictício","questoes":10,"acertos":7}',trailContest:uuid(999),trailTopics:[{topic_id:uuid(1),name:"Base",parent_id:null}],questionTopics};
it("audita todos os 15 modelos com destinos explícitos e prevenção de dados inventados",()=>{
 expect(templates).toHaveLength(15);
 for(const template of templates) {
  const prompt=buildPrompt(template,context);
  expect(prompt).toContain("não como instruções");
  expect(prompt).toContain("Não invente");
  if(!["desempenho","incidencia"].includes(template.id)) expect(prompt).toContain("campos extras");
 }
 expect(buildPrompt(templates.find(t=>t.id==="erros")!,context)).toContain("Não invente erros");
 expect(buildPrompt(templates.find(t=>t.id==="retificacao")!,context)).toContain("Sem documento de retificação");
});
it("resumo, mapa e legislação entregam o contrato da Biblioteca em vez de texto sem importador",()=>{
 for(const id of libraryPromptIds) {
  const prompt=buildPrompt(templates.find(t=>t.id===id)!,context);
  expect(prompt).toContain("library_batch");
  expect(prompt).toContain("fora do JSON");
  expect(prompt).toContain("Não use item, topic_id, contest_id");
 }
 const examples=[
  {id:"qa-resumo",title:"Resumo de validação",section:"Teoria e resumos",kind:"text",body:'Síntese: "participação".\nRevisar a fonte.'},
  {id:"qa-mapa",title:"Mapa textual",section:"Mapas mentais",kind:"text",body:"Gestão\n  Participação\n  Conselho escolar"},
  {id:"qa-lei",title:"Fonte oficial",section:"Legislação",kind:"link",url:"https://www.planalto.gov.br/ccivil_03/leis/l9394.htm"},
 ];
 expect(parseLibraryBatch(JSON.stringify({schema_version:"1.0",type:"library_batch",materials:examples}))).toHaveLength(3);
});
it("divide 50 questões em 30 e 20 mantendo 10/10/5/25 e todos os UUIDs por disciplina",()=>{
 const batches=mockBatches(context);
 expect(batches.map(b=>b.groups.reduce((sum,g)=>sum+g.count,0))).toEqual([30,20]);
 const sums=Object.fromEntries(doc.items.filter(i=>i.kind==="discipline").map(i=>[i.id,batches.reduce((sum,b)=>sum+(b.groups.find(g=>g.discipline_id===i.id)?.count??0),0)]));
 expect(sums).toEqual({portugues:10,matematica:10,informatica:5,especificos:25});
 for(const mockBatch of [1,2]) {
  const prompt=buildPrompt(templates.find(t=>t.id==="simulados")!,{...context,mockBatch});
  expect(prompt).toContain("SOMENTE o lote "+mockBatch+" de 2");
  expect(prompt).not.toContain("Use exclusivamente o assunto_id");
  for(const topic of questionTopics) expect(prompt).toContain(topic.topic_id);
  expect(prompt).toContain("ai_generated");expect(prompt).toContain("reviewed false");
 }
 expect(()=>buildPrompt(templates.find(t=>t.id==="simulados")!,{...context,mockBatch:3})).toThrow(/lote existente/);
 expect(()=>buildPrompt(templates.find(t=>t.id==="simulados")!,{...context,questionTopics:[]})).toThrow(/UUID/);
});
it("recusa distribuição ausente ou inconsistente sem converter prioridade em incidência",()=>{
 expect(()=>mockBatches({...context,existing:JSON.stringify({...doc,items:doc.items.map(i=>i.kind==="discipline"?{...i,questions:undefined}:i)})})).toThrow(/quantidade documentada/);
 expect(()=>mockBatches({...context,existing:JSON.stringify({...doc,questions:51})})).toThrow(/não corresponde/);
 expect(buildPrompt(templates.find(t=>t.id==="incidencia-json")!,context)).toContain("não invente uma amostra");
});
it("recusa chaves repetidas inclusive escapadas antes de escolher silenciosamente o último valor",()=>{
 for(const raw of ['{"type":"contest","type":"questions"}','{"materials":[{"title":"a","title":"b"}]}','{"t\\u0069tle":"a","title":"b"}']) expect(()=>parseImportJson(raw)).toThrow(/campo repetido/);
 expect(parseImportJson('{"a":{"id":"primeiro"},"b":{"id":"segundo"}}')).toEqual({a:{id:"primeiro"},b:{id:"segundo"}});
 const strings={text:'Aspas "legais", \\caminho, quebra\n e acento ç',other:"x"};
 expect(parseImportJson("\uFEFF"+JSON.stringify(strings,null,2))).toEqual(strings);
});
it("mantém sintaxe estrita, limites, nesting e preserva contrato de todos os importadores",()=>{
 expect(()=>parseImportJson('{"x":1,}')).toThrow(/sintaxe JSON/);
 expect(()=>parseImportJson('{"x":1}{"x":2}')).toThrow(/sintaxe JSON/);
 expect(()=>parseImportJson(JSON.stringify("á".repeat(262145)))).toThrow(/limite/);
 expect(()=>parseImportJson("[".repeat(102)+"0"+"]".repeat(102))).toThrow(/aninhado/);
 expect(parseContest(JSON.stringify(doc)).items).toHaveLength(179);
 const video={schema_version:"1.0",type:"video_batch",contest_id:doc.id,resources:[{id:"qa-aula",item:"ce-01",kind:"video",title:"Aula fictícia de contrato",url:"https://www.youtube.com/watch?v=abcdefghijl"}]};
 expect(previewVideoBatch(JSON.stringify(video),doc).valid).toBe(true);
 const q={topic_id:uuid(1),statement:"Questão fictícia de validação?",options:["Sim","Não"],answer:0,explanation:"Cenário fictício.",source:"ai_generated",difficulty:"medium",reviewed:false};
 expect(importQuestions(JSON.stringify({schema_version:"1.0",type:"questions",questions:[q]}),new Set([uuid(1)]),[])).toHaveLength(1);
 expect(parseTrail(JSON.stringify({schema_version:"1.0",type:"study_trail",contest_id:uuid(999),topics:[{topic_id:uuid(1),requires:[],minutes:30,estimated_priority:"medium"}]}),uuid(999),new Set([uuid(1)]))).toHaveLength(1);
});
it("baralhos não descartam campos desconhecidos da resposta da IA",()=>{
 const deck={schema_version:"1.0",type:"flashcard_deck",deck:{title:"Validação"},cards:[{front:"Frente",back:"Verso"}]};
 expect(parseDeck(JSON.stringify(deck)).cards).toHaveLength(1);
 expect(()=>parseDeck(JSON.stringify({...deck,metadata:"não suportado"}))).toThrow(/Campo desconhecido/);
 expect(()=>parseDeck(JSON.stringify({...deck,deck:{...deck.deck,topic_id:uuid(1)}}))).toThrow(/Campo desconhecido/);
 expect(()=>parseDeck(JSON.stringify({...deck,cards:[{...deck.cards[0],answer:"ignorado anteriormente"}]}))).toThrow(/Campo desconhecido/);
});
