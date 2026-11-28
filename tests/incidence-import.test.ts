import { expect,it } from "vitest";
import { previewIncidenceBatch } from "../src/incidence-import";
import { incidenceBatch,incidenceContext } from "./incidence-fixture";
const preview=(x:unknown)=>previewIncidenceBatch(JSON.stringify(x),incidenceContext);
it("aceita 31 assuntos, calcula a razão e distingue duplicata e atualização",()=>{
 const first=preview(incidenceBatch);
 expect(first.valid).toBe(true);expect(first.rows).toHaveLength(31);expect(first.missing).toEqual([]);
 const expected=first.rows.flatMap(x=>x.value?[x.value]:[]);
 const repeated=previewIncidenceBatch(JSON.stringify(incidenceBatch),{...incidenceContext,expected});
 expect(repeated.changes).toBe(0);expect(repeated.rows.every(x=>x.status.startsWith("Duplicata"))).toBe(true);
 const updated=previewIncidenceBatch(JSON.stringify({...incidenceBatch,sample:30}),{...incidenceContext,expected});
 expect(updated.changes).toBe(31);expect(updated.rows[0].status).toContain("substitui");
});
it.each(["texto {}","{} texto",'```json\n{}\n```','{"entries":}'])("rejeita sintaxe sem extrair JSON silenciosamente: %s",raw=>{
 expect(()=>previewIncidenceBatch(raw,incidenceContext)).toThrow(/sintaxe JSON inválida/);
});
it.each([{contest_id:"uuid-root"},{board:"Outra banca"},{measure:"percent"},{sample:0},{sample:1.5},{period_start:"2025-02-30"},{period_end:"2019-01-01"},{percent:20}])("rejeita cabeçalho inválido %o",changes=>{
 expect(()=>preview({...incidenceBatch,...changes})).toThrow();
});
it("identifica todos os erros de linhas com índice original",()=>{
 const entries=incidenceBatch.entries.map((x,i)=>i===29?{...x,item:"id-inexistente"}:i===30?{...x,occurrences:21}:x);
 const result=preview({...incidenceBatch,entries});
 expect(result.valid).toBe(false);
 expect(result.rows[29].status).toContain("$.entries[29].item");
 expect(result.rows[30].status).toContain("$.entries[30].occurrences");
 expect(result.rows.filter(x=>x.error)).toHaveLength(2);
});
it("rejeita URL insegura, campos extras e assuntos duplicados",()=>{
 for(const entry of [{...incidenceBatch.entries[0],source_url:"http://example.org"}, {...incidenceBatch.entries[0],source_url:"https://user:password@example.org"},{...incidenceBatch.entries[0],percent:10}]){
  expect(preview({...incidenceBatch,entries:[entry]}).valid).toBe(false);
 }
 expect(preview({...incidenceBatch,entries:[incidenceBatch.entries[0],incidenceBatch.entries[0]]}).valid).toBe(false);
});
it("preserva lacunas sem convertê-las em zero, limita texto e bloqueia arquivados",()=>{
 const gap={item:incidenceBatch.entries[1].item,reason:"Prova não disponibilizada"};
 const result=preview({...incidenceBatch,entries:[incidenceBatch.entries[0]],unavailable:[gap]});
 expect(result.valid).toBe(true);expect(result.rows[1].value).toBeUndefined();expect(result.missing).toHaveLength(29);
 expect(preview({...incidenceBatch,unavailable:[{item:"sub.17",reason:"x".repeat(181)}],entries:[]}).valid).toBe(false);
 expect(()=>previewIncidenceBatch(JSON.stringify(incidenceBatch),{...incidenceContext,doc:{...incidenceContext.doc,archived:true}})).toThrow(/reative/);
 const archived={...incidenceContext,doc:{...incidenceContext.doc,items:incidenceContext.doc.items.map(x=>({...x,archived:x.id==="disciplina"}))}};
 expect(previewIncidenceBatch(JSON.stringify(incidenceBatch),archived).valid).toBe(false);
});
