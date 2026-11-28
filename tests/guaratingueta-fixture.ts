import raw from "../examples/guaratingueta-001-2026-coordenador-pedagogico.json";
import {parseContest} from "../src/contest-schema";
import type {Snapshot} from "../src/domain";
import type {PlannerInputs} from "../src/planner";
export const guara=parseContest(JSON.stringify(raw));
export const uuid=(index:number)=>"90000000-0000-4000-8000-"+String(index).padStart(12,"0");
export function guaraSnapshot(user="qa-student"):Snapshot {
 const ids=new Map(guara.items.map((item,i)=>[item.id,uuid(i+2)]));
 return {libraryReady:true,nodes:[{id:uuid(1),parent_id:null,kind:"contest",name:guara.name,board:guara.board!,owner_id:"qa-admin",position:0},...guara.items.map((item,i)=>({id:ids.get(item.id)!,parent_id:item.parent?ids.get(item.parent)!:uuid(1),kind:item.kind,name:item.name,board:"",owner_id:"qa-admin",position:i,catalog_key:item.id}))],
 materials:guara.resources.map((r,i)=>({id:uuid(1000+i),topic_id:ids.get(r.item)!,owner_id:"qa-admin",section:"Bibliografia",title:r.title,kind:r.url?"link":"text",url:r.url??"",body:r.text??"",back:"",file_path:"",visibility:"shared",shared_with:[user],position:i,embed:false,verified:false,catalog_managed:true,author:r.author,edition:r.edition,work:r.title})),checks:[],notes:[],materialLinks:[]};
}
export function guaraPlanner():PlannerInputs {
 const snapshot=guaraSnapshot();
 const map=new Map(snapshot.nodes.map(n=>[n.id,n]));
 return {contests:[{id:uuid(1),name:guara.name,exam:guara.exam_date,mockMinutes:180}],equivalences:[],topics:snapshot.nodes.filter(n=>n.kind==="topic"||n.kind==="subtopic").map(n=>{
  let disc=n;while(disc.kind!=="discipline")disc=map.get(disc.parent_id!)!;
  return {id:n.id,name:n.name,contest:uuid(1),discipline:disc.id,disciplineName:disc.name,progress:0,steps:[],due:0,reading:disc.catalog_key==="especificos",video:false,cards:false};
 })};
}
