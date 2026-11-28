import {expect,it} from "vitest";
import {diagnoseImport,editPath,inspectImportInput,readPath,referenceChoices,repairInstructions,contextInstructions} from "../src/import-assistance";
import {parseContest} from "../src/contest-schema";
import {parseImportJson} from "../src/import-json";
import {importTypes,contractInstructions} from "../src/import-contracts";
import {videoBase,validVideoBatch,conflictingVideoBatch} from "./video-fixture";
import roseira from "../examples/roseira-ps-02-2026-matematica-parcial.json";
it("identifica os sete contratos, seus limites e destinos",()=>{
 for(const type of Object.keys(importTypes)) {
  expect(inspectImportInput(JSON.stringify({type})).type).toBe(type);
  expect(contractInstructions(type as keyof typeof importTypes)).toContain("$.schema_version");
 }
});
it("oferece somente uma cerca exata, sem normalização silenciosa",()=>{
 const raw="\uFEFF "+ "```json\n"+JSON.stringify(roseira)+"\n```";
 const result=inspectImportInput(raw);
 expect(result.wrapped).toBe(true);expect(result.type).toBe("contest");expect(JSON.parse(result.normalized!)).toEqual(roseira);
 expect(()=>parseImportJson(raw)).toThrow(/sintaxe/);
 for(const bad of ["Texto\n"+raw,raw+"\nExplicação",raw+"\n"+raw,'{"type":"contest",}',JSON.stringify(roseira).slice(0,-1)]) {
  expect(inspectImportInput(bad).issues.length).toBeGreaterThan(0);
 }
});
it("mostra todos os erros com índices originais, inclusive depois da página 1",()=>{
 const batch={...validVideoBatch,resources:validVideoBatch.resources.map((r,i)=>({...r,title:i>=29?"a".repeat(181):r.title,...(i===30?{item:"inexistente",url:"http://example.org"}:{})}))};
 const issues=diagnoseImport(batch,"video_batch",{contest:videoBase});
 expect(issues).toEqual(expect.arrayContaining([
  expect.objectContaining({path:"$.resources[29].title",code:"length"}),
  expect.objectContaining({path:"$.resources[30].title",code:"length"}),
  expect.objectContaining({path:"$.resources[30].item",code:"reference"}),
  expect.objectContaining({path:"$.resources[30].url",code:"url"})
 ]));
 expect(batch.resources[29].title).toHaveLength(181);
});
it("edita um campo preservando o original e os demais registros",()=>{
 const next=editPath(validVideoBatch,"$.resources[29].title","Título revisado");
 expect(readPath(next,"$.resources[29].title")).toBe("Título revisado");
 expect(validVideoBatch.resources[29].title).not.toBe("Título revisado");
 expect(readPath(next,"$.resources[0]")).toEqual(validVideoBatch.resources[0]);
 expect(()=>editPath({}, "$.__proto__.polluted",true)).toThrow();
 expect(()=>editPath({}, "$.constructor.prototype.polluted",true)).toThrow();
 expect(({} as Record<string,unknown>).polluted).toBeUndefined();
});
it("preserva IDs e aponta conflitos e vínculos sem adivinhar pelo título",()=>{
 expect(diagnoseImport(conflictingVideoBatch,"video_batch",{contest:videoBase}).some(i=>i.code==="conflict")).toBe(true);
 const choices=referenceChoices("video_batch","$.resources[0].item",validVideoBatch,{contest:videoBase});
 expect(choices?.some(c=>c.value===videoBase.items.find(i=>i.kind==="topic")?.id)).toBe(true);
 const changed=structuredClone(videoBase);changed.items[1].parent="outro";
 expect(diagnoseImport(changed,"contest",{contest:videoBase}).some(i=>i.code==="immutable")).toBe(true);
});
it("diagnostica datas, booleanos, números, campos extras e referências juntos",()=>{
 const bad={...roseira,listed:"sim",questions:"25",exam_date:"2026-02-30",extra:"privado"};
 const issues=diagnoseImport(bad,"contest");
 for(const path of ["$.listed","$.questions","$.exam_date","$.extra"])expect(issues.some(i=>i.path===path)).toBe(true);
 expect(repairInstructions("contest",issues)).not.toContain("privado");
 expect(contextInstructions("contest",{})).toContain("não invente");
});
it("simula só os dados documentados de Matemática, sem inventar o Anexo II",()=>{
 expect(parseContest(JSON.stringify(roseira))).toEqual(roseira);
 expect(diagnoseImport(roseira,"contest")).toEqual([]);
 expect(roseira.items).toEqual([]);expect(roseira.resources).toEqual([]);
 expect(roseira.questions).toBe(25);expect(roseira.exam_date).toBe("2026-12-06");
});
it("respeita os limites por tipo, BOM, URL com credenciais e lista acima do limite",()=>{
 expect(inspectImportInput("\uFEFF "+JSON.stringify(roseira)).issues).toEqual([]);
 expect(inspectImportInput(JSON.stringify({type:"questions",padding:"x".repeat(262144)})).issues.some(i=>i.code==="size")).toBe(true);
 const bad={...roseira,notice:{version:1,url:"https://user:secret@example.org"}};
 expect(diagnoseImport(bad,"contest").some(i=>i.path==="$.notice.url"&&i.code==="url")).toBe(true);
 const cards={schema_version:"1.0",type:"flashcard_deck",deck:{title:"Teste"},cards:Array.from({length:501},()=>({front:"A",back:"B"}))};
 expect(diagnoseImport(cards,"flashcard_deck").some(i=>i.path==="$.cards"&&i.code==="range")).toBe(true);
});

