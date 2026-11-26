import { safeUrl, steps, youtubeId } from "./domain";

export type Source = { title: string; url: string };
export type SyllabusItem = {
  id: string;
  parent: string | null;
  kind: "discipline" | "topic" | "subtopic";
  name: string;
  archived?: boolean;
  questions?: number;
  weight?: number;
  priority?: "low" | "medium" | "high";
  minutes?: number;
  checklist?: number[];
  sources?: Source[];
};
export type Resource = {
  id: string;
  item: string;
  kind:
    | "bibliography"
    | "video"
    | "legislation"
    | "material"
    | "external_questions";
  title: string;
  author?: string;
  edition?: string;
  url?: string;
  text?: string;
  archived?: boolean;
  sources?: Source[];
};
export type ContestDocument = {
  schema_version: "1.0";
  type: "contest";
  id: string;
  name: string;
  organization?: string;
  role?: string;
  board?: string;
  exam_date?: string;
  listed?: boolean;
  archived?: boolean;
  questions?: number;
  weight?: number;
  sources?: Source[];
  notice: { version: number; url?: string; published_on?: string };
  items: SyllabusItem[];
  resources: Resource[];
};
export const newId = () => crypto.randomUUID();
export function newContest(): ContestDocument {
  return {
    schema_version: "1.0",
    type: "contest",
    id: newId(),
    name: "",
    notice: { version: 1 },
    items: [],
    resources: [],
  };
}
export const maxBytes = 512 * 1024;
type RecordValue = Record<string, unknown>;

function invalid(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}
function object(value: unknown, path: string, keys: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid(path, "esperado objeto");
  const result = value as RecordValue;
  for (const key of Object.keys(result))
    if (!keys.split(" ").includes(key))
      invalid(`${path}.${key}`, "campo desconhecido");
  return result;
}
function string(value: unknown, path: string, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return invalid(path, `esperado texto de 1 a ${max} caracteres`);
}
function choice(value: unknown, path: string, choices: readonly unknown[]) {
  if (!choices.includes(value)) invalid(path, `use ${choices.join(", ")}`);
}
function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
  integer = true,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    invalid(
      path,
      `use ${integer ? "um inteiro" : "um número"} entre ${min} e ${max}`,
    );
}
function id(value: unknown, path: string) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value))
    invalid(path, "identificador inválido");
}
function url(value: unknown, path: string) {
  string(value, path, 2000);
  try {
    safeUrl(value as string);
  } catch {
    invalid(path, "use URL HTTPS sem credenciais");
  }
}
function date(value: unknown, path: string) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    invalid(path, "use data AAAA-MM-DD");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid(path, "data inválida");
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    return invalid(path, `esperada lista com até ${max} elementos`);
  return value;
}
function optional(
  value: RecordValue,
  key: string,
  path: string,
  check: (v: unknown, p: string) => void,
) {
  if (Object.hasOwn(value, key)) check(value[key], `${path}.${key}`);
}
function sources(value: unknown, path: string) {
  array(value, path, 30).forEach((entry, i) => {
    const p = `${path}[${i}]`;
    const s = object(entry, p, "title url");
    string(s.title, `${p}.title`);
    url(s.url, `${p}.url`);
  });
}
function metadata(value: RecordValue, path: string) {
  optional(value, "archived", path, (v, p) => choice(v, p, [true, false]));
  optional(value, "questions", path, (v, p) => number(v, p, 0, 100000));
  optional(value, "weight", path, (v, p) => number(v, p, 0, 100000, false));
  optional(value, "sources", path, sources);
}
export function parseContest(raw: string): ContestDocument {
  if (new TextEncoder().encode(raw).length > maxBytes)
    invalid("$", "limite de 512 KiB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return invalid("$", "sintaxe JSON inválida");
  }
  const doc = object(
    parsed,
    "$",
    "schema_version type id name organization role board exam_date listed archived questions weight sources notice items resources",
  );
  choice(doc.schema_version, "$.schema_version", ["1.0"]);
  choice(doc.type, "$.type", ["contest"]);
  id(doc.id, "$.id");
  string(doc.name, "$.name");
  for (const field of ["organization", "role", "board"])
    optional(doc, field, "$", string);
  optional(doc, "exam_date", "$", date);
  optional(doc, "listed", "$", (v, p) => choice(v, p, [true, false]));
  metadata(doc, "$");
  const notice = object(doc.notice, "$.notice", "version url published_on");
  number(notice.version, "$.notice.version", 1, 100000);
  optional(notice, "url", "$.notice", url);
  optional(notice, "published_on", "$.notice", date);
  const seen = new Map<string, SyllabusItem>();
  array(doc.items, "$.items", 1500).forEach((entry, i) => {
    const path = `$.items[${i}]`;
    const item = object(
      entry,
      path,
      "id parent kind name archived questions weight priority minutes checklist sources",
    );
    id(item.id, `${path}.id`);
    string(item.name, `${path}.name`);
    choice(item.kind, `${path}.kind`, ["discipline", "topic", "subtopic"]);
    if (item.kind === "discipline")
      choice(item.parent, `${path}.parent`, [null]);
    else id(item.parent, `${path}.parent`);
    if (seen.has(item.id as string)) invalid(`${path}.id`, "ID duplicado");
    seen.set(item.id as string, item as SyllabusItem);
    metadata(item, path);
    optional(item, "minutes", path, (v, p) => number(v, p, 1, 100000));
    optional(item, "priority", path, (v, p) =>
      choice(v, p, ["low", "medium", "high"]),
    );
    optional(item, "checklist", path, (v, p) => {
      const list = array(v, p, steps.length);
      list.forEach((step, j) =>
        number(step, `${p}[${j}]`, 0, steps.length - 1),
      );
      if (new Set(list).size !== list.length) invalid(p, "etapa duplicada");
    });
  });
  [...seen.values()].forEach((item, i) => {
    if (
      item.parent !== null &&
      seen.get(item.parent)?.kind !==
        (item.kind === "topic" ? "discipline" : "topic")
    )
      invalid(`$.items[${i}].parent`, "referência hierárquica inválida");
  });
  const resources = new Set<string>();
  array(doc.resources, "$.resources", 2000).forEach((entry, i) => {
    const path = `$.resources[${i}]`;
    const item = object(
      entry,
      path,
      "id item kind title author edition url text archived sources",
    );
    id(item.id, `${path}.id`);
    if (resources.has(item.id as string)) invalid(`${path}.id`, "ID duplicado");
    resources.add(item.id as string);
    id(item.item, `${path}.item`);
    choice(seen.get(item.item as string)?.kind, `${path}.item`, [
      "topic",
      "subtopic",
    ]);
    choice(item.kind, `${path}.kind`, [
      "bibliography",
      "video",
      "legislation",
      "material",
      "external_questions",
    ]);
    string(item.title, `${path}.title`);
    optional(item, "url", path, url);
    optional(item, "text", path, (v, p) => string(v, p, 100000));
    optional(item, "sources", path, sources);
    optional(item, "archived", path, (v, p) => choice(v, p, [true, false]));
    optional(item, "author", path, string);
    optional(item, "edition", path, string);
    if (item.kind === "bibliography") string(item.author, `${path}.author`);
    if (item.kind === "video" && (!item.url || !youtubeId(item.url as string)))
      invalid(`${path}.url`, "use um endereço de vídeo do YouTube");
    if (
      (item.kind === "legislation" || item.kind === "external_questions") &&
      !item.url
    )
      invalid(`${path}.url`, "URL obrigatória");
    if (item.kind === "material" && !item.url && !item.text)
      invalid(path, "informe texto ou URL");
  });
  return doc as ContestDocument;
}

