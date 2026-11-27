import { supabase } from "./repository";
import { demoFlash } from "./flashcard-data";
import { type Session, type ExternalResult } from "./productivity";
import { demoQuestionResults } from "./question-data";
export type Review = { card_id: string; reviewed_at: string };
export type Due = { card_id: string; due: string };
export type Card = { id: string; deck_id: string; archived: boolean };
export type Deck = { id: string; topic_id: string; archived: boolean };
export type Incidence = {
  measure?: "exams" | "questions" | null;
  topic_id: string;
  board: string;
  sample: number;
  occurrences: number;
  source_url: string;
  period_start: string | null;
  period_end: string | null;
  verified_by?: string;
};
export type Answer = {
  correct: boolean;
  created_at: string;
  study_questions: { topic_id: string } | null;
};
export type ProductivityData = {
  sessions: Session[];
  results: ExternalResult[];
  reviews: Review[];
  due: Due[];
  cards: Card[];
  decks: Deck[];
  incidence: Incidence[];
  answers: Answer[];
};
const key = (user: string) => `central-productivity:${user}`;
function local(user: string) {
  return JSON.parse(
    localStorage.getItem(key(user)) ??
      '{"sessions":[],"results":[],"incidence":[]}',
  ) as Pick<ProductivityData, "sessions" | "results" | "incidence">;
}
function update(user: string, fn: (data: ReturnType<typeof local>) => void) {
  const data = local(user);
  fn(data);
  localStorage.setItem(key(user), JSON.stringify(data));
}
async function list<T>(
  table: string,
  fields: string,
  order: string[] = ["id"],
) {
  const all: T[] = [];
  for (let offset = 0; ; offset += 200) {
    let query = supabase!.from(table).select(fields);
    for (const column of order) query = query.order(column);
    const result = await query.range(offset, offset + 199);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as T[];
    all.push(...page);
    if (page.length < 200) return all;
  }
}
export function productivityStore(user: string, demo: boolean) {
  return {
    async load(): Promise<ProductivityData> {
      if (demo) {
        const data = local(user),
          flash = demoFlash(user);
        return {
          ...data,
          reviews: flash.logs,
          due: Object.entries(flash.states).map(([card_id, state]) => ({
            card_id,
            due: state.due,
          })),
          cards: flash.cards,
          decks: flash.decks,
          answers: demoQuestionResults(user),
        };
      }
      const [
        sessions,
        results,
        reviews,
        due,
        cards,
        decks,
        incidence,
        answers,
      ] = await Promise.all([
        list<Session>(
          "study_sessions",
          "id,topic_id,mode,started_at,ended_at,seconds,client_event_id",
        ),
        list<ExternalResult>(
          "study_external_results",
          "id,topic_id,provider,answered,correct,recorded_at,source_url,notes,result_kind",
        ),
        list<Review>("study_review_logs", "card_id,reviewed_at"),
        list<Due>("study_fsrs_states", "card_id,due"),
        list<Card>("study_cards", "id,deck_id,archived"),
        list<Deck>("study_decks", "id,topic_id,archived"),
        list<Incidence>(
          "study_historical_incidence",
          "topic_id,board,sample,occurrences,source_url,period_start,period_end,measure",
          ["topic_id", "board"],
        ),
        list<Answer>(
          "study_answers",
          "correct,created_at,study_questions(topic_id)",
        ),
      ]);
      return {
        sessions,
        results,
        reviews,
        due,
        cards,
        decks,
        incidence,
        answers,
      };
    },
    async session(s: Session) {
      if (demo) {
        update(user, (d) => {
          if (!d.sessions.some((x) => x.client_event_id === s.client_event_id))
            d.sessions.push(s);
        });
        return;
      }
      const r = await supabase!.rpc("study_save_session", {
        session_id: s.id,
        topic_ref: s.topic_id,
        started: s.started_at,
        ended: s.ended_at,
        seconds_value: s.seconds,
        study_mode: s.mode,
        event_id: s.client_event_id,
      });
      if (r.error) throw new Error(r.error.message);
    },
    async correct(s: Session) {
      if (demo) {
        update(user, (d) => {
          d.sessions = d.sessions.map((x) => (x.id === s.id ? s : x));
        });
        return;
      }
      const r = await supabase!
        .from("study_sessions")
        .update({
          started_at: s.started_at,
          ended_at: s.ended_at,
          seconds: s.seconds,
          mode: s.mode,
        })
        .eq("id", s.id)
        .select("id")
        .single();
      if (r.error) throw new Error(r.error.message);
    },
    async result(value: ExternalResult) {
      if (demo) {
        update(user, (d) => {
          d.results = [...d.results.filter((x) => x.id !== value.id), value];
        });
        return;
      }
      const r = await supabase!
        .from("study_external_results")
        .upsert({ ...value, user_id: user })
        .select("id")
        .single();
      if (r.error) throw new Error(r.error.message);
    },
    async incidence(value: Incidence) {
      if (demo) {
        update(user, (d) => {
          d.incidence = [
            ...d.incidence.filter(
              (x) =>
                !(x.topic_id === value.topic_id && x.board === value.board),
            ),
            value,
          ];
        });
        return;
      }
      const r = await supabase!
        .from("study_historical_incidence")
        .upsert(
          { ...value, verified_by: user },
          { onConflict: "topic_id,board" },
        );
      if (r.error) throw new Error(r.error.message);
    },
  };
}

export async function readHistoricalIncidence(user: string, demo: boolean): Promise<Incidence[]> {
  return demo ? local(user).incidence : list<Incidence>(
    "study_historical_incidence", "topic_id,board,sample,occurrences,source_url,period_start,period_end,measure", ["topic_id", "board"]);
}
