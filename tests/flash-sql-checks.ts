import type { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";
import { Rating, type Grade } from "ts-fsrs";
import { parameters, schedulerVersion, transition } from "../src/flashcards";

export async function exerciseFlashcards(
  db: PGlite,
  a: string,
  b: string,
  contest: string,
  topic: string,
) {
  const account = (id: string) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  const deck = crypto.randomUUID(),
    card = crypto.randomUUID(),
    privateDeck = crypto.randomUUID();
  await account(a);
  await db.query(
    "insert into public.study_members(contest_id,user_id,role) values($1,$2,'reader')",
    [contest, b],
  );
  await db.query(
    "insert into public.study_decks(id,topic_id,title,visibility,shared_with) values($1,$2,'Compartilhado','shared',array[$3]::uuid[])",
    [deck, topic, b],
  );
  await db.query(
    "insert into public.study_cards(id,deck_id,front,back) values($1,$2,'Frente','Verso')",
    [card, deck],
  );
  const now = new Date();
  async function submit(event: string, grade: Grade, reps = 0) {
    const next = transition(undefined, now, grade);
    return (
      await db.query<{ id: string }>(
        `select public.study_save_flashcard_review($1,$2,$3,$4::smallint,$5,$6,$7,$8,$9) as id`,
        [
          card,
          event,
          reps,
          grade,
          now.toISOString(),
          JSON.stringify(next.next_card),
          JSON.stringify(next.review_log),
          schedulerVersion,
          JSON.stringify(parameters),
        ],
      )
    ).rows[0].id;
  }
  const event = crypto.randomUUID();
  const first = await submit(event, Rating.Good);
  expect(await submit(event, Rating.Good)).toBe(first);
  await expect(submit(crypto.randomUUID(), Rating.Easy)).rejects.toThrow(
    /outra sessão/,
  );
  expect(
    (
      await db.query(
        "select * from public.study_review_logs where card_id=$1",
        [card],
      )
    ).rows,
  ).toHaveLength(1);
  await account(b);
  expect(
    (await db.query("select * from public.study_cards where id=$1", [card]))
      .rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select * from public.study_fsrs_states where card_id=$1",
        [card],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select * from public.study_review_logs where card_id=$1",
        [card],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    db.query("update public.study_fsrs_states set reps=100 where card_id=$1", [
      card,
    ]),
  ).rejects.toThrow(/permission denied/);
  expect(await submit(event, Rating.Easy)).not.toBe(first);
  const easy = (
    await db.query<{ due: Date }>(
      "select due from public.study_fsrs_states where card_id=$1",
      [card],
    )
  ).rows[0].due;
  await account(a);
  const good = (
    await db.query<{ due: Date }>(
      "select due from public.study_fsrs_states where card_id=$1",
      [card],
    )
  ).rows[0].due;
  expect(easy).not.toEqual(good);
  expect(
    (
      await db.query(
        "select * from public.study_review_logs where card_id=$1",
        [card],
      )
    ).rows,
  ).toHaveLength(1);
  await db.query(
    "update public.study_decks set visibility='private',shared_with='{}' where id=$1",
    [deck],
  );
  await account(b);
  expect(
    (await db.query("select * from public.study_cards where id=$1", [card]))
      .rows,
  ).toHaveLength(0);
  await expect(submit(crypto.randomUUID(), Rating.Hard, 1)).rejects.toThrow(
    /indisponível/,
  );

  await account(a);
  const question = crypto.randomUUID(),
    exam = crypto.randomUUID(),
    attempt = crypto.randomUUID(),
    answer = crypto.randomUUID(),
    error = crypto.randomUUID();
  await db.query(
    `insert into public.study_questions(id,topic_id,statement,source,explanation) values($1,$2,'Pergunta','author','Explicação')`,
    [question, topic],
  );
  await db.query(
    `insert into public.study_question_options(question_id,label,body,correct) values($1,'A','Errada',false),($1,'B','Certa',true)`,
    [question],
  );
  await db.query(
    `insert into public.study_exams(id,topic_id,title) values($1,$2,'Teste')`,
    [exam, topic],
  );
  await db.query(
    `insert into public.study_exam_items(exam_id,question_id,position) values($1,$2,0)`,
    [exam, question],
  );
  await db.query(
    `insert into public.study_exam_attempts(id,exam_id) values($1,$2)`,
    [attempt, exam],
  );
  await db.query(
    `insert into public.study_answers(id,attempt_id,question_id,answer_snapshot,question_snapshot,correct) values($1,$2,$3,'{}','{}',false)`,
    [answer, attempt, question],
  );
  await db.query(
    `insert into public.study_errors(id,topic_id,answer_id,reason) values($1,$2,$3,'Erro')`,
    [error, topic, answer],
  );
  await db.query(
    `select public.study_import_flashcards($1,$2,'Privado','','[{"front":"Teste","back":"Verso"}]')`,
    [privateDeck, topic],
  );
  const converted = (
    await db.query<{ id: string }>(
      "select public.study_convert_error($1,$2) as id",
      [privateDeck, error],
    )
  ).rows[0].id;
  expect(
    (
      await db.query(
        "select source_question_id,source_error_id,correct_choice from public.study_cards where id=$1",
        [converted],
      )
    ).rows[0],
  ).toEqual({
    source_question_id: question,
    source_error_id: error,
    correct_choice: 1,
  });
  expect(
    (
      await db.query<{ id: string }>(
        "select public.study_convert_error($1,$2) as id",
        [privateDeck, error],
      )
    ).rows[0].id,
  ).toBe(converted);
  await expect(
    db.query(
      `update public.study_decks set visibility='shared',shared_with=array[$1]::uuid[] where id=$2`,
      [b, privateDeck],
    ),
  ).rejects.toThrow(/privados/);
}