export function compareContest(
  previous: ContestDocument | null,
  next: ContestDocument,
) {
  if (previous && previous.id !== next.id)
    invalid("$.id", "o identificador do concurso não pode mudar");
  if (previous && next.notice.version < previous.notice.version)
    invalid("$.notice.version", "não pode voltar a uma versão anterior");
  const changes: { name: string; id: string; status: string }[] = [];
  function compare<T extends { id: string; archived?: boolean }>(
    before: T[],
    after: T[],
    label: (x: T) => string,
    immutable: (old: T, item: T) => boolean,
  ) {
    const old = new Map(before.map((o) => [o.id, o]));
    const upcoming = new Set(after.map((x) => x.id));
    for (const o of before)
      if (!upcoming.has(o.id))
        invalid(o.id, "mantenha o ID e indique archived: true para arquivar");
    for (const [index, item] of after.entries()) {
      const prior = old.get(item.id);
      if (prior && !immutable(prior, item))
        invalid(item.id, "tipo ou vínculo de um ID existente não pode mudar");
      const status =
        item.archived && !prior?.archived
          ? "Arquivado"
          : !prior
            ? "Novo"
            : !same(prior, item) || before[index]?.id !== item.id
              ? "Alterado"
              : "Sem alteração";
      changes.push({ name: label(item), id: item.id, status });
    }
  }
  const { items: nextItems, resources: nextResources, ...header } = next;
  const {
    items: oldItems = [],
    resources: oldResources = [],
    ...oldHeader
  } = previous ?? {};
  changes.push({
    name: next.name,
    id: next.id,
    status:
      next.archived && !previous?.archived
        ? "Arquivado"
        : !previous
          ? "Novo"
          : same(header, oldHeader)
            ? "Sem alteração"
            : "Alterado",
  });
  compare(
    oldItems,
    nextItems,
    (x) => x.name,
    (a, b) => a.kind === b.kind && a.parent === b.parent,
  );
  compare(
    oldResources,
    nextResources,
    (x) => x.title,
    (a, b) => a.kind === b.kind && a.item === b.item,
  );
  return changes;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = a as RecordValue;
  const right = b as RecordValue;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && same(left[key], right[key]),
    )
  );
}

export const promptContract =
  "contest 1.0: campos obrigatórios schema_version, type, id, name, notice{version}, items[], resources[]. IDs de texto: letras minúsculas, números, ponto, hífen ou sublinhado, até 80 caracteres. Cada item exige id, parent, kind e name. discipline tem parent null; topic aponta para discipline; subtopic aponta para topic. Recursos exigem id, item, kind e title; item aponta para assunto ou subassunto. Bibliografia exige author; video, legislation e external_questions exigem url HTTPS; material exige text ou url. Opcionais no concurso: organization, role, board, exam_date, listed, archived, questions, weight, sources. Em notice: url, published_on. Em item: archived, questions, weight, priority (low/medium/high), minutes, checklist (índices únicos 0–4), sources. Em recurso: author, edition, url, text, archived, sources. sources contém objetos title e url. Datas AAAA-MM-DD. Omita campos desconhecidos. Não inclua campos extras.";
