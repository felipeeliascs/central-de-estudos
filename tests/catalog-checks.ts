import type { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import base from "../examples/concurso-ficticio.json";
import update from "../examples/retificacao-ficticia.json";
export async function exerciseCatalog(
  db: PGlite,
  a: string,
  b: string,
  existing: string,
) {
  const account = async (id: string) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  const apply = async (
    doc: unknown,
    expected: unknown = null,
    target: string | null = null,
  ) =>
    (
      await db.query<{ id: string }>(
        "select public.study_apply_catalog($1::jsonb,$2::jsonb,$3,gen_random_uuid(),'import') as id",
        [
          JSON.stringify(doc),
          expected === null ? null : JSON.stringify(expected),
          target,
        ],
      )
    ).rows[0].id;
  await account(a);
  const listed = { ...base, listed: true };
  const id = await apply(listed);
  expect(await apply(listed)).toBe(id);
  const node = (
    await db.query<{ id: string }>(
      `select id from public.study_nodes where catalog_key='a01'`,
    )
  ).rows[0].id;
  const legacy = (
    await db.query<{ doc: typeof base }>(
      "select public.study_catalog_document($1) as doc",
      [existing],
    )
  ).rows[0].doc;
  expect(
    await apply(
      { ...legacy, name: "Concurso anterior renomeado" },
      legacy,
      existing,
    ),
  ).toBe(existing);
  await account(b);
  expect(
    (
      await db.query("select * from public.study_catalog where contest_id=$1", [
        id,
      ])
    ).rows,
  ).toHaveLength(1);
  await expect(apply({ ...base, id: "nao-autorizado" })).rejects.toThrow(
    /administradores/,
  );
  await db.query(
    `insert into public.study_enrollments(contest_id,user_id) values($1,$2)`,
    [id, b],
  );
  await db.query(
    `insert into public.study_checks(user_id,topic_id,step,done) values($1,$2,0,true);`,
    [b, node],
  );
  await db.query(
    `insert into public.study_notes(user_id,topic_id,body) values($1,$2,'Anotação privada');`,
    [b, node],
  );
  await db.query(
    `insert into public.study_progress(user_id,topic_id,status) values($1,$2,'completed');`,
    [b, node],
  );
  await db.query(
    `insert into public.study_materials(owner_id,topic_id,section,title,kind,body,back) values($1,$2,'Flashcards','Cartão manual','text','Frente','Verso');`,
    [b, node],
  );
  await db.query(
    `insert into public.study_questions(owner_id,topic_id,statement,source) values($1,$2,'Questão privada','author');`,
    [b, node],
  );
  expect(
    (
      await db.query(
        `select * from public.study_materials where topic_id=$1 and catalog_managed`,
        [node],
      )
    ).rows.length,
  ).toBeGreaterThan(0);
  await account(a);
  const revised = { ...update, listed: true };
  const bad = {
    ...revised,
    resources: [
      ...revised.resources,
      {
        id: "ruim",
        item: "ausente",
        kind: "material",
        title: "Inexistente",
        text: "Teste",
      },
    ],
  };
  await expect(apply(bad, listed, id)).rejects.toThrow(/assunto válido/);
  expect(
    (
      await db.query<{ name: string }>(
        "select name from public.study_nodes where id=$1",
        [node],
      )
    ).rows[0].name,
  ).toBe("Assunto fictício");
  expect(await apply(revised, listed, id)).toBe(id);
  expect(await apply(revised, listed, id)).toBe(id);
  await expect(
    apply({ ...revised, name: "Edição concorrente" }, listed, id),
  ).rejects.toThrow(/desatualizada/);
  expect(
    (
      await db.query(
        `select * from public.study_imports where summary->>'contest_id'=$1`,
        [id],
      )
    ).rows,
  ).toHaveLength(2);
  expect(
    (
      await db.query(
        `select * from public.study_contest_versions where contest_id=$1`,
        [id],
      )
    ).rows,
  ).toHaveLength(2);
  const second = (
    await db.query<{ id: string }>(
      `select id from public.study_nodes where kind='topic' and public.study_root(id)=$1`,
      [existing],
    )
  ).rows[0].id;
  await db.query("select public.study_set_equivalence($1,$2,true)", [
    node,
    second,
  ]);
  expect(
    (await db.query("select * from public.study_topic_equivalences")).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query("select * from public.study_checks where topic_id=$1", [
        node,
      ])
    ).rows,
  ).toHaveLength(0);
  await account(b);
  for (const table of [
    "study_checks",
    "study_notes",
    "study_questions",
    "study_progress",
  ])
    expect(
      (
        await db.query(`select * from public.${table} where topic_id=$1`, [
          node,
        ])
      ).rows,
    ).toHaveLength(1);
  expect(
    (
      await db.query(
        `select * from public.study_materials where topic_id=$1 and section='Flashcards'`,
        [node],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<{ name: string }>(
        "select name from public.study_nodes where id=$1",
        [node],
      )
    ).rows[0].name,
  ).toBe("Assunto fictício renomeado");
  expect(
    (
      await db.query(
        "select * from public.study_nodes where catalog_key=$1 and catalog_archived",
        ["s01"],
      )
    ).rows,
  ).toHaveLength(1);
}
