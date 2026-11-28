import {expect,it} from "vitest";
import {guara,guaraPlanner,guaraSnapshot,uuid} from "./guaratingueta-fixture";
import provenance from "./fixtures/guaratingueta-provenance.json";
import ficha from "../examples/guaratingueta-ficha-consulta.json";
import {diagnoseImport} from "../src/import-assistance";
import {compareContest,parseContest} from "../src/contest-schema";
import {generatePlan,defaults,addDays} from "../src/planner";
import {buildTrailWeek,parseTrail,validateTrailTopics} from "../src/trails";
import {parseLibraryBatch} from "../src/library-import";
import {importQuestions} from "../src/questions";
import {parseDeck} from "../src/flashcards";
import {validateFile} from "../src/domain";
it("valida o edital integral do cargo, distribuição e 75 referências sem inventar incidência",()=>{
 expect(diagnoseImport(guara,"contest")).toEqual([]);
 expect(guara.items.filter(n=>n.kind==="discipline").map(n=>[n.name,n.questions])).toEqual([["Língua Portuguesa",10],["Matemática",10],["Noções de Informática",5],["Conhecimentos Específicos",25]]);
 expect(guara.items).toHaveLength(179);expect(guara.resources).toHaveLength(75);
 expect(guara.exam_date).toBe("2027-02-21");expect(provenance.examDateStatus).toContain("prevista");
 expect(guara.notice.published_on).toBeUndefined();
 expect(guara.items.every(n=>n.weight===undefined&&n.priority===undefined&&n.minutes===undefined)).toBe(true);
 expect(guara.resources.every(r=>r.item==="ce-programa"&&!!r.author&&!!r.text)).toBe(true);
 expect(compareContest(guara,parseContest(JSON.stringify(guara))).every(row=>row.status.includes("Sem alteração"))).toBe(true);
});
it("preserva as citações e recortes bibliográficos, incluindo links que não podem virar URLs HTTPS automaticamente",()=>{
 expect(provenance.bibliography).toHaveLength(75);
 provenance.bibliography.forEach((b,i)=>expect(guara.resources[i].text).toContain(b.citation));
 for(const title of ["capítulos 3, 5 e 8","4ª Parte, capítulos 1, 2 e 3","aula 9, páginas 132 a 150"])expect(guara.resources.some(r=>r.title.includes(title))).toBe(true);
 const http=provenance.bibliography.map((b,i)=>({b,i})).filter(x=>x.b.citation.includes("http://"));
 http.forEach(({i})=>expect(guara.resources[i].url).toBeUndefined());
 expect(parseLibraryBatch(JSON.stringify(ficha))[0].body).toContain("6.577,20");
});
it("gera plano e trilha com disponibilidade fictícia sem converter as 25 questões em frequência histórica",()=>{
 const input=guaraPlanner(),settings={...defaults,minutes:[120,120,120,120,120,60,0]};
 const plan=generatePlan(input,settings,"2026-11-30",[],7);
 expect(plan.blocks.length).toBeGreaterThan(0);
 for(let i=0;i<7;i++)expect(plan.blocks.filter(b=>b.day===addDays("2026-11-30",i)).reduce((n,b)=>n+b.minutes,0)).toBeLessThanOrEqual(settings.minutes[i]);
 expect(plan.blocks.every(b=>!b.reason.includes("50%"))).toBe(true);
 const topics=input.topics.slice(0,9);
 const entries=topics.map((t,i)=>({topic_id:t.id,requires:i===1?[topics[0].id]:[],minutes:30,estimated_priority:"medium" as const}));
 const ids=new Set(topics.map(t=>t.id));
 const raw=JSON.stringify({schema_version:"1.0",type:"study_trail",contest_id:uuid(1),topics:entries});
 expect(parseTrail(raw,uuid(1),ids)).toEqual(entries);validateTrailTopics(entries,ids);
 const week=buildTrailWeek(topics,{minutes:settings.minutes,measure:"questions",topics:entries},[],"VUNESP","2026-11-30",[],"2026-11-30",guara.exam_date);
 expect(week.sessions.length).toBeGreaterThan(0);
 expect(week.sessions.every(s=>s.reason.includes("Sem dados de incidência"))).toBe(true);
 expect(diagnoseImport(JSON.parse(raw),"study_trail",{nodes:guaraSnapshot().nodes,contestUuid:uuid(1)})).toEqual([]);
});
it("limita questões a 30 por lote e admite 50 questões fictícias em dois lotes, baralho e arquivos suportados",()=>{
 const source=guaraSnapshot(),topic=source.nodes.find(n=>n.catalog_key==="ce-01")!.id;
 const qs=Array.from({length:50},(_,i)=>({topic_id:topic,statement:"Questão fictícia de QA "+(i+1),options:["A","B","C","D","E"],answer:0,explanation:"Resposta sintética para testar o fluxo, não é questão oficial.",source:"author",difficulty:"medium"}));
 const batch=(questions:unknown[])=>JSON.stringify({schema_version:"1.0",type:"questions",questions});
 expect(()=>importQuestions(batch(qs),new Set([topic]),[])).toThrow(/30/);
 expect(importQuestions(batch(qs.slice(0,25)),new Set([topic]),[])).toHaveLength(25);
 expect(importQuestions(batch(qs.slice(25)),new Set([topic]),[])).toHaveLength(25);
 const deck={schema_version:"1.0",type:"flashcard_deck",deck:{title:"QA Guaratinguetá — legislação"},cards:[{front:"Pergunta fictícia",back:"Resposta fictícia"},{front:"Questão fictícia",back:"Explicação fictícia",choices:["A","B"],correct_choice:0}]};
 expect(parseDeck(JSON.stringify(deck)).cards).toHaveLength(2);
 for(const [name,type] of [["edital.pdf","application/pdf"],["mapa.png","image/png"],["mapa.jpg","image/jpeg"],["mapa.webp","image/webp"]])expect(()=>validateFile(new File(["fixture"],name,{type}))).not.toThrow();
 expect(()=>validateFile(new File(["fixture"],"invalido.exe",{type:"application/octet-stream"}))).toThrow();
});

