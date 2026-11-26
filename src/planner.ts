export type Activity =
  "new" | "video" | "reading" | "questions" | "review" | "mock";
export const activityLabel: Record<Activity, string> = {
  new: "Conteúdo novo",
  video: "Videoaula",
  reading: "Leitura",
  questions: "Questões",
  review: "Flashcards e revisão",
  mock: "Simulado",
};
export type Settings = {
  minutes: number[];
  finalDays: number;
  overrides: Record<string, { priority: number; difficulty: number }>;
};
export const defaults: Settings = {
  minutes: Array<number>(7).fill(120),
  finalDays: 30,
  overrides: {},
};
export type Contest = {
  id: string;
  name: string;
  exam?: string;
  mockMinutes?: number;
};
export type Topic = {
  id: string;
  name: string;
  contest: string;
  discipline: string;
  disciplineName: string;
  weight?: number;
  questions?: number;
  priority?: number;
  minutes?: number;
  progress: number;
  steps: number[];
  accuracy?: number;
  due: number;
  video: boolean;
  reading: boolean;
  cards: boolean;
  incidence?: { rate: number; source: string; sample: number };
};
export type Block = {
  id: string;
  key: string;
  day: string;
  kind: Activity;
  name: string;
  minutes: number;
  reason: string;
  topicIds: string[];
  contestIds: string[];
  completed?: boolean;
  overdue?: string;
  dueReviews?: boolean;
  waiting?: boolean;
};
export type Plan = {
  blocks: Block[];
  warnings: string[];
  cycle: { name: string; minutes: number }[];
};
export type PlannerInputs = {
  contests: Contest[];
  topics: Topic[];
  equivalences: [string, string][];
};
const epoch = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const daysBetween = (a: string, b: string) =>
  Math.round((epoch(b) - epoch(a)) / 86400000);
export const addDays = (day: string, days: number) =>
  new Date(epoch(day) + days * 86400000).toISOString().slice(0, 10);
export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const capacity = (settings: Settings, day: string) =>
  settings.minutes[(new Date(epoch(day)).getUTCDay() + 6) % 7] ?? 0;
export const finalStretch = (
  contest: Contest,
  day: string,
  settings: Settings,
) =>
  !!contest.exam &&
  daysBetween(day, contest.exam) > 0 &&
  daysBetween(day, contest.exam) <= settings.finalDays;

type Candidate = {
  key: string;
  kind: Activity;
  name: string;
  discipline: string;
  topicIds: string[];
  contestIds: string[];
  minutes: number;
  score: number;
  reason: string;
  due: boolean;
  coverage: boolean;
  finalGap: number;
  overdue?: string;
};
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function groups(topics: Topic[], links: PlannerInputs["equivalences"]) {
  const leaders = new Map(topics.map((t) => [t.id, t.id]));
  function leader(id: string): string {
    let current = id;
    while (leaders.get(current) !== current) current = leaders.get(current)!;
    return current;
  }
  for (const [a, b] of links) {
    if (!leaders.has(a) || !leaders.has(b)) continue;
    const roots = [leader(a), leader(b)].sort(byId);
    leaders.set(roots[1], roots[0]);
  }
  const result = new Map<string, Topic[]>();
  for (const topic of topics) {
    const key = leader(topic.id);
    const group = result.get(key) ?? [];
    group.push(topic);
    result.set(key, group);
  }
  return result;
}

