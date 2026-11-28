import type { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import fixture from "../examples/roseira-ps-02-2026-matematica-parcial.json";
export async function exerciseRoseiraRegistration(db:PGlite,admin:string,student:string) {
 const account=(id:string)=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`);
 const apply=async(doc:unknown)=>(await db.query<{id:string}>("select public.study_apply_catalog($1::jsonb,null,null,gen_random_uuid(),'import') as id",[JSON.stringify(doc)])).rows[0].id;
 await account(student);
 await expect(apply(fixture)).rejects.toThrow(/administradores/);
 await account(admin);
 const id=await apply(fixture);
 expect(await apply(fixture)).toBe(id);
 expect((await db.query("select * from public.study_nodes where public.study_root(id)=$1",[id])).rows).toHaveLength(1);
 const saved=(await db.query<{doc:typeof fixture}>("select public.study_catalog_document($1) as doc",[id])).rows[0].doc;
 expect(saved).toMatchObject(fixture);
 expect((await db.query("select * from public.study_imports where summary->>'contest_id'=$1",[id])).rows).toHaveLength(1);
 expect((await db.query("select * from public.study_materials where catalog_managed and public.study_root(topic_id)=$1",[id])).rows).toHaveLength(0);
 await account(student);
 expect((await db.query("select * from public.study_catalog where contest_id=$1",[id])).rows).toHaveLength(0);
 await account(admin);
 // Available authenticated catalog is a separate, explicit action.
 const listed={...fixture,listed:true};
 await db.query("select public.study_apply_catalog($1::jsonb,$2::jsonb,$3,gen_random_uuid(),'import')",[JSON.stringify(listed),JSON.stringify(saved),id]);
 await account(student);
 expect((await db.query("select * from public.study_catalog where contest_id=$1",[id])).rows).toHaveLength(1);
 await db.query("insert into public.study_enrollments(contest_id,user_id) values($1,$2)",[id,student]);
 expect((await db.query("select * from public.study_enrollments where contest_id=$1 and user_id=$2",[id,student])).rows).toHaveLength(1);
 await expect(db.query("select public.study_apply_catalog($1::jsonb,$2::jsonb,$3,gen_random_uuid(),'import')",[JSON.stringify({...listed,name:"Alteração indevida"}),JSON.stringify(listed),id])).rejects.toThrow(/administradores/);
 await db.exec("reset role");
}
