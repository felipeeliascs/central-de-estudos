import { incidenceSummary } from "./incidence";
import type { Incidence } from "./productivity-data";
import type { ContestDocument } from "./contest-schema";
import { demoFlash } from "./flashcard-data";
import { demoQuestionResults } from "./question-data";
import type { Snapshot, Node } from "./domain";
import { supabase } from "./repository";
import {
  defaults,
  type Settings,
  type Block,
  type PlannerInputs,
} from "./planner";

export type PlanState = {
  settings: Settings;
  blocks: Block[];
  plannedOn: string;
};
export type SavedPlan = { state: PlanState; revision: number | null };
const empty = (): SavedPlan => ({
  state: { settings: structuredClone(defaults), blocks: [], plannedOn: "" },
  revision: null,
});
const key = (user: string) => `central-adaptive-plan:${user}`;
export async function readPlan(
  user: string,
  demo: boolean,
): Promise<SavedPlan> {
  if (demo) {
    const raw = localStorage.getItem(key(user));
    return raw ? (JSON.parse(raw) as SavedPlan) : empty();
  }
  const { data, error } = await supabase!
    .from("study_adaptive_plans")
    .select("state,revision")
    .eq("user_id", user)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SavedPlan | null) ?? empty();
}
export async function writePlan(
  user: string,
  demo: boolean,
  prior: SavedPlan,
  state: PlanState,
): Promise<SavedPlan> {
  const revision = (prior.revision ?? 0) + 1;
  if (demo) {
    localStorage.setItem(key(user), JSON.stringify({ revision, state }));
    return { revision, state };
  }
  const table = supabase!.from("study_adaptive_plans");
  const change =
    prior.revision === null
      ? table.insert({ user_id: user, revision, state })
      : table
          .update({ revision, state })
          .eq("user_id", user)
          .eq("revision", prior.revision);
  const { data, error } = await change.select("revision").maybeSingle();
  if (error?.code === "23505" || (!data && !error))
    throw new Error(
      "O plano mudou em outra aba. Reabra o planejamento e tente novamente.",
    );
  if (error) throw new Error(error.message);
  return { revision, state };
}

async function rows<T>(
  table: string,
  fields: string,
  order: string[] = ["id"],
): Promise<T[]> {
  const results: T[] = [];
  for (let start = 0; ; start += 200) {
    let query = supabase!.from(table).select(fields);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(start, start + 199);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    results.push(...page);
    if (page.length < 200) return results;
  }
}

