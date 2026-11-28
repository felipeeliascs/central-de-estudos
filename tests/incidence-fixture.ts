import { videoBase } from "./video-fixture";
import type { IncidenceImportContext } from "../src/incidence-import";
export const incidenceDoc={...videoBase,id:"incidencia-ficticia",board:"Banca fictícia"};
export const eligible=incidenceDoc.items.filter(x=>x.kind==="topic"||x.kind==="subtopic");
export const incidenceContext:IncidenceImportContext={target:"root",doc:incidenceDoc,itemMap:Object.fromEntries(eligible.map((x,i)=>[x.id,"uuid-"+i])),expected:[]};
export const incidenceBatch={schema_version:"1.0",type:"incidence_batch",contest_id:incidenceDoc.id,board:incidenceDoc.board,measure:"exams",period_start:"2020-01-01",period_end:"2025-12-31",sample:20,entries:eligible.map((x,i)=>({item:x.id,occurrences:i%20,source_url:"https://example.org/provas"})),unavailable:[]};
