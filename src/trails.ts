import { parseImportJson } from "./import-json";
import { addDays, capacity, todayInBrazil, type Topic } from "./planner";
import type { Incidence } from "./productivity-data";
import { incidenceSummary } from "./incidence";
export type TrailTopic = { topic_id: string; requires: string[]; minutes: number; estimated_priority: "low" | "medium" | "high" };
export type TrailConfig = { minutes: number[]; measure: "exams" | "questions"; topics: TrailTopic[] };
export type TrailSession = { id: string; topic_id: string; day: string; minutes: number; done: boolean; done_at?: string; source_url?: string; reason: string };
export type TrailWeek = { week: string; sessions: TrailSession[]; warnings: string[] };
export type TrailState = { version: 1; config: TrailConfig; weeks: TrailWeek[] };
export const weekStart = (day: string) => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));
export const trailContract = 'study_trail 1.0: objeto com exatamente schema_version:"1.0", type:"study_trail", contest_id (UUID do concurso fornecido), topics[]. Cada tópico: topic_id (UUID exato fornecido), requires (lista de UUIDs de pré-requisitos do mesmo concurso), minutes (inteiro de 5 a 480), estimated_priority (low/medium/high). Não invente IDs nem frequências. Não use IDs externos do catálogo em lugar dos UUIDs. Sem campos extras. Não inclua incidência neste arquivo: evidências documentadas são cadastradas e revisadas no Raio-X. Use apenas dependências justificáveis pelo conteúdo e evite ciclos.';
export function validateTrailTopics(topics: TrailTopic[], ids: Set<string>) {
  const mapped = new Map<string, TrailTopic>();
  if (topics.length > 1500) throw new Error("Limite de 1.500 assuntos.");
  for (const item of topics) {
    if (!item || !ids.has(item.topic_id) || mapped.has(item.topic_id) ||
        Object.keys(item).some(k => !["topic_id","requires","minutes","estimated_priority"].includes(k)) ||
        !Array.isArray(item.requires) || item.requires.length > 100 ||
        new Set(item.requires).size !== item.requires.length ||
        item.requires.some(id => !ids.has(id) || id === item.topic_id) ||
        !Number.isInteger(item.minutes) || item.minutes < 5 || item.minutes > 480 ||
        !["low","medium","high"].includes(item.estimated_priority))
      throw new Error("Assunto, duração, prioridade ou pré-requisito inválido: " + item?.topic_id);
    mapped.set(item.topic_id, item);
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Existe um ciclo de pré-requisitos.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of mapped.get(id)?.requires ?? []) visit(parent);
    visiting.delete(id); visited.add(id);
  }
  for (const id of mapped.keys()) visit(id);
}
export function parseTrail(raw: string, contest: string, ids: Set<string>): TrailTopic[] {
  if (new TextEncoder().encode(raw).length > 512 * 1024) throw new Error("Limite de 512 KiB.");
  const value = parseImportJson(raw);
  const doc = value as {schema_version?:unknown;type?:unknown;contest_id?:unknown;topics?:TrailTopic[]}|null;
  if (!doc || doc.schema_version !== "1.0" || doc.type !== "study_trail" ||
      doc.contest_id !== contest || Object.keys(doc).some(k => !["schema_version","type","contest_id","topics"].includes(k)) ||
      !Array.isArray(doc.topics) || !doc.topics.length) throw new Error("Documento inválido ou concurso diferente do destino.");
  validateTrailTopics(doc.topics, ids);
  return doc.topics;
}
export function topicDone(topic: string, topics: Topic[], weeks: TrailWeek[], config: TrailConfig) {
  return (topics.find(t => t.id === topic)?.progress ?? 0) >= 1 ||
    weeks.flatMap(w => w.sessions).filter(s => s.topic_id === topic && s.done).reduce((sum,s) => sum+s.minutes,0) >=
      (config.topics.find(t => t.topic_id === topic)?.minutes ?? topics.find(t => t.id === topic)?.minutes ?? 45);
}
export function buildTrailWeek(topics: Topic[], config: TrailConfig, incidence: Incidence[], board: string, week: string, weeks: TrailWeek[], today = todayInBrazil(), exam?: string): TrailWeek {
  validateTrailTopics(config.topics, new Set(topics.map(t => t.id)));
  if (config.minutes.length !== 7 || config.minutes.some(n => !Number.isInteger(n) || n < 0 || n > 720)) throw new Error("Informe sete disponibilidades de 0 a 720 minutos.");
  const previous = weeks.find(w => w.week === week);
  const sessions = (previous?.sessions ?? []).filter(s => s.done).map(s => ({ ...s }));
  const warnings: string[] = [];
  const records = new Map(config.topics.map(t => [t.topic_id,t]));
  const remaining = new Set(topics.filter(t => t.progress < 1).map(t => t.id));
  const ordered: Topic[] = [];
  const evidence = (id: string) => incidence.find(i => i.topic_id === id && i.board === board && i.measure === config.measure && incidenceSummary(i));
  const estimate = (t: Topic) => ({ low: 1, medium: 2, high: 3 }[records.get(t.id)?.estimated_priority ?? "medium"]);
  // A prerequisite inherits ordering urgency, never the dependent topic's frequency label.
  const urgency = new Map<string,{ evidence: Incidence | undefined; estimate: number }>();
  function rank(id: string): { evidence: Incidence | undefined; estimate: number } {
    const cached = urgency.get(id); if (cached) return cached;
    let selected = evidence(id);
    let estimated = estimate(topics.find(t => t.id === id)!);
    for (const child of config.topics.filter(t => t.requires.includes(id))) {
      const next = rank(child.topic_id);
      if (next.evidence && (!selected || next.evidence.occurrences / next.evidence.sample > selected.occurrences / selected.sample)) selected = next.evidence;
      estimated = Math.max(estimated,next.estimate);
    }
    const value = { evidence: selected,estimate: estimated }; urgency.set(id,value); return value;
  }
  while (remaining.size) {
    const ready = topics.filter(t => remaining.has(t.id) && (records.get(t.id)?.requires ?? []).every(id => !remaining.has(id)));
    if (!ready.length) throw new Error("Ciclo ou pré-requisito indisponível.");
    ready.sort((a,b) => {
      const ea = rank(a.id).evidence, eb = rank(b.id).evidence;
      if (!!ea !== !!eb) return ea ? -1 : 1;
      if (ea && eb) return eb.occurrences / eb.sample - ea.occurrences / ea.sample || a.id.localeCompare(b.id);
      return rank(b.id).estimate - rank(a.id).estimate || topics.indexOf(a) - topics.indexOf(b);
    });
    const chosen = ready[0]; ordered.push(chosen); remaining.delete(chosen.id);
  }
  const included = new Set(topics.filter(t => t.progress >= 1).map(t => t.id));
  let cursor = week < today ? today : week;
  const end = addDays(week, 6);
  for (const topic of ordered) {
    const requirements = records.get(topic.id)?.requires ?? [];
    if (requirements.some(id => !included.has(id))) { warnings.push(topic.name + ": aguardando pré-requisito em outra semana."); continue; }
    const done = weeks.flatMap(w => w.sessions).filter(s => s.topic_id === topic.id && s.done).reduce((sum,s) => sum+s.minutes,0);
    let left = Math.max(0, (records.get(topic.id)?.minutes ?? topic.minutes ?? 45) - done);
    let offset = done;
    const ev = evidence(topic.id);
    const reason = ev ? "Incidência histórica: " + incidenceSummary(ev) : "Sem dados de incidência · prioridade estimada " + ({ low:"baixa",medium:"média",high:"alta" }[records.get(topic.id)?.estimated_priority ?? "medium"]);
    while (left > 0 && cursor <= end) {
      if (exam && cursor >= exam) { warnings.push("A trilha não agenda estudo a partir da data da prova."); cursor = addDays(end,1); break; }
      const available = capacity({ minutes: config.minutes, finalDays: 0, overrides: {} }, cursor) - sessions.filter(s => s.day === cursor).reduce((sum,s) => sum+s.minutes,0);
      if (available <= 0) { cursor = addDays(cursor,1); continue; }
      const minutes = Math.min(left, available);
      sessions.push({ id: week+":"+topic.id+":"+offset, topic_id: topic.id, day: cursor, minutes, done: false, reason, ...(ev ? { source_url: ev.source_url } : {}) });
      left -= minutes; offset += minutes;
    }
    if (left > 0) warnings.push(topic.name + ": " + left + " min ficaram para outra semana.");
    else included.add(topic.id);
  }
  return { week, sessions, warnings: [...new Set(warnings)] };
}
