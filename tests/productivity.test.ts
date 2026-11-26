import { expect, it } from "vitest";
import {
  advance,
  dominance,
  elapsed,
  finish,
  pause,
  resume,
  type Timer,
} from "../src/productivity";
const timer: Timer = {
  id: "id",
  topic: "topic",
  mode: "theory",
  started: 0,
  accumulated: 0,
  runningSince: 0,
  phase: "focus",
  pomodoro: false,
  focusMinutes: 25,
  breakMinutes: 5,
  phaseStarted: 0,
  phaseAccumulated: 0,
  phaseEnd: null,
};
it("recupera pelo relógio após suspensão e exclui todo tempo pausado", () => {
  const first = pause(timer, 120000);
  expect(elapsed(first, 600000)).toBe(120000);
  const resumed = resume(first, 600000);
  expect(elapsed(resumed, 660000)).toBe(180000);
  const completed = finish(resumed, 660000);
  expect(completed.finalSeconds).toBe(180);
  expect(finish(completed, 900000)).toEqual(completed);
});
it("limita o foco Pomodoro e não conta intervalos, mesmo com dispositivo suspenso", () => {
  const focus = { ...timer, pomodoro: true, phaseEnd: 1500000 };
  const after = advance(focus, 3600000);
  expect(after.accumulated).toBe(1500000);
  expect(after.phase).toBe("break");
  expect(after.runningSince).toBeNull();
  const resting = resume(after, 3600000);
  const back = advance(resting, 5400000);
  expect(back.accumulated).toBe(1500000);
  expect(back.phase).toBe("focus");
  expect(finish(back, 5400000).finalSeconds).toBe(1500);
});
it("classifica domínio por desempenho, recência e evidência e diferencia ausência de dados", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const empty = { seconds: 0, answered: 0, correct: 0, reviews: 0 };
  expect(dominance(empty, now)).toBe("Não estudado");
  expect(dominance({ ...empty, answered: 20, correct: 0 }, now)).toBe(
    "Em aprendizagem",
  );
  expect(
    dominance(
      {
        ...empty,
        answered: 5,
        correct: 3,
        reviews: 1,
        lastReview: "2026-11-24T12:00:00Z",
      },
      now,
    ),
  ).toBe("Em revisão");
  expect(
    dominance(
      {
        ...empty,
        answered: 20,
        correct: 16,
        reviews: 2,
        lastQuestions: "2026-11-24T12:00:00Z",
        lastReview: "2026-11-24T12:00:00Z",
      },
      now,
    ),
  ).toBe("Dominado");
  expect(
    dominance(
      {
        ...empty,
        answered: 20,
        correct: 16,
        reviews: 2,
        lastQuestions: "2026-01-01T00:00:00Z",
        lastReview: "2026-01-01T00:00:00Z",
      },
      now,
    ),
  ).toBe("Em aprendizagem");
});
