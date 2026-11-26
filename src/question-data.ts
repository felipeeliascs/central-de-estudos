import { supabase } from "./repository";
import {
  grade,
  normalize,
  pathFor,
  type Attempt,
  type BankQuestion,
  type ErrorEntry,
  type Item,
  type QuestionDraft,
} from "./questions";
import type { Node } from "./domain";
import type { ContestDocument } from "./contest-schema";
import { flashStore } from "./flashcard-data";
type Selection = { id: string; weight: number }[];
type Patch = {
  item?: string;
  choice?: number;
  marked?: boolean;
  cursor?: number;
  finish?: boolean;
};
type Snapshot = Item & {
  answer: number;
  explanation: string;
  source_url: string | null;
};
type Local = {
  bank: (QuestionDraft & { id: string })[];
  attempts: Attempt[];
  keys: Record<string, Snapshot[]>;
  errors: ErrorEntry[];
};
const key = (user: string) => `central-questions:${user}`;
const read = (user: string): Local =>
  JSON.parse(
    localStorage.getItem(key(user)) ??
      '{"bank":[],"attempts":[],"keys":{},"errors":[]}',
  );
function save(user: string, data: Local) {
  localStorage.setItem(key(user), JSON.stringify(data));
}
export function demoQuestionResults(user: string) {
  return read(user).attempts.flatMap((a) =>
    (a.correction ?? [])
      .filter((row) => row.selected !== null)
      .map((row) => ({
        correct: row.correct,
        created_at: a.finished_at!,
        study_questions: { topic_id: row.item.topic_id },
      })),
  );
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const result = await supabase!.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
export function questionStore(user: string, demo: boolean, nodes: Node[]) {
  return {
    async load() {
      if (demo) {
        const data = read(user);
        return {
          bank: data.bank.map(({ answer, explanation, options, ...q }) => ({
            ...q,
            playable: options[answer] !== undefined && explanation.length > 0,
            owner_id: user,
          })),
          attempts: data.attempts,
          errors: data.errors,
          decks: (await flashStore(user, true).load()).decks.filter(
            (d) => !d.archived,
          ),
          catalog: [] as { contest_id: string; document: ContestDocument }[],
        };
      }
      const [bank, attempts, errors, decks, catalog] = await Promise.all([
        rpc<BankQuestion[]>("study_question_bank"),
        rpc<(Attempt | null)[]>("study_my_attempts"),
        supabase!
          .from("study_errors")
          .select(
            "id,topic_id,answer_id,reason,notes,resolved,external_url,image_url,external_statement,external_answer,answer:study_answers(question_id,question_snapshot,answer_snapshot,created_at)",
          )
          .order("created_at", { ascending: false }),
        supabase!
          .from("study_decks")
          .select("id,title,topic_id,owner_id,visibility,archived")
          .eq("owner_id", user)
          .eq("visibility", "private")
          .eq("archived", false),
        supabase!.from("study_catalog").select("contest_id,document"),
      ]);
      for (const r of [errors, decks, catalog])
        if (r.error) throw new Error(r.error.message);
      return {
        bank,
        attempts: attempts.filter((a): a is Attempt => !!a),
        errors: (errors.data ?? []) as unknown as ErrorEntry[],
        decks: decks.data ?? [],
        catalog: (catalog.data ?? []) as {
          contest_id: string;
          document: ContestDocument;
        }[],
      };
    },
    async add(batch: QuestionDraft[], importing: boolean) {
      if (!demo)
        return rpc<number>("study_add_questions", { batch, importing });
      const data = read(user);
      let count = 0;
      for (const q of batch)
        if (
          !data.bank.some(
            (x) => normalize(x.statement) === normalize(q.statement),
          )
        ) {
          data.bank.push({ ...q, id: crypto.randomUUID() });
          count++;
        }
      save(user, data);
      return count;
    },
    async begin(
      id: string,
      title: string,
      kind: Attempt["kind"],
      minutes: number,
      selection: Selection,
    ) {
      if (!demo)
        return rpc<Attempt>("study_begin_attempt", {
          attempt_ref: id,
          label: title,
          activity: kind,
          minutes,
          selection,
        });
      const data = read(user);
      const prior = data.attempts.find((a) => a.id === id);
      if (prior) return prior;
      const now = Date.now();
      const items = selection.map((s) => {
        const q = data.bank.find((x) => x.id === s.id);
        if (!q) throw new Error("Questão indisponível.");
        return {
          id: q.id,
          topic_id: q.topic_id,
          statement: q.statement,
          options: q.options,
          image_url: q.image_url,
          weight: s.weight,
          discipline_id: pathFor(nodes, q.topic_id)[1]?.id ?? "",
          answer: q.answer,
          explanation: q.explanation,
          source_url: q.source_url,
        };
      });
      const attempt: Attempt = {
        id,
        title,
        kind,
        started_at: new Date(now).toISOString(),
        deadline:
          kind === "study"
            ? null
            : new Date(now + minutes * 60000).toISOString(),
        finished_at: null,
        items: items.map(({ answer, explanation, source_url, ...item }) => {
          void answer;
          void explanation;
          void source_url;
          return item;
        }),
        picks: {},
        flags: {},
        cursor: 0,
        score: null,
      };
      data.attempts.unshift(attempt);
      data.keys[id] = items;
      save(user, data);
      return attempt;
    },
    async step(id: string, patch: Patch) {
      if (!demo)
        return rpc<Attempt>("study_attempt_step", {
          attempt_ref: id,
          item_ref: patch.item ?? null,
          choice: patch.choice ?? null,
          marked: patch.marked ?? null,
          next_cursor: patch.cursor ?? null,
          finalize: patch.finish ?? false,
        });
      const data = read(user);
      const attempt = data.attempts.find((a) => a.id === id);
      if (!attempt) throw new Error("Tentativa indisponível.");
      if (attempt.finished_at) return attempt;
      const expired =
        !!attempt.deadline && Date.now() >= Date.parse(attempt.deadline);
      if (!expired) {
        if (patch.item && patch.choice !== undefined)
          attempt.picks[patch.item] = patch.choice;
        if (patch.item && patch.marked !== undefined)
          attempt.flags[patch.item] = patch.marked;
        if (patch.cursor !== undefined) attempt.cursor = patch.cursor;
      }
      if (
        expired ||
        patch.finish ||
        (attempt.kind === "study" && patch.choice !== undefined)
      ) {
        attempt.finished_at = new Date().toISOString();
        const graded = grade(data.keys[id], attempt.picks);
        attempt.score = graded.score;
        attempt.correction = graded.correction;
        for (const row of graded.correction.filter(
          (r) => !r.correct && r.selected !== null,
        )) {
          const answer_id = crypto.randomUUID();
          data.errors.unshift({
            id: crypto.randomUUID(),
            topic_id: row.item.topic_id,
            answer_id,
            reason: "A classificar",
            notes: "",
            resolved: false,
            external_url: null,
            image_url: null,
            answer: {
              question_id: row.id,
              question_snapshot: row.item,
              answer_snapshot: { selected: row.selected! },
              created_at: attempt.finished_at,
            },
          });
        }
      }
      save(user, data);
      return attempt;
    },
    async editError(
      id: string,
      changes: Pick<
        ErrorEntry,
        "reason" | "notes" | "resolved" | "external_url" | "image_url"
      >,
    ) {
      if (demo) {
        const data = read(user);
        data.errors = data.errors.map((e) =>
          e.id === id ? { ...e, ...changes } : e,
        );
        save(user, data);
        return;
      }
      const result = await supabase!
        .from("study_errors")
        .update(changes)
        .eq("id", id)
        .select("id")
        .single();
      if (result.error) throw new Error(result.error.message);
    },
    async addExternalError(entry: ErrorEntry) {
      if (demo) {
        const data = read(user);
        if (!data.errors.some((e) => e.id === entry.id))
          data.errors.unshift(entry);
        save(user, data);
        return;
      }
      const { answer, ...fields } = entry;
      void answer;
      const result = await supabase!
        .from("study_errors")
        .upsert(
          { ...fields, user_id: user },
          { onConflict: "id", ignoreDuplicates: true },
        );
      if (result.error) throw new Error(result.error.message);
    },
    async convert(entry: ErrorEntry, deck: string) {
      const flash = flashStore(user, demo);
      if (!demo) return flash.convert(deck, entry.id);
      const data = await flash.load();
      if (
        data.cards.some(
          (c) => c.deck_id === deck && c.source_error_id === entry.id,
        )
      )
        return;
      const q = entry.answer?.question_snapshot;
      await flash.card({
        id: crypto.randomUUID(),
        deck_id: deck,
        archived: false,
        front: q?.statement ?? entry.external_statement ?? "Questão",
        back:
          q?.explanation ??
          entry.external_answer ??
          "Consulte a questão original.",
        front_image: entry.image_url ?? q?.image_url ?? null,
        back_image: null,
        choices: q?.options ?? [],
        correct_choice: q?.answer ?? null,
        source_question_id: entry.answer?.question_id ?? null,
        source_error_id: entry.id,
      });
    },
  };
}