import {contractExamples} from "../src/prompt-contracts";
import {incidenceBatch,incidenceContext} from "./incidence-fixture";
import type {Node} from "../src/domain";
it("mantém compatibilidade dos exemplos de todos os contratos",()=>{
 expect(diagnoseImport(contractExamples.contest,"contest")).toEqual([]);
 expect(diagnoseImport(contractExamples.cards,"flashcard_deck")).toEqual([]);
 expect(diagnoseImport(validVideoBatch,"video_batch",{contest:videoBase})).toEqual([]);
 expect(diagnoseImport(incidenceBatch,"incidence_batch",{contest:incidenceContext.doc,incidence:incidenceContext})).toEqual([]);
 const nodes:Node[]=[
 {id:"demo-contest",parent_id:null,kind:"contest",name:"Fictício",owner_id:"a",board:"",position:0},
 {id:"demo-discipline",parent_id:"demo-contest",kind:"discipline",name:"Disciplina",owner_id:"a",board:"",position:0},
 {id:"demo-topic",parent_id:"demo-discipline",kind:"topic",name:"Assunto",owner_id:"a",board:"",position:0}
 ];
 const questions={...contractExamples.questions,questions:contractExamples.questions.questions.map(q=>({...q,topic_id:"demo-topic"}))};
 expect(diagnoseImport(questions,"questions",{nodes})).toEqual([]);
 expect(diagnoseImport({schema_version:"1.0",type:"library_batch",materials:[{id:"qa",title:"Fictício",section:"Teoria e resumos",kind:"text",body:"Texto",url:""}]},"library_batch")).toEqual([]);
 const trail={schema_version:"1.0",type:"study_trail",contest_id:"demo-contest",topics:[{topic_id:"demo-topic",requires:[],minutes:45,estimated_priority:"medium"}]};
 expect(diagnoseImport(trail,"study_trail",{nodes,contestUuid:"demo-contest"})).toEqual([]);
 expect(referenceChoices("questions","$.questions[0].topic_id",questions,{nodes:nodes.map(n=>n.id==="demo-discipline"?{...n,catalog_archived:true}:n)})).toEqual([]);
});
it("não apresenta assinatura do edital como publicação comprovada",()=>{
 expect(roseira.notice).toEqual({version:1});
});
