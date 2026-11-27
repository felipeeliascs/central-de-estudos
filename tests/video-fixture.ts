import type { ContestDocument, Resource, SyllabusItem } from "../src/contest-schema";
// Synthetic reproduction of the reported ID collision; not the unavailable original file.
export const oldVideoId = "video-gestao-10-wiggins-planejamento-reverso";
const topics: SyllabusItem[] = Array.from({length:14},(_,i)=>({
 id: "gestao." + (i+1), parent:"disciplina", kind:"topic", name:"Assunto fictício " + (i+1)
}));
const subtopics: SyllabusItem[] = Array.from({length:17},(_,i)=>({
 id: "sub." + (i+1), parent:topics[i%14].id, kind:"subtopic", name:"Subassunto fictício " + (i+1)
}));
export const videoBase: ContestDocument = {
 schema_version:"1.0", type:"contest", id:"seduc-sp-pefm-01-2026-matematica",
 name:"Concurso fictício de teste", notice:{version:1}, listed:true,
 items:[{id:"disciplina",parent:null,kind:"discipline",name:"Disciplina fictícia"},...topics,...subtopics],
 resources:[{id:oldVideoId,item:"gestao.10",kind:"video",title:"Planejamento Reverso fictício anterior",url:"https://youtu.be/plL98oaMLsU"}]
};
const resources: Resource[] = [...topics,...subtopics].map((item,i)=>({
 id:"video-novo-" + i,item:item.id,kind:"video",title:"Aula fictícia " + (i+1),
 url:"https://youtu.be/" + String(i+1).padStart(11,"0")
}));
resources[9]={id:oldVideoId+"-novo",item:"gestao.10",kind:"video",title:"Planejamento Reverso fictício novo",url:"https://youtu.be/eyh02YUVxsI"};
export const validVideoBatch = {schema_version:"1.0",type:"video_batch",contest_id:videoBase.id,resources};
export const conflictingVideoBatch = {...validVideoBatch,resources:resources.map((r,i)=>i===9?{...r,id:oldVideoId}:r)};