import {buildPrompt,templates,videoCoverage,type Context} from "../src/prompts";
import {previewVideoBatch} from "../src/video-batch";
import {previewIncidenceBatch} from "../src/incidence-import";
it("prepara prompts externos com todos os 175 IDs e testa lote de videoaulas fictício sem substituir bibliografia",()=>{
 const context:Context={contest:guara.name,board:"VUNESP",role:guara.role!,discipline:"",topic:"",topicId:"",author:"",work:"",quantity:5,difficulty:"medium",existing:JSON.stringify(guara),performance:"",videoMode:"complete"};
 expect(videoCoverage(guara)).toHaveLength(175);
 const prompt=buildPrompt(templates.find(t=>t.id==="videos")!,context);
 for(const item of guara.items.filter(n=>n.kind==="topic"||n.kind==="subtopic"))expect(prompt).toContain('"item": "'+item.id+'"');
 const batch={schema_version:"1.0",type:"video_batch",contest_id:guara.id,resources:[{id:"qa-video-ficticio",item:"ce-01",kind:"video",title:"QA — URL sintética para teste, não é indicação de aula",url:"https://youtu.be/abcdefghijk"}]};
 const first=previewVideoBatch(JSON.stringify(batch),guara);
 expect(first.valid).toBe(true);expect(first.doc.resources).toHaveLength(76);
 expect(first.doc.resources.slice(0,75)).toEqual(guara.resources);
 const second=previewVideoBatch(JSON.stringify(batch),first.doc);
 expect(second.doc.resources).toHaveLength(76);expect(second.rows[0].status).toContain("Duplicata");
});
it("ausência de provas históricas gera lacunas sem inventar zero, amostra ou percentual",()=>{
 const nodes=guaraSnapshot().nodes;
 const itemMap=Object.fromEntries(nodes.filter(n=>n.catalog_key).map(n=>[n.catalog_key!,n.id]));
 const missing=guara.items.filter(n=>n.kind==="topic"||n.kind==="subtopic").map(n=>({item:n.id,reason:"Edital sem corpus de provas anteriores: não é evidência de incidência."}));
 // The header below is deliberately synthetic solely to exercise the no-evidence path.
 const batch={schema_version:"1.0",type:"incidence_batch",contest_id:guara.id,board:"VUNESP",measure:"exams",period_start:"2020-01-01",period_end:"2025-12-31",sample:1,entries:[],unavailable:missing};
 const result=previewIncidenceBatch(JSON.stringify(batch),{target:uuid(1),doc:guara,itemMap,expected:[]});
 expect(result.valid).toBe(false);expect(result.changes).toBe(0);expect(result.rows).toHaveLength(175);
 expect(result.rows.every(r=>!r.value&&r.status.includes("Sem evidência"))).toBe(true);
});
