import { expect,it } from "vitest";
import { appliesTo,linkedNodes,possibleDuplicates } from "../src/library";
import { parseLibraryBatch,materialFromEntry } from "../src/library-import";
import type { Node } from "../src/domain";
const entry={id:"resumo-ldb",title:"Resumo LDB",kind:"text" as const,section:"Teoria e resumos" as const,body:"Conteúdo de teste",author:"Autora"};
it("usa um único material em múltiplos conteúdos e desfaz vínculos sem alterar o original",()=>{
 const m=materialFromEntry(entry,"user"); m.topic_id="old";
 const links=[{user_id:"user",material_id:m.id,node_id:"new",active:true},{user_id:"user",material_id:m.id,node_id:"old",active:false}];
 expect(linkedNodes(m,links,"user")).toEqual(["new"]); expect(m.topic_id).toBe("old");
 const nodes=[{id:"new",parent_id:null,kind:"discipline"},{id:"child",parent_id:"new",kind:"topic"}] as Node[];
 expect(appliesTo(m,"child",nodes,links,"user")).toBe(true);
 expect(appliesTo(m,"child",nodes,links,"other")).toBe(false);
});
it("detecta conteúdo, IDs e URLs equivalentes sem unificar nem excluir automaticamente",()=>{
 const m=materialFromEntry(entry,"user");
 expect(possibleDuplicates({...m,id:"other",title:"Outro título"},[m])).toHaveLength(1);
 const a={...m,kind:"youtube" as const,url:"https://youtu.be/abcdefghijk",body:"",library_key:"a"};
 const b={...a,id:"new",library_key:"b",title:"Nova aula",url:"https://www.youtube.com/watch?v=abcdefghijk"};
 expect(possibleDuplicates(b,[a])).toHaveLength(1); expect(a.title).toBe("Resumo LDB");
});
it("analisa JSON estrito e mantém os contratos anteriores separados",()=>{
 expect(parseLibraryBatch(JSON.stringify({schema_version:"1.0",type:"library_batch",materials:[entry]}))).toEqual([entry]);
 for(const materials of [[{...entry,extra:"inválido"}],[entry,entry],[{...entry,kind:"link",url:"https://user:secret@example.test"}]]) {
  expect(()=>parseLibraryBatch(JSON.stringify({schema_version:"1.0",type:"library_batch",materials}))).toThrow();
 }
 expect(()=>parseLibraryBatch("```json\n{}\n```")).toThrow();
});
