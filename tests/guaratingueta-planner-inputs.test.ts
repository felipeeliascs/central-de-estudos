import {beforeEach,expect,it,vi} from "vitest";
import {guara,guaraSnapshot,uuid} from "./guaratingueta-fixture";
const {tables}=vi.hoisted(()=>({tables:{} as Record<string,unknown[]>}));
vi.mock("../src/repository",()=>({supabase:{from:(table:string)=>{
 const query={select:()=>query,order:()=>query,range:async(start:number,end:number)=>({data:(tables[table]??[]).slice(start,end+1),error:null})};return query;
}}}));
import {plannerInputs} from "../src/planner-data";
beforeEach(()=>{for(const key of Object.keys(tables))delete tables[key];});
it("adaptador conectado usa data prevista, quantidade da disciplina e bibliografia sem converter em incidência",async()=>{
 const snapshot=guaraSnapshot("qa-student"),topic=snapshot.nodes.find(n=>n.catalog_key==="ce-01")!.id;
 snapshot.checks=[{user_id:"qa-student",topic_id:topic,step:1,done:true}];
 tables.study_enrollments=[{contest_id:uuid(1),status:"active"}];
 tables.study_catalog=[{contest_id:uuid(1),document:guara}];
 tables.study_external_results=[{topic_id:topic,answered:10,correct:8}];
 tables.study_exams=[{topic_id:topic,duration_minutes:180}];
 const input=await plannerInputs(snapshot,"qa-student",false,new Date("2026-11-30T15:00:00Z"));
 expect(input.contests).toHaveLength(1);expect(input.contests[0]).toMatchObject({exam:"2027-02-21",mockMinutes:180});
 expect(input.topics).toHaveLength(175);
 const row=input.topics.find(t=>t.id===topic)!;
 expect(row).toMatchObject({questions:25,progress:0.2,accuracy:0.8,reading:true});
 expect(row.incidence).toBeUndefined();expect(row.weight).toBeUndefined();
 expect(input.equivalences).toEqual([]);
});
