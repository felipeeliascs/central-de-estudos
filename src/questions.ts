import { safeUrl, type Node } from "./domain";
export const origins = {
  author: "Original",
  ai_generated: "Inédita gerada por IA",
  licensed: "Fonte autorizada",
} as const;
export const difficulties = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
} as const;
export type QuestionDraft = {
  topic_id: string;
  statement: string;
  options: string[];
  answer: number;
  explanation: string;
  source: keyof typeof origins;
  source_name: string;
  source_url: string | null;
  image_url: string | null;
  board: string;
  year: number | null;
  difficulty: keyof typeof difficulties;
  reviewed: boolean;
};
export type BankQuestion = Omit<
  QuestionDraft,
  "answer" | "options" | "explanation"
> & { id: string; owner_id: string; playable: boolean };
export type Item = {
  id: string;
  topic_id: string;
  discipline_id: string;
  statement: string;
  options: string[];
  image_url: string | null;
  weight: number;
};
export type Correction = {
  id: string;
  item: Item;
  answer: number;
  selected: number | null;
  correct: boolean;
  explanation: string;
  source_url: string | null;
};
export type Attempt = {
  id: string;
  title: string;
  kind: "study" | "mock" | "diagnostic";
  started_at: string;
  finished_at: string | null;
  deadline: string | null;
  items: Item[];
  picks: Record<string, number>;
  flags: Record<string, boolean>;
  cursor: number;
  score: number | null;
  correction?: Correction[];
};
export type ErrorEntry = {
  id: string;
  topic_id: string;
  answer_id: string | null;
  external_statement?: string | null;
  external_answer?: string | null;
  reason: string;
  notes: string;
  resolved: boolean;
  external_url: string | null;
  image_url: string | null;
  answer: {
    question_id: string;
    question_snapshot: Partial<Correction["item"]> & {
      statement?: string;
      answer?: number;
      source_url?: string | null;
      explanation?: string;
    };
    answer_snapshot: { selected?: number };
    created_at: string;
  } | null;
};
export const blankQuestion: QuestionDraft = {
  topic_id: "",
  statement: "",
  options: ["", ""],
  answer: 0,
  explanation: "",
  source: "author",
  source_name: "",
  source_url: null,
  image_url: null,
  board: "",
  year: null,
  difficulty: "medium",
  reviewed: false,
};
export function pathFor(nodes: Node[], id: string) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: Node[] = [];
  let node = byId.get(id);
  while (node) {
    path.unshift(node);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  return path;
}
export const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Objeto inválido.");
  return value as Record<string, unknown>;
}
function required(
  value: unknown,
  label: string,
  max: number,
  optional = false,
) {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > max
  )
    throw new Error(`${label}: informe texto válido (até ${max} caracteres).`);
  return value.trim();
}
function url(value: unknown) {
  return value == null || value === ""
    ? null
    : safeUrl(required(value, "URL", 2000));
}
export function validateQuestion(
  value: unknown,
  topics: Set<string>,
): QuestionDraft {
  const q = record(value);
  for (const key of Object.keys(q))
    if (!Object.hasOwn(blankQuestion, key))
      throw new Error(`Campo não reconhecido: ${key}.`);
  if (typeof q.topic_id !== "string" || !topics.has(q.topic_id))
    throw new Error("Assunto indisponível.");
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8)
    throw new Error("Informe de 2 a 8 alternativas.");
  const options = q.options.map((o) => required(o, "Alternativa", 1500));
  if (new Set(options.map(normalize)).size !== options.length)
    throw new Error("Alternativas repetidas.");
  if (
    typeof q.answer !== "number" ||
    !Number.isInteger(q.answer) ||
    q.answer < 0 ||
    q.answer >= options.length
  )
    throw new Error("Gabarito inválido.");
  if (typeof q.source !== "string" || !Object.hasOwn(origins, q.source))
    throw new Error("Classificação de origem inválida.");
  if (
    typeof q.difficulty !== "string" ||
    !Object.hasOwn(difficulties, q.difficulty)
  )
    throw new Error("Dificuldade inválida.");
  if (
    q.year != null &&
    (typeof q.year !== "number" ||
      !Number.isInteger(q.year) ||
      q.year < 1900 ||
      q.year > 2100)
  )
    throw new Error("Ano inválido.");
  if (q.reviewed !== undefined && typeof q.reviewed !== "boolean")
    throw new Error("Indicador de revisão inválido.");
  const source_url = url(q.source_url);
  const source_name = required(
    q.source_name ?? "",
    "Fonte",
    180,
    q.source !== "licensed",
  );
  if (q.source === "licensed" && !source_url)
    throw new Error("Informe o link original da fonte autorizada.");
  return {
    topic_id: q.topic_id,
    statement: required(q.statement, "Enunciado", 12000),
    options,
    answer: q.answer,
    explanation: required(q.explanation, "Explicação", 12000),
    source: q.source as QuestionDraft["source"],
    source_name,
    source_url,
    image_url: url(q.image_url),
    board: required(q.board ?? "", "Banca", 150, true),
    year: (q.year ?? null) as number | null,
    difficulty: q.difficulty as QuestionDraft["difficulty"],
    reviewed: q.reviewed === true,
  };
}
export function importQuestions(
  text: string,
  topics: Set<string>,
  existing: Pick<QuestionDraft, "statement">[],
) {
  if (new TextEncoder().encode(text).length > 256 * 1024)
    throw new Error("Limite de 256 KiB.");
  const doc = record(JSON.parse(text.replace(/^\uFEFF/, "")));
  if (
    doc.schema_version !== "1.0" ||
    doc.type !== "questions" ||
    Object.keys(doc).some(
      (key) => !["schema_version", "type", "questions"].includes(key),
    ) ||
    !Array.isArray(doc.questions) ||
    doc.questions.length < 1 ||
    doc.questions.length > 30
  )
    throw new Error("Use questions versão 1.0, de 1 a 30 questões por lote.");
  const seen = new Set(existing.map((q) => normalize(q.statement)));
  return doc.questions.map((value, index) => {
    try {
      const question = validateQuestion(value, topics);
      if (
        question.source_url &&
        /(^|\.)(qconcursos\.com|qconcursos\.com\.br|grancursosonline\.com\.br|granquestoes\.com\.br)$/i.test(
          new URL(question.source_url).hostname,
        )
      )
        throw new Error(
          "Use apenas o link no caderno pessoal ou registre o resultado externo.",
        );
      const key = normalize(question.statement);
      const duplicate = seen.has(key);
      seen.add(key);
      return { question, duplicate };
    } catch (error) {
      throw new Error(`Questão ${index + 1}: ${(error as Error).message}`);
    }
  });
}
export type Quota = {
  id: string;
  label: string;
  pool: BankQuestion[];
  count: number;
  weight: number;
};
export function selectQuestions(quotas: Quota[]) {
  if (!quotas.length) throw new Error("Selecione ao menos um grupo.");
  const used = new Set<string>();
  const items: { id: string; weight: number }[] = [];
  const gaps: string[] = [];
  for (const q of quotas) {
    if (
      !Number.isInteger(q.count) ||
      q.count < 1 ||
      q.count > 100 ||
      !Number.isFinite(q.weight) ||
      q.weight <= 0 ||
      q.weight > 10000
    )
      throw new Error(
        "Use quantidade de 1 a 100 e peso maior que zero em cada grupo.",
      );
    const available = q.pool.filter((x) => x.playable && !used.has(x.id));
    if (available.length < q.count) {
      gaps.push(
        `${q.label}: ${available.length} disponíveis de ${q.count} pedidas`,
      );
      continue;
    }
    for (const question of available.slice(0, q.count)) {
      used.add(question.id);
      items.push({ id: question.id, weight: q.weight });
    }
  }
  if (gaps.length) throw new Error(`Banco insuficiente. ${gaps.join(" / ")}.`);
  if (items.length > 100)
    throw new Error("Limite de 100 questões por tentativa.");
  return items;
}
export function grade(
  items: (Item & {
    answer: number;
    explanation: string;
    source_url: string | null;
  })[],
  picks: Record<string, number>,
) {
  const rows = items.map((item) => ({
    id: item.id,
    item,
    answer: item.answer,
    selected: picks[item.id] ?? null,
    correct: picks[item.id] === item.answer,
    explanation: item.explanation,
    source_url: item.source_url,
  }));
  return {
    correction: rows,
    score:
      Math.round(
        (10000 *
          rows.reduce((sum, r) => sum + (r.correct ? r.item.weight : 0), 0)) /
          items.reduce((sum, i) => sum + i.weight, 0),
      ) / 100,
  };
}

export const promptContract =
  "questions 1.0: objeto com schema_version, type, questions[]. Cada questão exige topic_id existente, statement, options (2 a 8 alternativas distintas), answer (índice começando em zero), explanation, source, difficulty. source deve ser ai_generated para questões geradas. difficulty é easy, medium ou hard. Opcionais: board, year, source_name, source_url, image_url, reviewed. Use reviewed:false. Até 30 questões. URLs opcionais devem ser HTTPS.";