export function generatePlan(
  input: PlannerInputs,
  settings: Settings,
  today: string,
  previous: Block[] = [],
  horizon = 28,
): Plan {
  const contests = new Map(input.contests.map((c) => [c.id, c]));
  const active = (id: string, day: string) => {
    const c = contests.get(id);
    return !!c && (!c.exam || c.exam > day);
  };
  const eligible = input.topics.filter((t) => active(t.contest, today));
  const completed = previous.filter((b) => b.completed);
  const historyFor = (kind: Activity, topics: string[], id: string) =>
    completed.filter(
      (b) =>
        b.kind === kind &&
        (topics.length
          ? b.topicIds.some((t) => topics.includes(t))
          : b.contestIds.includes(id)),
    );
  const pending = previous.filter(
    (b) => !b.completed && (b.day < today || b.overdue),
  );
  const queue: Candidate[] = [];
  const cycle = new Map<string, { name: string; minutes: number }>();
  const maxWeight = Math.max(1, ...eligible.map((t) => t.weight ?? 0));
  const maxQuestions = Math.max(1, ...eligible.map((t) => t.questions ?? 0));
  function build(
    kind: Activity,
    group: Topic[],
    minutes: number,
    score: number,
    reason: string,
    due = false,
    coverage = false,
    contest?: Contest,
  ) {
    const topicIds = group.map((t) => t.id).sort(byId);
    const contestIds = contest
      ? [contest.id]
      : [...new Set(group.map((t) => t.contest))].sort(byId);
    const key = `${topicIds[0] ?? contestIds[0]}:${kind}`;
    const history = historyFor(kind, topicIds, contestIds[0]);
    const overdue = pending
      .filter(
        (b) =>
          b.key === key ||
          (b.kind === kind && b.topicIds.some((t) => topicIds.includes(t))),
      )
      .map((b) => b.overdue ?? b.day)
      .sort(byId)[0];
    const windowStart = addDays(today, kind === "review" ? (due ? 0 : -3) : -7);
    minutes -= history
      .filter((b) => coverage || b.day >= (overdue ?? windowStart))
      .reduce((sum, b) => sum + b.minutes, 0);
    if (minutes <= 0) return;
    const primary = group[0];
    queue.push({
      key,
      kind,
      name: primary?.name ?? contest!.name,
      discipline: primary?.discipline ?? `mock:${contest!.id}`,
      topicIds,
      contestIds,
      minutes,
      score,
      reason,
      due,
      coverage,
      finalGap: group.length
        ? Math.max(
            ...group.map(
              (t) =>
                (t.accuracy !== undefined && t.accuracy < 0.65 ? 12 : 0) +
                (1 - t.progress) *
                  (6 +
                    (t.priority ?? 0) * 3 +
                    ((t.weight ?? 0) / maxWeight) * 8 +
                    ((t.questions ?? 0) / maxQuestions) * 5),
            ),
          )
        : 0,
      overdue,
    });
    if (primary)
      cycle.set(primary.discipline, {
        name: primary.disciplineName,
        minutes: 0,
      });
  }
  for (const group of groups(eligible, input.equivalences).values()) {
    group.sort((a, b) => byId(a.id, b.id));
    const strongest = Math.max(...group.map((t) => t.progress));
    const assessed = group.flatMap((t) =>
      t.accuracy === undefined ? [] : [t.accuracy],
    );
    const accuracy = assessed.length ? Math.min(...assessed) : undefined;
    const manual = group.map((t) => settings.overrides[t.id]).filter(Boolean);
    const priority = Math.max(0, ...group.map((t) => t.priority ?? 0));
    const custom = Math.max(0, ...manual.map((o) => o.priority));
    const difficulty = Math.max(0, ...manual.map((o) => o.difficulty));
    const weight = Math.max(0, ...group.map((t) => t.weight ?? 0));
    const questions = Math.max(0, ...group.map((t) => t.questions ?? 0));
    const incidence = group
      .flatMap((t) => (t.incidence ? [t.incidence] : []))
      .sort((a, b) => b.rate - a.rate)[0];
    const due = group.reduce((n, t) => n + t.due, 0);
    const poor = accuracy !== undefined && accuracy < 0.65;
    const score =
      priority * 6 +
      custom * 15 +
      difficulty * 7 +
      (weight / maxWeight) * 14 +
      (questions / maxQuestions) * 10 +
      (incidence?.rate ?? 0) * 12 +
      (poor ? 28 : 0) +
      (1 - strongest) * 12;
    const reasons = [
      accuracy === undefined
        ? "Ainda não avaliado"
        : `Acertos: ${Math.round(accuracy * 100)}%${poor ? " · desempenho baixo" : ""}`,
      `progresso: ${Math.round(strongest * 100)}%`,
    ];
    if (weight) reasons.push(`peso informado: ${weight}`);
    if (questions) reasons.push(`${questions} questões previstas`);
    if (priority) reasons.push("prioridade estimada do edital");
    if (custom) reasons.push("prioridade manual");
    if (difficulty) reasons.push(`dificuldade individual: ${difficulty}/3`);
    if (incidence)
      reasons.push(
        `incidência documentada: ${Math.round(incidence.rate * 100)}% em ${incidence.sample} questões (${incidence.source})`,
      );
    if (group.length > 1) reasons.push("conteúdo comum confirmado");
    const reason = reasons.join(" · ");
    const estimate = Math.max(...group.map((t) => t.minutes ?? 45));
    if (!group.some((t) => t.steps.includes(1)) && strongest < 1)
      build(
        "new",
        group,
        Math.max(10, Math.ceil(estimate * (1 - strongest))),
        score,
        reason,
        false,
        true,
      );
    if (group.some((t) => t.video) && !group.some((t) => t.steps.includes(0)))
      build(
        "video",
        group,
        Math.max(10, Math.ceil(estimate / 2)),
        score - 2,
        reason,
        false,
        true,
      );
    if (group.some((t) => t.reading) && !group.some((t) => t.steps.includes(2)))
      build(
        "reading",
        group,
        Math.max(10, Math.ceil(estimate / 3)),
        score - 3,
        reason,
        false,
        true,
      );
    build("questions", group, poor ? 30 : 20, score + (poor ? 8 : 1), reason);
    if (due || strongest > 0 || group.some((t) => t.cards))
      build(
        "review",
        group,
        due ? Math.min(60, Math.max(10, due * 2)) : 15,
        score + 5,
        due ? `${due} revisões vencidas · ${reason}` : reason,
        !!due,
      );
  }
  for (const c of input.contests.filter((c) => active(c.id, today)))
    build(
      "mock",
      [],
      c.mockMinutes ?? 30,
      5,
      c.mockMinutes
        ? "Duração do simulado cadastrado"
        : "Simulado curto sugerido (30 min)",
      false,
      false,
      c,
    );

  const warnings: string[] = [];
  const deadlines = input.contests
    .flatMap((c) => (c.exam && c.exam > today ? [c.exam] : []))
    .sort(byId);
  for (const deadline of new Set(deadlines)) {
    const days = daysBetween(today, deadline);
    const week = settings.minutes.reduce((sum, n) => sum + n, 0);
    let available = Math.floor(days / 7) * week;
    for (let i = 0; i < days % 7; i++)
      available += capacity(settings, addDays(today, i));
    available -= completed
      .filter((b) => b.day >= today && b.day < deadline)
      .reduce((sum, b) => sum + b.minutes, 0);
    const required = queue
      .filter(
        (t) =>
          t.coverage &&
          t.contestIds.some((id) => {
            const exam = contests.get(id)?.exam;
            return !!exam && exam <= deadline;
          }),
      )
      .reduce((sum, t) => sum + t.minutes, 0);
    if (required > Math.max(0, available))
      warnings.push(
        `Cobertura estimada inviável até ${deadline}: ${required} min de conteúdo para ${Math.max(0, available)} min disponíveis, antes de questões e revisões.`,
      );
  }
  const blocks = [...completed];
  const kindUse = new Map<Activity, number>();
  for (let offset = 0; offset < horizon; offset++) {
    const day = addDays(today, offset);
    const used = completed
      .filter((b) => b.day === day)
      .reduce((sum, b) => sum + b.minutes, 0);
    let remaining = Math.max(0, capacity(settings, day) - used);
    if (used > capacity(settings, day))
      warnings.push(
        `${day}: atividades concluídas já ultrapassam a nova disponibilidade.`,
      );
    const score = (t: Candidate) => {
      const final = t.contestIds.some((id) =>
        finalStretch(contests.get(id)!, day, settings),
      );
      const urgent = Math.max(
        ...t.contestIds.map((id) => {
          const exam = contests.get(id)?.exam;
          return exam && exam > day
            ? Math.max(0, 30 - daysBetween(day, exam))
            : 0;
        }),
      );
      return (
        t.score +
        urgent +
        (t.overdue ? 35 : 0) +
        (final
          ? t.kind === "review" || t.kind === "mock"
            ? 38
            : t.finalGap
          : 0) -
        (cycle.get(t.discipline)?.minutes ?? 0) * 0.65 -
        (kindUse.get(t.kind) ?? 0) * 8
      );
    };
    while (remaining > 0) {
      const candidates = queue.filter(
        (t) =>
          t.minutes > 0 &&
          t.contestIds.some((id) => active(id, day)) &&
          (t.kind !== "mock" || t.minutes <= remaining),
      );
      candidates.sort(
        (a, b) =>
          Number(b.due) - Number(a.due) ||
          score(b) - score(a) ||
          byId(a.key, b.key),
      );
      const task = candidates[0];
      if (!task) break;
      const minutes = Math.min(
        remaining,
        task.minutes,
        task.kind === "mock" ? task.minutes : 25,
      );
      const final = task.contestIds.some((id) =>
        finalStretch(contests.get(id)!, day, settings),
      );
      blocks.push({
        id: `${day}/${task.key}/${blocks.length}`,
        key: task.key,
        day,
        kind: task.kind,
        name: task.name,
        minutes,
        reason: `${task.reason}${final ? " · reta final" : ""}${task.overdue ? ` · reagendado de ${task.overdue}` : ""}`,
        topicIds: task.topicIds,
        contestIds: task.contestIds,
        overdue: task.overdue,
        dueReviews: task.due,
      });
      remaining -= minutes;
      task.minutes -= minutes;
      const slot = cycle.get(task.discipline);
      if (slot) slot.minutes += minutes;
      kindUse.set(task.kind, (kindUse.get(task.kind) ?? 0) + 1);
    }
  }
  const outstanding = queue.reduce((sum, t) => sum + t.minutes, 0);
  if (outstanding)
    warnings.push(
      `${outstanding} min de atividades ficaram fora do calendário de ${horizon} dias. Reveja sua disponibilidade e as prioridades.`,
    );
  for (const task of queue.filter((t) => t.minutes > 0 && t.overdue))
    blocks.push({
      id: `waiting/${task.key}`,
      key: task.key,
      day: task.overdue!,
      kind: task.kind,
      name: task.name,
      minutes: task.minutes,
      reason: task.reason,
      topicIds: task.topicIds,
      contestIds: task.contestIds,
      overdue: task.overdue,
      waiting: true,
    });
  return {
    blocks,
    warnings,
    cycle: [...cycle.values()].sort(
      (a, b) => b.minutes - a.minutes || byId(a.name, b.name),
    ),
  };
}
