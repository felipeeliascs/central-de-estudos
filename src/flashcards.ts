import { parseImportJson } from "./import-json";
import {
  createEmptyCard,
  fsrs,
  FSRSVersion,
  generatorParameters,
  Rating,
  type Card,
  type CardInput,
  type Grade,
} from "ts-fsrs";
import { safeUrl } from "./domain";
import { todayInBrazil } from "./planner";

export const ratings = [
  { grade: Rating.Again, label: "Errei" },
  { grade: Rating.Hard, label: "Difícil" },
  { grade: Rating.Good, label: "Bom" },
  { grade: Rating.Easy, label: "Fácil" },
] as const;
export const parameters = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: false,
});
export const schedulerVersion = `ts-fsrs@5.4.2 (${FSRSVersion})`;
const scheduler = fsrs(parameters);
export type CardState = Omit<Card, "due" | "last_review"> & {
  due: string;
  last_review: string | null;
};
export type CardContent = {
  front: string;
  back: string;
  front_image: string | null;
  back_image: string | null;
  choices: string[];
  correct_choice: number | null;
};
export type Flashcard = CardContent & {
  id: string;
  deck_id: string;
  archived: boolean;
  source_question_id?: string | null;
  source_error_id?: string | null;
};
export type Deck = {
  id: string;
  topic_id: string;
  owner_id: string;
  title: string;
  author: string;
  archived: boolean;
  visibility: "private" | "shared";
  shared_with: string[];
};
export type Goals = { daily_new: number; daily_reviews: number };
export type History = {
  card_id: string;
  rating: number;
  reviewed_at: string;
  client_event_id: string;
  before_state: Partial<CardState>;
  after_state: CardState;
};
export const defaultGoals: Goals = { daily_new: 10, daily_reviews: 50 };
export const emptyContent: CardContent = {
  front: "",
  back: "",
  front_image: null,
  back_image: null,
  choices: [],
  correct_choice: null,
};
export const serialize = (card: Card): CardState => ({
  ...card,
  due: card.due.toISOString(),
  last_review: card.last_review?.toISOString() ?? null,
});
const currentCard = (state: CardState | undefined, now: Date): CardInput =>
  state ?? createEmptyCard(now);
export function previewReview(state: CardState | undefined, now: Date) {
  return scheduler.repeat(currentCard(state, now), now);
}
export function transition(
  state: CardState | undefined,
  now: Date,
  grade: Grade,
) {
  const { card, log } = scheduler.next(currentCard(state, now), now, grade);
  return {
    next_card: serialize(card),
    review_log: {
      ...log,
      due: log.due.toISOString(),
      review: log.review.toISOString(),
    },
  };
}
export function intervalLabel(due: Date, now: Date) {
  const minutes = Math.max(
    1,
    Math.round((due.getTime() - now.getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes} min`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} h`
      : `${Math.round(minutes / 1440)} d`;
}
export function reviewQueue(
  cards: Flashcard[],
  states: Record<string, CardState>,
  logs: History[],
  goals: Goals,
  now: Date,
) {
  const active = cards.filter((c) => !c.archived);
  const day = todayInBrazil(now);
  const today = logs.filter(
    (log) => todayInBrazil(new Date(log.reviewed_at)) === day,
  );
  const learned = today.filter((log) => !log.before_state.reps).length;
  const fresh = active.filter((card) => !states[card.id]);
  const due = active
    .filter(
      (card) =>
        states[card.id] && Date.parse(states[card.id].due) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        states[a.id].due.localeCompare(states[b.id].due) ||
        a.id.localeCompare(b.id),
    );
  const eligible = [
    ...due,
    ...fresh.slice(0, Math.max(0, goals.daily_new - learned)),
  ].slice(0, Math.max(0, goals.daily_reviews - today.length));
  return {
    eligible,
    fresh: fresh.length,
    pending: active.length - fresh.length,
    overdue: due.length,
    done: today.length,
  };
}

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Esperava um objeto JSON.");
  return raw as Record<string, unknown>;
}
function required(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}: informe de 1 a ${max} caracteres.`);
  return value.trim();
}
function image(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return safeUrl(required(value, "Imagem", 2000));
}
export function validateCard(raw: unknown): CardContent {
  const c = object(raw);
  const rawChoices = c.choices ?? [];
  if (
    !Array.isArray(rawChoices) ||
    rawChoices.length === 1 ||
    rawChoices.length > 8
  )
    throw new Error(
      "Use de 2 a 8 alternativas ou deixe o cartão como frente e verso.",
    );
  const choices = rawChoices.map((choice) =>
    required(choice, "Alternativa", 500),
  );
  if (new Set(choices).size !== choices.length)
    throw new Error("As alternativas devem ser diferentes.");
  const correct = c.correct_choice ?? null;
  if (
    choices.length
      ? typeof correct !== "number" ||
        !Number.isInteger(correct) ||
        correct < 0 ||
        correct >= choices.length
      : correct !== null
  )
    throw new Error("Selecione a alternativa correta.");
  return {
    front: required(c.front, "Frente", 20000),
    back: required(c.back, "Verso", 20000),
    front_image: image(c.front_image),
    back_image: image(c.back_image),
    choices,
    correct_choice: correct as number | null,
  };
}
export function parseDeck(raw: string) {
  if (new TextEncoder().encode(raw).length > 1024 * 1024)
    throw new Error("Limite de 1 MiB por arquivo.");
  const doc = object(parseImportJson(raw,1024*1024));
  if (doc.schema_version !== "1.0" || doc.type !== "flashcard_deck")
    throw new Error("Use o contrato flashcard_deck, versão 1.0.");
  const deck = object(doc.deck);
  if (!Array.isArray(doc.cards) || doc.cards.length > 500)
    throw new Error("Informe até 500 cartões.");
  return {
    title: required(deck.title, "Baralho", 180),
    author: deck.author ? required(deck.author, "Autor", 180) : "",
    cards: doc.cards.map((card, i) => {
      try {
        return validateCard(card);
      } catch (e) {
        throw new Error(`Cartão ${i + 1}: ${(e as Error).message}`);
      }
    }),
  };
}
export function exportDeck(deck: Deck, cards: Flashcard[]) {
  return {
    schema_version: "1.0",
    type: "flashcard_deck",
    deck: { title: deck.title, author: deck.author },
    cards: cards
      .filter((c) => c.deck_id === deck.id && !c.archived && !c.source_error_id)
      .map(validateCard),
  };
}

export const promptContract =
  "flashcard_deck 1.0: objeto com schema_version, type, deck{title,author opcional}, cards[]. Cada cartão exige front e back. Opcionais front_image e back_image são URLs HTTPS. Para múltipla escolha inclua choices com 2 a 8 textos distintos e correct_choice inteiro começando em zero. Até 500 cartões.";
