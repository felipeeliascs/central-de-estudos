import { afterEach, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { flashStore } from "../src/flashcard-data";
import {
  defaultGoals,
  emptyContent,
  parseDeck,
  previewReview,
  ratings,
  reviewQueue,
  transition,
} from "../src/flashcards";
afterEach(() => localStorage.clear());
const now = new Date("2026-11-25T18:00:00Z");

it("usa as quatro avaliações e preserva o resultado da estimativa ao agendar", () => {
  const options = previewReview(undefined, now);
  expect(ratings.map((r) => r.grade)).toEqual([
    Rating.Again,
    Rating.Hard,
    Rating.Good,
    Rating.Easy,
  ]);
  for (const { grade } of ratings) {
    const next = transition(undefined, now, grade);
    expect(next.next_card.due).toBe(options[grade].card.due.toISOString());
    expect(next.review_log.rating).toBe(grade);
    expect(next.next_card.last_review).toBe(now.toISOString());
    expect(next.next_card.reps).toBe(1);
  }
  expect(options[Rating.Again].card.due.getTime()).toBeLessThan(
    options[Rating.Easy].card.due.getTime(),
  );
  const learning = transition(undefined, now, Rating.Again).next_card;
  expect(
    transition(learning, new Date(learning.due), Rating.Good).next_card.reps,
  ).toBe(2);
});

it("retoma o mesmo evento após recarregar e mantém estado e histórico idempotentes no modo local", async () => {
  const initial = flashStore("aluno-a", true);
  const event = initial.prepare("card", undefined, Rating.Good, now);
  expect(() => initial.prepare("card", undefined, Rating.Easy, now)).toThrow(
    /pendente/,
  );
  const reloaded = flashStore("aluno-a", true);
  expect(reloaded.pending()).toEqual(event);
  await reloaded.submit(event);
  await reloaded.submit(event);
  const saved = await flashStore("aluno-a", true).load();
  expect(saved.states.card).toEqual(event.next_card);
  expect(saved.logs).toHaveLength(1);
  expect(reloaded.pending()).toBeNull();
  expect((await flashStore("aluno-b", true).load()).logs).toEqual([]);
});

it("aplica metas, prioriza vencidos e ignora cartões arquivados", () => {
  const cards = ["fresh", "due", "archived"].map((id) => ({
    ...emptyContent,
    id,
    deck_id: "deck",
    archived: id === "archived",
  }));
  const state = transition(
    undefined,
    new Date("2026-11-24T18:00:00Z"),
    Rating.Again,
  ).next_card;
  const queue = reviewQueue(
    cards,
    { due: state },
    [],
    { ...defaultGoals, daily_new: 1, daily_reviews: 1 },
    now,
  );
  expect(queue).toMatchObject({ fresh: 1, pending: 1, overdue: 1, done: 0 });
  expect(queue.eligible.map((c) => c.id)).toEqual(["due"]);
  const done = {
    card_id: "due",
    rating: 1,
    reviewed_at: now.toISOString(),
    client_event_id: "event",
    before_state: state,
    after_state: state,
  };
  expect(
    reviewQueue(
      cards,
      { due: state },
      [done],
      { daily_new: 1, daily_reviews: 1 },
      now,
    ).eligible,
  ).toEqual([]);
});

it("importa alternativas e imagens HTTPS e rejeita URLs perigosas e índices inválidos", () => {
  const data = {
    schema_version: "1.0",
    type: "flashcard_deck",
    deck: { title: "Exemplo" },
    cards: [
      {
        front: "Qual?",
        back: "Explicação",
        choices: ["A", "B"],
        correct_choice: 1,
        front_image: "https://example.org/image.png",
      },
    ],
  };
  expect(parseDeck(JSON.stringify(data)).cards[0]).toMatchObject({
    correct_choice: 1,
    front_image: "https://example.org/image.png",
  });
  for (const changes of [
    { correct_choice: 2 },
    { front_image: "javascript:alert(1)" },
  ])
    expect(() =>
      parseDeck(
        JSON.stringify({ ...data, cards: [{ ...data.cards[0], ...changes }] }),
      ),
    ).toThrow(/Cartão 1/);
});
