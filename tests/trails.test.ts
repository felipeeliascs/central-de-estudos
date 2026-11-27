import { expect, it } from "vitest";
import { buildTrailWeek, parseTrail, topicDone, type TrailConfig } from "../src/trails";
import type { Topic } from "../src/planner";
const topic = (id:string): Topic => ({ id,name:id,contest:"c",discipline:"d",disciplineName:"Disciplina",progress:0,steps:[],due:0,video:false,reading:false,cards:false });
const topics=[topic("base"),topic("avancado"),topic("outro")];
const config: TrailConfig={minutes:[180,180,180,180,180,0,0],measure:"questions",topics:[
  {topic_id:"base",requires:[],minutes:30,estimated_priority:"low"},
  {topic_id:"avancado",requires:["base"],minutes:30,estimated_priority:"high"},
  {topic_id:"outro",requires:[],minutes:30,estimated_priority:"medium"},
]};
const evidence=[{topic_id:"avancado",board:"Banca",sample:10,occurrences:8,source_url:"https://example.org/provas",period_start:"2020-01-01",period_end:"2025-01-01",measure:"questions" as const}];
it("antecipa o conteúdo documentado com seu pré-requisito e não atribui frequência ao pré-requisito",()=>{
  const week=buildTrailWeek(topics,config,evidence,"Banca","2026-11-23",[],"2026-11-23");
  expect(week.sessions.map(s=>s.topic_id)).toEqual(["base","avancado","outro"]);
  expect(week.sessions[0].reason).toContain("Sem dados de incidência");
  expect(week.sessions[1].reason).toContain("80%");
  expect(week.sessions[1].source_url).toBe("https://example.org/provas");
  expect(week.sessions[1].reason).not.toContain("probabilidade");
});
it("não mistura banca, unidade de amostra nem evidência incompleta",()=>{
  const records=[{...evidence[0],board:"Outra"},{...evidence[0],measure:"exams" as const},{...evidence[0],period_start:null}];
  expect(buildTrailWeek(topics,config,records,"Banca","2026-11-23",[],"2026-11-23").sessions.every(s=>s.reason.includes("Sem dados"))).toBe(true);
});
it("respeita disponibilidade, preserva conclusões e não libera um assunto após cumprir só parte do pré-requisito",()=>{
  const small={...config,minutes:[15,0,0,0,0,0,0]};
  const first=buildTrailWeek(topics,small,evidence,"Banca","2026-11-23",[],"2026-11-23");
  expect(first.sessions.reduce((sum,s)=>sum+s.minutes,0)).toBe(15);
  first.sessions[0]={...first.sessions[0],done:true,done_at:"2026-11-23T15:00:00Z"};
  const next=buildTrailWeek(topics,small,evidence,"Banca","2026-11-23",[first],"2026-11-23");
  expect(next.sessions).toEqual(first.sessions);
  expect(topicDone("base",topics,[first],config)).toBe(false);
  expect(next.warnings.length).toBeGreaterThan(0);
});
it("rejeita ciclos e referências inválidas e aceita reimportação com IDs estáveis",()=>{
  const doc={schema_version:"1.0",type:"study_trail",contest_id:"c",topics:config.topics};
  const ids=new Set(topics.map(t=>t.id));
  expect(parseTrail(JSON.stringify(doc),"c",ids)).toEqual(config.topics);
  expect(parseTrail(JSON.stringify(doc),"c",ids)).toEqual(config.topics);
  expect(()=>parseTrail(JSON.stringify({...doc,topics:[{...config.topics[0],requires:["ausente"]}]}),"c",ids)).toThrow(/inválido/);
  expect(()=>parseTrail(JSON.stringify({...doc,topics:[{...config.topics[0],requires:["avancado"]},config.topics[1]]}),"c",ids)).toThrow(/ciclo/);
});
it("não agenda na data da prova ou depois dela",()=>{
  const week=buildTrailWeek(topics,config,evidence,"Banca","2026-11-23",[],"2026-11-23","2026-11-23");
  expect(week.sessions).toHaveLength(0);
  expect(week.warnings.join(" ")).toContain("data da prova");
});
