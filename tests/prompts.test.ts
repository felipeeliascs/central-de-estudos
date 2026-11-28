import {expect,it} from 'vitest';
import {contractExamples,contracts} from '../src/prompt-contracts';
import {parseContest} from '../src/contest-schema';
import {parseDeck} from '../src/flashcards';
import {importQuestions} from '../src/questions';
import {buildPrompt,videoCoverage,templates,type Context} from '../src/prompts';
const context:Context={contest:'Concurso fictício',board:'Banca fictícia',role:'Cargo',discipline:'Disciplina',topic:'Assunto',topicId:'UUID_DO_ASSUNTO',author:'Autor',work:'Obra',quantity:5,difficulty:'Média',existing:JSON.stringify({...contractExamples.contest,id:'id-estavel'}),performance:'{"questoes":10,"acertos":7}'};
it('usa exemplos reais dos contratos que passam pelos três importadores',()=>{
 expect(parseContest(JSON.stringify(contractExamples.contest)).type).toBe('contest');
 expect(parseDeck(JSON.stringify(contractExamples.cards)).cards).toHaveLength(1);
 expect(importQuestions(JSON.stringify(contractExamples.questions),new Set([context.topicId]),[])[0].question.source).toBe('ai_generated');
});
it('inclui identificadores, contratos e dados mínimos somente nos prompts correspondentes',()=>{
 expect(templates).toHaveLength(15);
 for(const target of ['contest','cards','questions'] as const){const template=templates.find(t=>t.target===target)!;const text=buildPrompt(template,context);expect(text).toContain(contracts[target]);expect(text).toContain('UUID_DO_ASSUNTO');}
 expect(buildPrompt(templates.find(t=>t.id==='retificacao')!,context)).toContain('id-estavel');
 expect(buildPrompt(templates.find(t=>t.id==='desempenho')!,context)).toContain('"acertos":7');
 expect(buildPrompt(templates.find(t=>t.id==='videos')!,context)).not.toContain('"acertos":7');
});

it("gera prompt importável de Trilhas com UUIDs e sem inventar incidência",()=>{
 const text=buildPrompt(templates.find(t=>t.id==="trilhas")!,{...context,trailContest:"concurso-uuid",trailTopics:[{topic_id:"assunto-uuid",name:"Base",parent_id:null}]});
 expect(text).toContain("study_trail");
 expect(text).toContain("assunto-uuid");
 expect(text).toContain("concurso-uuid");
 expect(text).toContain("Não estime probabilidade da próxima prova");
});

import { videoBase, validVideoBatch } from "./video-fixture";
import { previewVideoBatch } from "../src/video-batch";
it("cobre 14 assuntos e 17 subassuntos com IDs externos, sem quantidade fixa",()=>{
 const coverage=videoCoverage(videoBase);
 expect(coverage).toHaveLength(31);
 expect(coverage.filter(x=>x.kind==="topic")).toHaveLength(14);
 expect(coverage.filter(x=>x.kind==="subtopic")).toHaveLength(17);
 const template=templates.find(t=>t.id==="videos")!;
 const full=buildPrompt(template,{...context,existing:JSON.stringify(videoBase),videoMode:"complete"});
 expect(full).not.toContain('"quantidade"');
 expect(full).toContain("31 IDs elegíveis");
 for(const item of coverage) expect(full).toContain('"item": "'+item.item+'"');
 expect(full).toContain('contest_id: "'+videoBase.id+'"');
 expect(full).toContain("1 a 180");
 expect(full).toContain("novo ID único");
 expect(full).toContain("URLs reais verificadas");
 expect(full).not.toContain("UUID_DO_ASSUNTO");
 expect(previewVideoBatch(JSON.stringify(validVideoBatch),videoBase).valid).toBe(true);
 const fixed=buildPrompt(template,{...context,existing:JSON.stringify(videoBase),videoMode:"fixed"});
 expect(fixed).toContain('"quantidade": 5');
 expect(fixed).not.toContain("meta de pelo menos");
});
it("não conta descendentes arquivados na cobertura e valida o JSON de contexto",()=>{
 const archived={...videoBase,items:videoBase.items.map(i=>({...i,archived:i.id==="disciplina"}))};
 expect(videoCoverage(archived)).toEqual([]);
 expect(()=>buildPrompt(templates.find(t=>t.id==="videos")!,{...context,existing:"texto"})).toThrow(/sintaxe JSON/);
});

import { incidenceDoc, eligible } from "./incidence-fixture";
it("gera prompt de incidência com todos os IDs e denominador sem quantidade fixa",()=>{
 const template=templates.find(t=>t.id==="incidencia-json")!;
 for(const measure of ["exams","questions"] as const){
  const text=buildPrompt(template,{...context,existing:JSON.stringify(incidenceDoc),incidenceMeasure:measure});
  expect(text).toContain('measure: "'+measure+'"');
  expect(text).toContain('contest_id exato: "'+incidenceDoc.id+'"');
  expect(text).not.toContain('"quantidade"');
  for(const x of eligible) expect(text).toContain('"item": "'+x.id+'"');
  expect(text).toContain("união");expect(text).toContain("unavailable");expect(text).toContain("não invente uma amostra");
  expect(text).toContain("incidence_batch 1.0");
 }
});