export async function plannerInputs(
  snapshot: Snapshot,
  user: string,
  demo: boolean,
  now = new Date(),
): Promise<PlannerInputs> {
  const local = demo ? demoFlash(user) : null;
  const [
    enrolled,
    catalog,
    links,
    results,
    progress,
    states,
    cards,
    decks,
    incidence,
    exams,
    answers,
  ] = demo
    ? [
        snapshot.nodes
          .filter((n) => n.kind === "contest")
          .map((n) => ({ contest_id: n.id, status: "active" })),
        [],
        [],
        [],
        [],
        Object.entries(local!.states).map(([card_id, state]) => ({
          card_id,
          due: state.due,
        })),
        local!.cards,
        local!.decks,
        [],
        [],
        demoQuestionResults(user),
      ]
    : await Promise.all([
        rows<{ contest_id: string; status: string }>(
          "study_enrollments",
          "contest_id,status",
        ),
        rows<{ contest_id: string; document: ContestDocument }>(
          "study_catalog",
          "contest_id,document",
          ["contest_id"],
        ),
        rows<{ first_topic: string; second_topic: string }>(
          "study_topic_equivalences",
          "first_topic,second_topic",
          ["first_topic", "second_topic"],
        ),
        rows<{ topic_id: string; answered: number; correct: number }>(
          "study_external_results",
          "topic_id,answered,correct",
        ),
        rows<{ topic_id: string; status: string }>(
          "study_progress",
          "topic_id,status",
        ),
        rows<{ card_id: string; due: string }>(
          "study_fsrs_states",
          "card_id,due",
        ),
        rows<{ id: string; deck_id: string; archived: boolean }>(
          "study_cards",
          "id,deck_id,archived",
        ),
        rows<{ id: string; topic_id: string; archived: boolean }>(
          "study_decks",
          "id,topic_id,archived",
        ),
        rows<Incidence>(
          "study_historical_incidence",
          "topic_id,board,sample,occurrences,source_url,period_start,period_end,measure",
          ["topic_id", "board"],
        ),
        rows<{ topic_id: string; duration_minutes: number | null }>(
          "study_exams",
          "topic_id,duration_minutes",
        ),
        rows<{
          correct: boolean;
          study_questions: { topic_id: string } | null;
        }>("study_answers", "correct,study_questions(topic_id)"),
      ]);
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const selected = new Set(
    enrolled.filter((c) => c.status === "active").map((c) => c.contest_id),
  );
  const docs = new Map(catalog.map((c) => [c.contest_id, c.document]));
  function ancestry(node: Node) {
    const parents: Node[] = [node];
    let parent = node.parent_id;
    while (parent) {
      const next = nodes.get(parent);
      if (!next) break;
      parents.push(next);
      parent = next.parent_id;
    }
    return parents;
  }
  const contestNodes = snapshot.nodes.filter(
    (n) => n.kind === "contest" && !n.catalog_archived && selected.has(n.id),
  );
  const contests = contestNodes.map((n) => ({
    id: n.id,
    name: n.name,
    exam: docs.get(n.id)?.exam_date,
    mockMinutes:
      exams.find(
        (e) =>
          e.duration_minutes &&
          nodes.has(e.topic_id) &&
          ancestry(nodes.get(e.topic_id)!).at(-1)?.id === n.id,
      )?.duration_minutes ?? undefined,
  }));
  const active = new Set(contests.map((c) => c.id));
  const decksById = new Map(
    decks.filter((d) => !d.archived).map((d) => [d.id, d.topic_id]),
  );
  const cardTopics = new Map(
    cards
      .filter((c) => !c.archived)
      .map((c) => [c.id, decksById.get(c.deck_id)]),
  );
  const due = new Map<string, number>();
  for (const state of states) {
    const topic = cardTopics.get(state.card_id);
    if (topic && Date.parse(state.due) <= now.getTime())
      due.set(topic, (due.get(topic) ?? 0) + 1);
  }
  const scores = new Map<string, { correct: number; answered: number }>();
  function count(topic: string, correct: number, answered: number) {
    const previous = scores.get(topic) ?? { correct: 0, answered: 0 };
    scores.set(topic, {
      correct: previous.correct + correct,
      answered: previous.answered + answered,
    });
  }
  for (const result of results)
    count(result.topic_id, result.correct, result.answered);
  for (const answer of answers)
    if (answer.study_questions)
      count(answer.study_questions.topic_id, Number(answer.correct), 1);
  const topics: PlannerInputs["topics"] = [];
  for (const node of snapshot.nodes) {
    if (node.kind !== "topic" && node.kind !== "subtopic") continue;
    const path = ancestry(node);
    const root = path.at(-1)!;
    const discipline = path.find((n) => n.kind === "discipline");
    if (
      !active.has(root.id) ||
      !discipline ||
      path.some((n) => n.catalog_archived)
    )
      continue;
    const document = docs.get(root.id);
    const info = document?.items.find((i) => i.id === node.catalog_key);
    const disciplineInfo = document?.items.find(
      (i) => i.id === discipline.catalog_key,
    );
    const checked = [
      ...new Set(
        snapshot.checks
          .filter((c) => c.user_id === user && c.topic_id === node.id && c.done)
          .map((c) => c.step),
      ),
    ];
    const materials = snapshot.materials.filter(
      (m) => m.topic_id === node.id && !m.catalog_archived,
    );
    const score = scores.get(node.id);
    const evidence = incidence.find(
      (i) => i.topic_id === node.id && i.board === root.board && incidenceSummary(i) !== null,
    );
    topics.push({
      id: node.id,
      name: node.name,
      contest: root.id,
      discipline: discipline.id,
      disciplineName: `${root.name} · ${discipline.name}`,
      weight: disciplineInfo?.weight,
      questions: info?.questions ?? disciplineInfo?.questions,
      minutes: info?.minutes,
      priority: info?.priority
        ? { low: 1, medium: 2, high: 3 }[info.priority]
        : undefined,
      progress: progress.some(
        (p) => p.topic_id === node.id && p.status === "completed",
      )
        ? 1
        : checked.length / 5,
      steps: checked,
      accuracy: score?.answered ? score.correct / score.answered : undefined,
      due: due.get(node.id) ?? 0,
      video: materials.some((m) => m.section === "Videoaulas"),
      reading: materials.some((m) =>
        [
          "Bibliografia",
          "Teoria e resumos",
          "Legislação",
          "Mapas mentais",
        ].includes(m.section),
      ),
      cards:
        materials.some((m) => m.section === "Flashcards") ||
        [...cardTopics.values()].includes(node.id),
      incidence: evidence
        ? {
            rate: evidence.occurrences / evidence.sample,
            sample: evidence.sample,
            measure: evidence.measure ?? undefined,
            source: evidence.source_url,
          }
        : undefined,
    });
  }
  return {
    contests,
    topics,
    equivalences: links.map((l) => [l.first_topic, l.second_topic]),
  };
}
