import { describe, expect, it } from "vitest";
import {
  addDays,
  capacity,
  defaults,
  generatePlan,
  type Block,
  type PlannerInputs,
  type Settings,
  type Topic,
} from "../src/planner";

const start = "2027-01-04";
const settings = (minutes = 50, finalDays = 30): Settings => ({
  ...defaults,
  minutes: [minutes, minutes, minutes, minutes, minutes, 0, 0],
  finalDays,
});
const subject = (changes: Partial<Topic> = {}): Topic => ({
  id: "a",
  name: "Assunto",
  contest: "c",
  discipline: "d",
  disciplineName: "Disciplina",
  steps: [],
  progress: 0,
  due: 0,
  video: true,
  reading: true,
  cards: true,
  ...changes,
});
const input = (topics: Topic[] = [subject()]): PlannerInputs => ({
  contests: [{ id: "c", name: "Concurso", exam: addDays(start, 60) }],
  topics,
  equivalences: [],
});

describe("motor de planejamento", () => {
  it("identifica corretamente a unidade de uma amostra de provas",()=>{
    const source=input([subject({incidence:{rate:0.25,sample:40,source:"https://example.org/provas",measure:"exams"}})]);
    expect(generatePlan(source,settings(),start).blocks.find(b=>b.kind==="new")?.reason).toContain("25% em 40 provas");
  });
  it('distingue incidência documentada de prioridade estimada',()=>{
    const source=input([subject({priority:3,incidence:{rate:0.25,sample:40,source:'https://example.org/provas'}})]);
    expect(generatePlan(source,settings(),start).blocks.find(b=>b.kind==='new')?.reason).toMatch(/prioridade estimada.*incidência documentada: 25% em 40 questões/);
  });
  it("é determinístico, distribui os seis tipos e respeita a meta de cada dia", () => {
    const source = input();
    const config = settings();
    const plan = generatePlan(source, config, start);
    expect(plan).toEqual(generatePlan(source, config, start));
    expect(new Set(plan.blocks.map((b) => b.kind))).toEqual(
      new Set(["new", "video", "reading", "questions", "review", "mock"]),
    );
    for (let i = 0; i < 28; i++) {
      const day = addDays(start, i);
      expect(
        plan.blocks
          .filter((b) => b.day === day)
          .reduce((sum, b) => sum + b.minutes, 0),
      ).toBeLessThanOrEqual(capacity(config, day));
    }
    expect(plan.blocks.every((b) => b.reason.length > 0)).toBe(true);
  });
  it("prioriza revisões vencidas, distingue baixo desempenho e considera prioridades manuais", () => {
    const source = input([
      subject({ id: "a", accuracy: 0.2, priority: 3 }),
      subject({ id: "b", discipline: "b", due: 5 }),
      subject({ id: "c", discipline: "c" }),
    ]);
    const config = {
      ...settings(),
      overrides: { c: { priority: 3, difficulty: 2 } },
    };
    const plan = generatePlan(source, config, start);
    expect(plan.blocks[0]).toMatchObject({
      kind: "review",
      topicIds: ["b"],
      dueReviews: true,
    });
    expect(plan.blocks.find((b) => b.topicIds.includes("a"))?.reason).toContain(
      "desempenho baixo",
    );
    expect(plan.blocks.find((b) => b.topicIds.includes("c"))?.reason).toMatch(
      /Ainda não avaliado.*prioridade manual.*dificuldade individual/,
    );
  });
  it("reagenda atrasos, preserva o histórico e mantém pendências durante pausa sem capacidade", () => {
    const source = input();
    const original = generatePlan(source, settings(25), start).blocks;
    const old = original.find((b) => b.day === start)!;
    const done: Block = {
      ...old,
      id: "completed",
      completed: true,
      minutes: 5,
    };
    const daysLater = addDays(start, 2);
    const paused = generatePlan(source, settings(0), daysLater, [
      ...original,
      done,
    ]);
    expect(paused.blocks).toContainEqual(done);
    expect(paused.blocks).toContainEqual(
      expect.objectContaining({ key: old.key, waiting: true, overdue: start }),
    );
    const resumed = generatePlan(source, settings(), daysLater, paused.blocks);
    expect(resumed.blocks).toContainEqual(done);
    expect(
      resumed.blocks.find(
        (b) => b.key === old.key && !b.completed && !b.waiting,
      ),
    ).toMatchObject({ overdue: start });
  });
  it("deduplica equivalências confirmadas entre concursos e agenda cada prova separadamente", () => {
    const source: PlannerInputs = {
      contests: [
        { id: "c", name: "Concurso A", exam: addDays(start, 14) },
        { id: "e", name: "Concurso B", exam: addDays(start, 20) },
      ],
      topics: [
        subject({ minutes: 10, reading: false, video: false }),
        subject({
          id: "b",
          contest: "e",
          discipline: "e",
          minutes: 10,
          reading: false,
          video: false,
        }),
      ],
      equivalences: [["a", "b"]],
    };
    const plan = generatePlan(source, settings(), start);
    expect(plan.blocks.filter((b) => b.kind === "new")).toEqual([
      expect.objectContaining({
        topicIds: ["a", "b"],
        contestIds: ["c", "e"],
        minutes: 10,
      }),
    ]);
    expect(
      plan.blocks
        .filter((b) => b.kind === "mock")
        .flatMap((b) => b.contestIds)
        .sort(),
    ).toEqual(["c", "e"]);
    expect(
      generatePlan(
        { ...source, equivalences: [] },
        settings(),
        start,
      ).blocks.filter((b) => b.kind === "new"),
    ).toHaveLength(2);
  });
  it("avisa sobre falta de tempo sem criar blocos fora da disponibilidade ou depois da prova", () => {
    const source = {
      ...input([subject({ minutes: 120 })]),
      contests: [{ id: "c", name: "Prova próxima", exam: addDays(start, 2) }],
    };
    const plan = generatePlan(source, settings(10), start);
    expect(plan.warnings.join(" ")).toContain("Cobertura estimada inviável");
    expect(plan.blocks.every((b) => b.day < source.contests[0].exam)).toBe(
      true,
    );
    expect(
      plan.blocks.reduce((sum, b) => sum + b.minutes, 0),
    ).toBeLessThanOrEqual(20);
  });
  it("antecipa simulado e revisão na reta final conforme antecedência configurada", () => {
    const source = {
      ...input([
        subject({ progress: 0.4, priority: 2 }),
        subject({ id: "b", discipline: "b", priority: 2, progress: 0.4 }),
      ]),
      contests: [{ id: "c", name: "Prova", exam: addDays(start, 12) }],
    };
    const normal = generatePlan(source, settings(60, 0), start);
    const final = generatePlan(source, settings(60, 30), start);
    expect(normal.blocks.every((b) => !b.reason.includes("reta final"))).toBe(
      true,
    );
    expect(final.blocks[0]).toMatchObject({
      kind: "review",
      reason: expect.stringContaining("reta final"),
    });
    expect(final.blocks.findIndex((b) => b.kind === "mock")).toBeLessThan(
      normal.blocks.findIndex((b) => b.kind === "mock"),
    );
    expect(final.blocks.every((b) => !b.reason.includes("incidência"))).toBe(
      true,
    );
  });
});
