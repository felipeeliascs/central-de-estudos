import { describe, expect, it } from "vitest";
import { demoData, demoUser } from "../src/demo";
import {
  progress,
  safeUrl,
  youtubeId,
  validateMaterial,
  validateFile,
} from "../src/domain";
describe("contratos de estudo", () => {
  it("calcula etapas por disciplina e concurso, sem incluir outra conta ou duplicar checks", () => {
    const data = demoData();
    const checks = [
      { topic_id: "demo-topic", user_id: demoUser, step: 0, done: true },
      { topic_id: "demo-subtopic", user_id: demoUser, step: 4, done: true },
      { topic_id: "demo-topic", user_id: "other", step: 1, done: true },
    ];
    expect(
      progress(data.nodes, [...checks, checks[0]], "demo-contest", demoUser),
    ).toEqual({ done: 2, total: 15, percent: 13 });
    expect(progress(data.nodes, checks, "demo-subtopic", demoUser)).toEqual({
      done: 1,
      total: 5,
      percent: 20,
    });
    expect(progress([], [], "missing", demoUser)).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });
  it("aceita somente links HTTPS sem credenciais e IDs oficiais do YouTube", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "http://example.com",
      "https://user:secret@example.com",
    ])
      expect(() => safeUrl(url)).toThrow();
    expect(youtubeId("https://youtu.be/abcdefghijk?t=5")).toBe("abcdefghijk");
    expect(youtubeId("https://www.youtube.com/shorts/abcdefghijk")).toBe(
      "abcdefghijk",
    );
    expect(
      youtubeId("https://youtube.com.attacker.test/watch?v=abcdefghijk"),
    ).toBeNull();
    expect(youtubeId("https://youtube.com/watch?v=bad")).toBeNull();
  });
  it("rejeita compartilhamento sem destinatários, textos vazios, cartões incompletos e arquivos perigosos", () => {
    const m = demoData().materials[0];
    expect(() =>
      validateMaterial({ ...m, visibility: "shared", shared_with: [] }),
    ).toThrow();
    expect(() =>
      validateMaterial({
        ...m,
        visibility: "shared",
        shared_with: ["invalid"],
      }),
    ).toThrow();
    expect(() =>
      validateMaterial({ ...m, section: "Flashcards", back: "" }),
    ).toThrow();
    expect(() => validateMaterial({ ...m, body: " " })).toThrow();
    expect(() =>
      validateFile(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })),
    ).toThrow();
    expect(() =>
      validateFile(
        new File([new Uint8Array(21 * 1024 * 1024)], "large.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toThrow();
  });
});
