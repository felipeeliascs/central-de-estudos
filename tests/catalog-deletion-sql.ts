import type { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import sample from "../examples/concurso-ficticio.json";
export async function exerciseCatalogDeletion(db: PGlite,a: string,b: string) {
 const account=(id:string)=>db.exec("reset role;set role authenticated;set request.jwt.claim.sub='"+id+"'");
 const create=async(key:string)=>{
  await account(a);
  const doc={...sample,id:key,listed:true};
  const target=(await db.query<{id:string}>("select public.study_apply_catalog($1::jsonb,null,null,gen_random_uuid(),'import') id",[JSON.stringify(doc)])).rows[0].id;
  return {target,doc};
 };
 const status=(target:string)=>db.query<{value:{can_delete:boolean;reason:string}}>("select public.study_contest_deletion_status($1) value",[target]);
 const remove=(target:string,doc:unknown,key:string)=>db.query("select public.study_delete_contest($1,$2::jsonb,$3)",[target,JSON.stringify(doc),key]);
 const first=await create("exclusao-sem-estudos");
 expect((await status(first.target)).rows[0].value.can_delete).toBe(true);
 await account(b);
 await expect(status(first.target)).rejects.toThrow(/Sem permissão/);
 await expect(remove(first.target,first.doc,first.doc.id)).rejects.toThrow(/Sem permissão/);
 await db.exec("reset role");
 await db.query("insert into public.study_roles(user_id,role) values($1,'admin')",[b]);
 await account(b);
 await expect(remove(first.target,first.doc,first.doc.id)).rejects.toThrow(/Sem permissão/);
 await db.exec("reset role"); await db.query("delete from public.study_roles where user_id=$1",[b]);
 await account(b);
 await db.query("insert into public.study_enrollments(user_id,contest_id) values($1,$2)",[b,first.target]);
 await account(a);
 await expect(remove(first.target,first.doc,"errado")).rejects.toThrow(/ID externo/);
 await expect(remove(first.target,{...first.doc,name:"Prévia antiga"},first.doc.id)).rejects.toThrow(/desatualizada/);
 await expect(db.query("delete from public.study_nodes where id=$1",[first.target])).rejects.toThrow(/permission denied/);
 await remove(first.target,first.doc,first.doc.id);
 expect((await db.query("select id from public.study_nodes where id=$1",[first.target])).rows).toHaveLength(0);
 expect((await db.query("select * from public.study_catalog where contest_id=$1",[first.target])).rows).toHaveLength(0);
 const receipts=(await db.query<{kind:string}>("select kind from public.study_imports where summary->>'contest_id'=$1 order by kind",[first.target])).rows;
 expect(receipts.map(r=>r.kind)).toEqual(["contest:delete","contest:import"]);
 await account(b);
 expect((await db.query("select * from public.study_enrollments where contest_id=$1",[first.target])).rows).toHaveLength(0);

 const linked=await create("exclusao-com-estudos");
 const topic=(await db.query<{id:string}>("select id from public.study_nodes where catalog_key='a01' and public.study_root(id)=$1",[linked.target])).rows[0].id;
 expect((await status(linked.target)).rows[0].value.can_delete).toBe(true);
 await account(b);
 await db.query("insert into public.study_enrollments(user_id,contest_id) values($1,$2)",[b,linked.target]);
 await db.query("insert into public.study_notes(user_id,topic_id,body) values($1,$2,'Preservar nota privada')",[b,topic]);
 await db.query("insert into public.study_checks(user_id,topic_id,step,done) values($1,$2,0,true)",[b,topic]);
 await db.query("insert into public.study_materials(owner_id,topic_id,section,title,kind,body) values($1,$2,'Teoria e resumos','Material privado','text','Preservar')",[b,topic]);
 await account(a);
 expect((await status(linked.target)).rows[0].value).toMatchObject({can_delete:false});
 expect((await db.query("select * from public.study_notes where topic_id=$1",[topic])).rows).toHaveLength(0); // Admin cannot see private notes.
 await expect(remove(linked.target,linked.doc,linked.doc.id)).rejects.toThrow(/Arquive/);
 const archived={...linked.doc,archived:true};
 await db.query("select public.study_apply_catalog($1::jsonb,$2::jsonb,$3,gen_random_uuid(),'manual')",[JSON.stringify(archived),JSON.stringify(linked.doc),linked.target]);
 await account(b);
 expect((await db.query("select * from public.study_notes where topic_id=$1",[topic])).rows).toHaveLength(1);
 expect((await db.query("select * from public.study_checks where topic_id=$1",[topic])).rows).toHaveLength(1);
 expect((await db.query("select * from public.study_materials where topic_id=$1 and not catalog_managed",[topic])).rows).toHaveLength(1);

 const future=await create("exclusao-fk-futura");
 // A future dependency unknown to the preflight still rolls back every previous deletion.
 await db.exec("reset role;create table public.deletion_test_reference(material_id uuid references public.study_materials(id))");
 const material=(await db.query<{material_id:string}>("select material_id from public.study_catalog_resources where contest_id=$1 limit 1",[future.target])).rows[0].material_id;
 await db.query("insert into public.deletion_test_reference values($1)",[material]);
 await account(a);
 await expect(remove(future.target,future.doc,future.doc.id)).rejects.toThrow(/Arquive/);
 expect((await db.query<{doc:unknown}>("select public.study_catalog_document($1) doc",[future.target])).rows[0].doc).toEqual(future.doc);
 await db.exec("reset role");
 expect((await db.query("select * from public.study_catalog_resources where contest_id=$1",[future.target])).rows).toHaveLength(future.doc.resources.length);
 expect((await db.query("select * from public.study_materials where id=$1",[material])).rows).toHaveLength(1);
 await db.exec("drop table public.deletion_test_reference");
 await account(a); await remove(future.target,future.doc,future.doc.id);
 await db.exec("reset role;set role anon");
 await expect(status(linked.target)).rejects.toThrow(/permission denied/);
 await expect(remove(linked.target,archived,linked.doc.id)).rejects.toThrow(/permission denied/);
 await expect(db.query("select public.study_contest_delete_blocked($1)",[linked.target])).rejects.toThrow(/permission denied/);
}
