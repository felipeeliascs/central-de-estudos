import { expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
export async function exerciseModel(
  db: PGlite,
  a: string,
  b: string,
  topic: string,
  contest: string,
) {
  const account = async (user: string) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${user}';`,
    );
  const q = crypto.randomUUID(),
    exam = crypto.randomUUID(),
    deck = crypto.randomUUID(),
    card = crypto.randomUUID(),
    attempt = crypto.randomUUID(),
    answer = crypto.randomUUID(),
    state = crypto.randomUUID(),
    plan = crypto.randomUUID();
  await db.exec(
    `insert into public.study_questions(id,owner_id,topic_id,visibility,shared_with,statement,source) values('${q}','${a}','${topic}','shared',array['${b}']::uuid[],'Pergunta','author');insert into public.study_exams(id,owner_id,topic_id,title,visibility,shared_with) values('${exam}','${a}','${topic}','Simulado','shared',array['${b}']::uuid[]);insert into public.study_exam_items(exam_id,question_id,position) values('${exam}','${q}',0);insert into public.study_decks(id,owner_id,topic_id,title,visibility,shared_with) values('${deck}','${a}','${topic}','Baralho','shared',array['${b}']::uuid[]);insert into public.study_cards(id,deck_id,front,back) values('${card}','${deck}','Frente','Verso');`,
  );
  const fixtures: Record<string, Record<string, unknown>> = {
    study_enrollments: { contest_id: contest },
    study_progress: { topic_id: topic },
    study_sessions: {
      topic_id: topic,
      started_at: new Date().toISOString(),
      client_event_id: crypto.randomUUID(),
    },
    study_external_results: { topic_id: topic, answered: 10, correct: 7 },
    study_exam_attempts: { id: attempt, exam_id: exam },
    study_answers: {
      id: answer,
      attempt_id: attempt,
      question_id: q,
      answer_snapshot: { answer: "A" },
      question_snapshot: { statement: "Pergunta" },
      correct: false,
    },
    study_errors: { topic_id: topic, answer_id: answer, reason: "Conceito" },
    study_fsrs_states: {
      id: state,
      card_id: card,
      algorithm_version: "test-schema-only",
    },
    study_review_logs: {
      state_id: state,
      card_id: card,
      rating: 3,
      before_state: {},
      after_state: {},
      client_event_id: crypto.randomUUID(),
    },
    study_daily_plans: { id: plan, day: "2026-11-25", available_minutes: 60 },
    study_plan_items: {
      topic_id: topic,
      plan_id: plan,
      kind: "theory",
      minutes: 30,
      position: 0,
    },
    study_imports: {
      kind: "contest",
      contract_version: "1",
      idempotency_key: crypto.randomUUID(),
      status: "preview",
    },
  };
  for (const [table, fields] of Object.entries(fixtures)) {
    const value = { id: crypto.randomUUID(), user_id: a, ...fields };
    fixtures[table] = value;
    const keys = Object.keys(value);
    await db.query(
      `insert into public.${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
      Object.values(value).map((v) =>
        typeof v === "object" ? JSON.stringify(v) : v,
      ),
    );
  }
  await expect(
    db.query(
      `insert into public.study_contest_versions(contest_id,version) values('${topic}',1)`,
    ),
  ).rejects.toThrow(/Concurso inválido/);
  await account(b);
  expect(
    (await db.query("select * from public.study_questions")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select * from public.study_cards")).rows,
  ).toHaveLength(1);
  for (const [table, fields] of Object.entries(fixtures)) {
    expect(
      (await db.query(`select * from public.${table}`)).rows,
      table,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `update public.${table} set updated_at=now() where id=$1 returning id`,
          [fields.id],
        )
      ).rows,
      table,
    ).toHaveLength(0);
    expect(
      (
        await db.query(`delete from public.${table} where id=$1 returning id`, [
          fields.id,
        ])
      ).rows,
      table,
    ).toHaveLength(0);
  }
  await expect(
    db.query(
      `insert into public.study_plan_items(user_id,topic_id,plan_id,kind,minutes,position) values('${b}','${topic}','${plan}','theory',5,1)`,
    ),
  ).rejects.toThrow(/foreign key/);
  await expect(
    db.query(
      `insert into public.study_sessions(user_id,topic_id,started_at,client_event_id) values('${a}','${topic}',now(),gen_random_uuid())`,
    ),
  ).rejects.toThrow(/row-level security/);
  await expect(
    db.query(
      `insert into public.study_roles values('${b}','admin',now(),now())`,
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query(
      `select public.study_authorize_email('new@example.test',now()+interval '1 day')`,
    ),
  ).rejects.toThrow(/Sem permissão/);
  await expect(
    db.query(
      `update public.study_profiles set user_id='${a}' where user_id='${b}'`,
    ),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  await db.exec(
    `insert into public.study_roles(user_id,role) values('${a}','admin');`,
  );
  await account(a);
  await db.exec(
    `select public.study_authorize_email('new@example.test',now()+interval '1 day')`,
  );
  await db.exec("reset role");
  await expect(
    db.query(
      `insert into auth.users(id,email) values(gen_random_uuid(),'blocked@example.test')`,
    ),
  ).rejects.toThrow(/Cadastro não autorizado/);
  const newcomer = crypto.randomUUID();
  await db.exec(
    `insert into auth.users(id,email) values('${newcomer}','new@example.test')`,
  );
  await expect(
    db.query(
      `insert into auth.users(id,email) values(gen_random_uuid(),'new@example.test')`,
    ),
  ).rejects.toThrow(/Cadastro não autorizado/);
  expect(
    (
      await db.query(
        `select * from public.study_profiles where user_id='${newcomer}'`,
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        `select * from public.study_roles where user_id='${newcomer}'`,
      )
    ).rows,
  ).toHaveLength(0);
  await account(a);
  for (const [table, fields] of Object.entries(fixtures)) {
    expect(
      (await db.query(`select * from public.${table} where id=$1`, [fields.id]))
        .rows,
      table,
    ).toHaveLength(1);
  }
  // Keep the original library assertions isolated from the added schema fixtures.
  for (const table of Object.keys(fixtures).reverse())
    await db.exec(`reset role;delete from public.${table};`);
  await account(a);
}
