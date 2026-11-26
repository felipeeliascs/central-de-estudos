// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { exerciseModel } from "./model-checks";
import { exerciseCatalog } from "./catalog-checks";
import { exerciseFlashcards } from "./flash-sql-checks";
import { exerciseQuestions } from "./questions-sql";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const contest = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  discipline = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  topic = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const privateId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  sharedId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
it("executa a migração e verifica isolamento no PostgreSQL com duas contas, leitor, editor e anônimo", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create role authenticated; create role anon; grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated; create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;insert into auth.users(id) values('${a}'),('${b}');`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250001_study_library.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const file of [
      "202611250002_relational_auth.sql",
      "202611250003_integrity_admin.sql",
      "202611250004_contest_catalog.sql",
      "202611250005_adaptive_plan.sql",
    ])
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    async function account(id: string) {
      await db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}';`,
      );
    }
    await account(a);
    await db.exec(
      `insert into public.study_nodes(id,parent_id,kind,name,owner_id) values('${contest}',null,'contest','Concurso','${a}');insert into public.study_nodes(id,parent_id,kind,name,owner_id) values('${discipline}','${contest}','discipline','Disciplina','${a}');insert into public.study_nodes(id,parent_id,kind,name,owner_id) values('${topic}','${discipline}','topic','Assunto','${a}');insert into public.study_members values('${contest}','${b}','reader');insert into public.study_materials(id,topic_id,owner_id,section,title,kind,body,visibility,shared_with,file_path) values('${privateId}','${topic}','${a}','Teoria e resumos','Privado','text','Texto','private','{}',''),('${sharedId}','${topic}','${a}','Bibliografia','Compartilhado','pdf','','shared',array['${b}']::uuid[],'${a}/${sharedId}/file.pdf');insert into public.study_checks values('${a}','${topic}',0,true);insert into public.study_notes values('${a}','${topic}','Segredo');insert into storage.objects(bucket_id,name) values('study-materials','${a}/${sharedId}/file.pdf');`,
    );
    await exerciseModel(db, a, b, topic, contest);
    await account(b);
    expect(
      (await db.query("select * from public.study_nodes")).rows,
    ).toHaveLength(3);
    expect(
      (
        await db.query<{ title: string }>(
          "select title from public.study_materials",
        )
      ).rows,
    ).toEqual([{ title: "Compartilhado" }]);
    expect(
      (await db.query("select * from public.study_checks")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.study_notes")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query(
          `update public.study_materials set title='Ataque' where id='${sharedId}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.study_materials where id='${sharedId}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `insert into public.study_checks values('${a}','${topic}',1,true)`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(
        `insert into public.study_members values('${contest}','${b}','editor') on conflict(contest_id,user_id) do update set role='editor'`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(
        `insert into storage.objects(bucket_id,name) values('study-materials','${a}/${sharedId}/evil.pdf')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(`select public.study_move_material('${sharedId}',1)`),
    ).rejects.toThrow(/Sem permissão/);
    expect(
      (
        await db.query(
          `update public.study_nodes set name='Ataque' where id='${topic}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec(
      `insert into public.study_checks values('${b}','${topic}',0,true);insert into public.study_notes values('${b}','${topic}','Pessoal B');`,
    );
    await account(a);
    const extra = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
    await db.exec(
      `insert into public.study_materials(id,topic_id,owner_id,section,title,kind,body,position) values('${extra}','${topic}','${a}','Teoria e resumos','Segundo','text','Texto',1);select public.study_move_material('${privateId}',1);`,
    );
    expect(
      (
        await db.query<{ id: string }>(
          `select id from public.study_materials where section='Teoria e resumos' order by position,id`,
        )
      ).rows.map((r) => r.id),
    ).toEqual([extra, privateId]);
    await db.exec(
      `select public.study_move_material('${privateId}',-1);delete from public.study_materials where id='${extra}';`,
    );
    expect(
      (await db.query<{ body: string }>("select body from public.study_notes"))
        .rows,
    ).toEqual([{ body: "Segredo" }]);
    await db.exec(
      `update public.study_members set role='editor' where user_id='${b}'`,
    );
    await account(b);
    expect(
      (
        await db.query(
          `update public.study_nodes set name='Renomeado' where id='${topic}' returning id`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.study_checks")).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        `update public.study_nodes set owner_id='${b}' where id='${topic}'`,
      ),
    ).rejects.toThrow(/imut/);
    await account(a);
    await db.exec(
      `update public.study_materials set visibility='private',shared_with='{}' where id='${sharedId}'`,
    );
    await account(b);
    expect(
      (await db.query("select * from public.study_materials")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await account(a);
    await db.exec(`delete from public.study_members where user_id='${b}'`);
    await account(b);
    expect(
      (await db.query("select * from public.study_nodes")).rows,
    ).toHaveLength(0);
    await exerciseCatalog(db, a, b, contest);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250006_flashcards.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await exerciseFlashcards(db, a, b, contest, topic);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250007_productivity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await account(a);
    const sessionId = crypto.randomUUID();
    const insertSession = `select public.study_save_session($1,$2,'2026-11-25T12:00:00Z','2026-11-25T12:10:00Z',600,'theory',$1)`;
    await db.query(insertSession, [sessionId, topic]);
    await db.query(insertSession, [sessionId, topic]);
    expect(
      (
        await db.query("select * from public.study_sessions where id=$1", [
          sessionId,
        ])
      ).rows,
    ).toHaveLength(1);
    await account(b);
    expect(
      (
        await db.query("select * from public.study_sessions where id=$1", [
          sessionId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.study_sessions set seconds=1 where id=$1 returning id",
          [sessionId],
        )
      ).rows,
    ).toHaveLength(0);
    await account(a);
    await db.exec(
      `insert into public.study_adaptive_plans(state) values('{}');`,
    );
    await account(b);
    expect(
      (await db.query("select * from public.study_adaptive_plans")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `update public.study_adaptive_plans set revision=10 returning *`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `insert into public.study_adaptive_plans(user_id,state) values('${a}','{}')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250008_questions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await exerciseQuestions(db, a, b, topic);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250009_prompt_library.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await account(b);
    await expect(
      db.query(
        `select public.prompt_publish(null,'Título','Descrição','Texto','Passos','Exemplo','none')`,
      ),
    ).rejects.toThrow(/administradores/);
    await account(a);
    const published = await db.query<{ id: string }>(
      `select public.prompt_publish(null,'Título','Descrição','Texto','Passos','Exemplo','none') as id`,
    );
    await db.query(
      `select public.prompt_publish($1,'Título','Descrição','Texto 2','Passos','Exemplo','none')`,
      [published.rows[0].id],
    );
    expect(
      (
        await db.query(
          "select * from public.prompt_template_versions where template_id=$1",
          [published.rows[0].id],
        )
      ).rows,
    ).toHaveLength(2);
    await account(b);
    expect(
      (
        await db.query(
          "select * from public.prompt_template_versions where template_id=$1",
          [published.rows[0].id],
        )
      ).rows,
    ).toHaveLength(2);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250010_storage_lookup.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      (
        await db.query(
          "select 1 from pg_indexes where indexname='study_materials_file_path_idx'",
        )
      ).rows,
    ).toHaveLength(1);
    await account(a);
    const fileName = `${a}/${sharedId}/file.pdf`;
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          fileName,
        ])
      ).rows,
    ).toEqual([{ name: fileName }]);
    await account(b);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          fileName,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [fileName],
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202611250011_admin_dashboard.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query(
      "update auth.users set email='student@example.test', email_confirmed_at=now() where id=$1",
      [b],
    );
    await account(b);
    await expect(
      db.query("select public.study_admin_overview()"),
    ).rejects.toThrow(/Apenas administradores/);
    await expect(
      db.query(
        "select public.study_admin_allow_signup('other@example.test', 7)",
      ),
    ).rejects.toThrow(/Apenas administradores/);
    await expect(
      db.query("select public.study_admin_revoke_signup('other@example.test')"),
    ).rejects.toThrow(/Apenas administradores/);
    await account(a);
    const visible = await db.query<{ result: { users: unknown[] } }>(
      "select public.study_admin_overview('STUDENT@') as result",
    );
    expect(visible.rows[0].result.users).toEqual([
      {
        id: b,
        email: "student@example.test",
        display_name: "",
        role: "student",
        confirmed: true,
      },
    ]);
    expect(
      (await db.query("select * from public.study_notes where user_id=$1", [b]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "select public.study_admin_allow_signup('student@example.test', 7)",
      ),
    ).rejects.toThrow(/Já existe/);
    await expect(
      db.query(
        "select public.study_admin_allow_signup('future@example.test', 31)",
      ),
    ).rejects.toThrow(/1 e 30/);
    await db.query(
      "select public.study_admin_allow_signup('Future@example.test', 7)",
    );
    const pending = await db.query<{
      result: { authorizations: { email: string; active: boolean }[] };
    }>("select public.study_admin_overview('future@') as result");
    expect(pending.rows[0].result.authorizations[0]).toMatchObject({
      email: "future@example.test",
      active: true,
    });
    const revoked = await db.query<{ revoked: boolean }>(
      "select public.study_admin_revoke_signup('Future@example.test') as revoked",
    );
    expect(revoked.rows[0].revoked).toBe(true);
    await db.exec("reset role");
    await expect(
      db.query(
        "insert into auth.users(id,email) values(gen_random_uuid(),'future@example.test')",
      ),
    ).rejects.toThrow(/Cadastro não autorizado/);
    await db.exec("reset role;set role anon;");
    await expect(
      db.query("select public.study_admin_overview()"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select * from public.study_materials"),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
}, 60000);
