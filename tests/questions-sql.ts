import type { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import type { Attempt } from "../src/questions";
export async function exerciseQuestions(
  db: PGlite,
  a: string,
  b: string,
  topic: string,
) {
  const account = (id: string) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  const item = {
    topic_id: topic,
    statement: "Questão nova de teste",
    explanation: "Explicação original",
    options: ["Certa", "Errada"],
    answer: 0,
    source: "author",
    difficulty: "medium",
  };
  await account(a);
  await db.query("select public.study_add_questions($1,true)", [
    JSON.stringify([item, { ...item, statement: "Questão dois" }]),
  ]);
  expect(
    (
      await db.query<{ value: number }>(
        "select public.study_add_questions($1,true) as value",
        [JSON.stringify([{ ...item, statement: " QUESTÃO  NOVA DE TESTE " }])],
      )
    ).rows[0].value,
  ).toBe(0);
  const questions = (
    await db.query<{ id: string }>(
      "select id from public.study_questions where statement in ($1,$2) order by statement",
      [item.statement, "Questão dois"],
    )
  ).rows;
  const id = crypto.randomUUID();
  const started = (
    await db.query<{ value: Attempt }>(
      `select public.study_begin_attempt($1,'Teste','mock',30,$2) as value`,
      [id, JSON.stringify(questions.map((q, i) => ({ ...q, weight: i + 1 })))],
    )
  ).rows[0].value;
  expect(started.items[0]).not.toHaveProperty("answer");
  expect(started.correction).toBeNull();
  const pick = (question: string, choice: number) =>
    db.query("select public.study_attempt_step($1,$2,$3,true,1,false)", [
      id,
      question,
      choice,
    ]);
  await pick(questions[0].id, 1);
  await pick(questions[1].id, 0);
  await db.query(
    `update public.study_question_options set correct=not correct where question_id=$1`,
    [questions[1].id],
  );
  const reopen = (
    await db.query<{ value: Attempt }>(
      "select public.study_attempt_view($1) as value",
      [id],
    )
  ).rows[0].value;
  expect(reopen).toMatchObject({
    cursor: 1,
    picks: { [questions[0].id]: 1, [questions[1].id]: 0 },
    correction: null,
  });
  await account(b);
  expect(
    (
      await db.query<{ value: null }>(
        "select public.study_attempt_view($1) as value",
        [id],
      )
    ).rows[0].value,
  ).toBeNull();
  await expect(
    db.query("select public.study_attempt_step($1,null,null,null,null,true)", [
      id,
    ]),
  ).rejects.toThrow(/indisponível/);
  await account(a);
  const done = (
    await db.query<{ value: Attempt }>(
      "select public.study_attempt_step($1,null,null,null,null,true) as value",
      [id],
    )
  ).rows[0].value;
  expect(done.score).toBe(66.67);
  expect(done.correction?.[1].answer).toBe(0);
  await db.query(
    "select public.study_attempt_step($1,null,null,null,null,true)",
    [id],
  );
  expect(
    (
      await db.query("select * from public.study_answers where attempt_id=$1", [
        id,
      ])
    ).rows,
  ).toHaveLength(2);
  const errors = await db.query(
    `select e.id from public.study_errors e join public.study_answers a on a.id=e.answer_id where a.attempt_id=$1`,
    [id],
  );
  expect(errors.rows).toHaveLength(1);
  const study = crypto.randomUUID();
  await db.query(
    `select public.study_begin_attempt($1,'Estudo','study',30,$2)`,
    [study, JSON.stringify([{ id: questions[0].id, weight: 1 }])],
  );
  const immediate = (
    await db.query<{ value: Attempt }>(
      "select public.study_attempt_step($1,$2,0,null,null,false) as value",
      [study, questions[0].id],
    )
  ).rows[0].value;
  expect(immediate.correction?.[0]).toMatchObject({
    correct: true,
    explanation: "Explicação original",
  });
  const late = crypto.randomUUID();
  await db.query(
    `select public.study_begin_attempt($1,'Tempo','diagnostic',1,$2)`,
    [late, JSON.stringify([{ id: questions[0].id, weight: 1 }])],
  );
  await db.exec("reset role");
  await db.query(
    `update public.study_attempt_runtime set deadline=clock_timestamp()-interval '1 second' where id=$1`,
    [late],
  );
  await account(a);
  const expired = (
    await db.query<{ value: Attempt }>(
      "select public.study_attempt_step($1,$2,0,null,null,false) as value",
      [late, questions[0].id],
    )
  ).rows[0].value;
  expect(expired.correction?.[0].selected).toBeNull();
}
