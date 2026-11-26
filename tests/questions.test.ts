import { afterEach, expect, it } from "vitest";
import {
  blankQuestion,
  importQuestions,
  selectQuestions,
  type BankQuestion,
} from "../src/questions";
import { demoQuestionResults, questionStore } from "../src/question-data";
import { demoData, demoUser } from "../src/demo";
const question = {
  ...blankQuestion,
  topic_id: "demo-topic",
  statement: "Enunciado inédito",
  options: ["Certa", "Errada"],
  explanation: "Explicação",
};
afterEach(() => localStorage.clear());
it("valida o lote, detecta duplicatas normalizadas e recusa importação de plataformas", () => {
  const doc = (questions: unknown[]) =>
    JSON.stringify({ schema_version: "1.0", type: "questions", questions });
  const topics = new Set([question.topic_id]);
  expect(
    importQuestions(
      doc([question, { ...question, statement: " ENUNCIADO  Inédito " }]),
      topics,
      [],
    ).map((q) => q.duplicate),
  ).toEqual([false, true]);
  expect(() =>
    importQuestions(doc([{ ...question, answer: 5 }]), topics, []),
  ).toThrow(/gabarito/i);
  expect(() =>
    importQuestions(
      doc([{ ...question, source_url: "https://www.qconcursos.com/questoes" }]),
      topics,
      [],
    ),
  ).toThrow(/link no caderno/);
});
it("interrompe quando alguma disciplina não tem a quantidade pedida", () => {
  const pool = [{ id: "one", playable: true } as BankQuestion];
  expect(() =>
    selectQuestions([{ id: "a", label: "Direito", count: 2, weight: 2, pool }]),
  ).toThrow(/1 disponíveis de 2/);
  expect(
    selectQuestions([{ id: "a", label: "Direito", count: 1, weight: 2, pool }]),
  ).toEqual([{ id: "one", weight: 2 }]);
});
it("salva respostas e marcações, esconde a correção e integra apenas respostas efetivas", async () => {
  const nodes = demoData().nodes;
  const db = questionStore(demoUser, true, nodes);
  await db.add([question, { ...question, statement: "Outra questão" }], false);
  const ids = (await db.load()).bank.map((q) => q.id);
  const started = await db.begin(
    "attempt",
    "Simulado",
    "mock",
    30,
    ids.map((id, index) => ({ id, weight: index + 1 })),
  );
  expect(started.items[0]).not.toHaveProperty("answer");
  await db.step(started.id, {
    item: ids[0],
    choice: 1,
    marked: true,
    cursor: 1,
  });
  const reopened = questionStore(demoUser, true, nodes);
  expect((await reopened.load()).attempts[0]).toMatchObject({
    picks: { [ids[0]]: 1 },
    flags: { [ids[0]]: true },
    cursor: 1,
    finished_at: null,
  });
  expect(demoQuestionResults(demoUser)).toHaveLength(0);
  await reopened.step(started.id, { item: ids[1], choice: 0 });
  expect((await reopened.step(started.id, { finish: true })).score).toBe(66.67);
  expect(demoQuestionResults(demoUser)).toHaveLength(2);
  await reopened.step(started.id, { finish: true });
  expect((await reopened.load()).errors).toHaveLength(1);
  expect(
    (await questionStore("other", true, nodes).load()).attempts,
  ).toHaveLength(0);
});
