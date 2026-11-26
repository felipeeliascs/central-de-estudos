import type { Grade } from "ts-fsrs";
import { supabase } from "./repository";
import {
  defaultGoals,
  parameters,
  schedulerVersion,
  transition,
  type CardContent,
  type CardState,
  type Deck,
  type Flashcard,
  type Goals,
  type History,
} from "./flashcards";

export type ErrorItem = { id: string; reason: string; answer_id: string };
export type FlashData = {
  decks: Deck[];
  cards: Flashcard[];
  states: Record<string, CardState>;
  logs: History[];
  goals: Goals;
  errors: ErrorItem[];
};
type Pending = {
  card_ref: string;
  event_ref: string;
  expected_reps: number;
  grade: Grade;
  review_time: string;
  next_card: CardState;
  review_log: ReturnType<typeof transition>["review_log"];
  version: string;
  settings: typeof parameters;
};
const localKey = (user: string) => `central-flashcards:${user}`;
const eventKey = (user: string) => `central-flashcard-pending:${user}`;
const blank = (): FlashData => ({
  decks: [],
  cards: [],
  states: {},
  logs: [],
  goals: defaultGoals,
  errors: [],
});
export const demoFlash = (user: string): FlashData =>
  JSON.parse(localStorage.getItem(localKey(user)) ?? "null") ?? blank();
function mutate(user: string, apply: (data: FlashData) => void) {
  const data = demoFlash(user);
  apply(data);
  localStorage.setItem(localKey(user), JSON.stringify(data));
}
const db = () => supabase!;
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
async function list<T>(table: string, fields: string) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await db()
      .from(table)
      .select(fields)
      .order("id")
      .range(offset, offset + 199);
    check(result.error);
    const page = (result.data ?? []) as T[];
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
export async function countDueReviews(user: string, demo: boolean, now: Date) {
  if (demo) {
    const data = demoFlash(user);
    const activeDecks = new Set(
      data.decks.filter((deck) => !deck.archived).map((deck) => deck.id),
    );
    return data.cards.filter(
      (card) =>
        !card.archived &&
        activeDecks.has(card.deck_id) &&
        Date.parse(data.states[card.id]?.due ?? "") <= now.getTime(),
    ).length;
  }
  const { count, error } = await db()
    .from("study_fsrs_states")
    .select("study_cards!inner(archived,study_decks!inner(archived))", {
      head: true,
      count: "exact",
    })
    .eq("user_id", user)
    .lte("due", now.toISOString())
    .eq("study_cards.archived", false)
    .eq("study_cards.study_decks.archived", false);
  check(error);
  return count ?? 0;
}

export function flashStore(user: string, demo: boolean) {
  return {
    async load(): Promise<FlashData> {
      if (demo) return demoFlash(user);
      const [decks, cards, states, logs, errors, prefs] = await Promise.all([
        list<Deck>("study_decks", "*"),
        list<Flashcard>("study_cards", "*"),
        list<CardState & { card_id: string }>("study_fsrs_states", "*"),
        list<History>(
          "study_review_logs",
          "card_id,rating,reviewed_at,client_event_id,before_state,after_state",
        ),
        list<ErrorItem>("study_errors", "id,reason,answer_id"),
        db()
          .from("study_flashcard_goals")
          .select("daily_new,daily_reviews")
          .eq("user_id", user)
          .maybeSingle(),
      ]);
      check(prefs.error);
      return {
        decks,
        cards,
        states: Object.fromEntries(states.map((s) => [s.card_id, s])),
        logs,
        errors: errors.filter((e) => e.answer_id),
        goals: prefs.data ?? defaultGoals,
      };
    },
    async deck(deck: Deck) {
      if (demo) {
        mutate(user, (data) => {
          data.decks = [...data.decks.filter((d) => d.id !== deck.id), deck];
        });
        return;
      }
      const r = await db()
        .from("study_decks")
        .upsert(deck)
        .select("id")
        .single();
      check(r.error);
    },
    async card(card: Flashcard) {
      if (demo) {
        mutate(user, (data) => {
          data.cards = [...data.cards.filter((c) => c.id !== card.id), card];
        });
        return;
      }
      const r = await db()
        .from("study_cards")
        .upsert(card)
        .select("id")
        .single();
      check(r.error);
    },
    async goals(goals: Goals) {
      if (demo) {
        mutate(user, (data) => {
          data.goals = goals;
        });
        return;
      }
      const r = await db()
        .from("study_flashcard_goals")
        .upsert({ user_id: user, ...goals });
      check(r.error);
    },
    async import(deck: Deck, cards: CardContent[]) {
      if (demo) {
        mutate(user, (data) => {
          if (data.decks.some((d) => d.id === deck.id)) return;
          data.decks.push(deck);
          data.cards.push(
            ...cards.map((c) => ({
              ...c,
              id: crypto.randomUUID(),
              deck_id: deck.id,
              archived: false,
            })),
          );
        });
        return;
      }
      const r = await db().rpc("study_import_flashcards", {
        deck_ref: deck.id,
        topic_ref: deck.topic_id,
        deck_title: deck.title,
        deck_author: deck.author,
        cards,
      });
      check(r.error);
    },
    async convert(deck: string, error: string) {
      if (demo)
        throw new Error(
          "A conversão usa o caderno de erros da conta conectada.",
        );
      const r = await db().rpc("study_convert_error", {
        target_deck: deck,
        error_ref: error,
      });
      check(r.error);
    },
    pending(): Pending | null {
      return JSON.parse(localStorage.getItem(eventKey(user)) ?? "null");
    },
    prepare(
      card: string,
      state: CardState | undefined,
      grade: Grade,
      now: Date,
    ) {
      if (localStorage.getItem(eventKey(user)))
        throw new Error(
          "Envie a avaliação pendente antes de revisar outro cartão.",
        );
      const event: Pending = {
        card_ref: card,
        event_ref: crypto.randomUUID(),
        expected_reps: state?.reps ?? 0,
        grade,
        review_time: now.toISOString(),
        ...transition(state, now, grade),
        version: schedulerVersion,
        settings: parameters,
      };
      localStorage.setItem(eventKey(user), JSON.stringify(event));
      return event;
    },
    async submit(event: Pending) {
      if (demo)
        mutate(user, (data) => {
          if (data.logs.some((log) => log.client_event_id === event.event_ref))
            return;
          const before = data.states[event.card_ref];
          if ((before?.reps ?? 0) !== event.expected_reps)
            throw new Error("O cartão foi revisado em outra sessão.");
          data.states[event.card_ref] = event.next_card;
          data.logs.push({
            card_id: event.card_ref,
            rating: event.grade,
            reviewed_at: event.review_time,
            client_event_id: event.event_ref,
            before_state: before ?? {},
            after_state: event.next_card,
          });
        });
      else {
        const r = await db().rpc("study_save_flashcard_review", event);
        if (r.error) {
          if (r.error.code === "P0001") {
            localStorage.removeItem(eventKey(user));
          }
          check(r.error);
        }
      }
      if (
        (
          JSON.parse(
            localStorage.getItem(eventKey(user)) ?? "null",
          ) as Pending | null
        )?.event_ref === event.event_ref
      )
        localStorage.removeItem(eventKey(user));
    },
  };
}
