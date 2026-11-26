export const sections = [
  "Videoaulas",
  "Teoria e resumos",
  "Bibliografia",
  "Legislação",
  "Mapas mentais",
  "Questões externas",
  "Anotações",
  "Flashcards",
  "Progresso e checklist",
] as const;
export type Section = (typeof sections)[number];
export const steps = [
  "Assistir à videoaula",
  "Estudar a teoria",
  "Consultar bibliografia",
  "Resolver questões",
  "Realizar revisão",
] as const;
export type Node = {
  catalog_key?: string | null;
  catalog_archived?: boolean;
  id: string;
  parent_id: string | null;
  kind: "contest" | "discipline" | "topic" | "subtopic";
  name: string;
  board: string;
  owner_id: string;
  position: number;
};
export type Material = {
  catalog_managed?: boolean;
  catalog_archived?: boolean;
  id: string;
  topic_id: string;
  owner_id: string;
  section: Section;
  title: string;
  kind: "youtube" | "link" | "text" | "pdf" | "image";
  url: string;
  body: string;
  back: string;
  file_path: string;
  visibility: "private" | "shared";
  shared_with: string[];
  position: number;
  embed: boolean;
  verified: boolean;
};
export type Check = {
  topic_id: string;
  step: number;
  done: boolean;
  user_id: string;
};
export type Note = { topic_id: string; body: string; user_id: string };
export type Snapshot = {
  nodes: Node[];
  materials: Material[];
  checks: Check[];
  notes: Note[];
};
export const empty: Snapshot = {
  nodes: [],
  materials: [],
  checks: [],
  notes: [],
};
export function safeUrl(value: string): string {
  const u = new URL(value);
  if (u.protocol !== "https:") throw new Error("Use um endereço HTTPS válido.");
  if (u.username || u.password)
    throw new Error("Não inclua credenciais no link.");
  return u.href;
}
export function youtubeId(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(
              host,
            )
          ? u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function descendants(nodes: Node[], id: string): Node[] {
  const direct = nodes.filter((n) => n.parent_id === id);
  return direct.flatMap((n) => [n, ...descendants(nodes, n.id)]);
}
export function progress(
  nodes: Node[],
  checks: Check[],
  id: string,
  user: string,
) {
  const self = nodes.find((n) => n.id === id);
  const topics = [...(self ? [self] : []), ...descendants(nodes, id)].filter(
    (n) => n.kind === "topic" || n.kind === "subtopic",
  );
  const ids = new Set(topics.map((n) => n.id));
  const total = topics.length * steps.length;
  const done = new Set(
    checks
      .filter((c) => ids.has(c.topic_id) && c.user_id === user && c.done)
      .map((c) => `${c.topic_id}:${c.step}`),
  ).size;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
export function validateMaterial(m: Material) {
  if (!m.title.trim() || m.title.length > 180)
    throw new Error("Informe um título com até 180 caracteres.");
  if (!sections.includes(m.section)) throw new Error("Seção inválida.");
  if (m.body.length > 100000 || m.back.length > 100000)
    throw new Error("O texto excede 100 mil caracteres.");
  if (m.kind === "link") safeUrl(m.url);
  if (m.kind === "youtube" && !youtubeId(m.url))
    throw new Error("Informe um link válido do YouTube.");
  if (m.kind === "text" && !m.body.trim())
    throw new Error("Informe o texto do material.");
  if (m.section === "Flashcards" && (!m.body.trim() || !m.back.trim()))
    throw new Error("Preencha a frente e o verso do flashcard.");
  if (m.visibility === "shared" && !m.shared_with.length)
    throw new Error("Informe ao menos um usuário autorizado.");
  if (m.shared_with.some((id) => !isUuid(id)))
    throw new Error("Informe identificadores UUID válidos para compartilhar.");
}
export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
export function validateFile(file: File) {
  if (
    !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
      file.type,
    )
  )
    throw new Error("Envie PDF, PNG, JPEG ou WebP.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("O limite por arquivo é 20 MB.");
}
export const granUrl = "https://questoes.grancursosonline.com.br/";
