import { expect, it } from "vitest";
import { incidenceSummary } from "../src/incidence";
const value = { topic_id: "topic", board: "Banca fictícia", sample: 20, occurrences: 5, source_url: "https://example.org/provas", period_start: "2020-01-01", period_end: "2025-12-31" };
it("separa percentual de provas e de questões com os denominadores documentados", () => {
  expect(incidenceSummary({ ...value, measure: "exams" })).toContain("25% das provas (5/20 provas)");
  expect(incidenceSummary({ ...value, measure: "questions" })).toContain("25% das questões (5/20 questões)");
  expect(incidenceSummary({ ...value, measure: "exams", occurrences: 0 })).toContain("0%");
});
it("omite percentuais quando a evidência é incompleta ou inválida", () => {
  for (const changed of [{}, { measure: "exams" as const, sample: 0 }, { measure: "exams" as const, period_start: null }, { measure: "exams" as const, source_url: "javascript:alert(1)" }, { measure: "exams" as const, occurrences: 21 }, { measure: "exams" as const, period_start: "2020-02-31" }])
    expect(incidenceSummary({ ...value, ...changed })).toBeNull();
});
