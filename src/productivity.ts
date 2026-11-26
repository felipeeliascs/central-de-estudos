export type Mode =
  "theory" | "video" | "reading" | "questions" | "review" | "mock";
export const modeLabels: Record<Mode, string> = {
  theory: "Teoria",
  video: "Videoaula",
  reading: "Leitura",
  questions: "Questões",
  review: "Revisão",
  mock: "Simulado",
};
export type Timer = {
  id: string;
  topic: string;
  mode: Mode;
  started: number;
  accumulated: number;
  runningSince: number | null;
  phase: "focus" | "break";
  pomodoro: boolean;
  focusMinutes: number;
  breakMinutes: number;
  phaseStarted: number;
  phaseAccumulated: number;
  phaseEnd: number | null;
  finished?: number;
  finalSeconds?: number;
};
export type Session = {
  id: string;
  topic_id: string;
  mode: Mode;
  started_at: string;
  ended_at: string;
  seconds: number;
  client_event_id: string;
};
export type ExternalResult = {
  result_kind?: "practice" | "mock";
  id: string;
  topic_id: string;
  provider: string;
  answered: number;
  correct: number;
  recorded_at: string;
  source_url: string | null;
  notes: string;
};
export type Evidence = {
  seconds: number;
  answered: number;
  correct: number;
  lastStudy?: string;
  lastQuestions?: string;
  reviews: number;
  lastReview?: string;
};
export function elapsed(timer: Timer, now: number) {
  return Math.max(
    0,
    timer.accumulated +
      (timer.runningSince === null
        ? 0
        : Math.max(
            0,
            (timer.phaseEnd ? Math.min(now, timer.phaseEnd) : now) -
              timer.runningSince,
          )),
  );
}
export function phaseElapsed(timer: Timer, now: number) {
  return (
    timer.phaseAccumulated +
    (timer.runningSince === null
      ? 0
      : Math.max(
          0,
          (timer.phaseEnd ? Math.min(now, timer.phaseEnd) : now) -
            timer.runningSince,
        ))
  );
}
export function advance(timer: Timer, now: number): Timer {
  if (!timer.pomodoro || !timer.phaseEnd || now < timer.phaseEnd) return timer;
  const end = timer.phaseEnd;
  const total = elapsed(timer, end);
  return {
    ...timer,
    accumulated: timer.phase === "focus" ? total : timer.accumulated,
    runningSince: null,
    phase: timer.phase === "focus" ? "break" : "focus",
    phaseStarted: end,
    phaseAccumulated: 0,
    phaseEnd: null,
  };
}
export function pause(timer: Timer, now: number): Timer {
  const current = advance(timer, now);
  if (current.runningSince === null) return current;
  return {
    ...current,
    accumulated:
      current.phase === "focus" ? elapsed(current, now) : current.accumulated,
    phaseAccumulated: phaseElapsed(current, now),
    runningSince: null,
    phaseEnd: null,
  };
}
export function resume(timer: Timer, now: number): Timer {
  if (timer.runningSince !== null) return timer;
  const duration =
    (timer.phase === "focus" ? timer.focusMinutes : timer.breakMinutes) * 60000;
  return {
    ...timer,
    runningSince: now,
    phaseStarted: now,
    phaseEnd: timer.pomodoro
      ? now + Math.max(0, duration - timer.phaseAccumulated)
      : null,
  };
}
export function finish(timer: Timer, now: number): Timer {
  if (timer.finished) return timer;
  const stopped = pause(timer, now);
  return {
    ...stopped,
    finished: now,
    finalSeconds: Math.floor(stopped.accumulated / 1000),
  };
}
export function dominance(
  e: Evidence,
  now: Date,
): "Não estudado" | "Em aprendizagem" | "Em revisão" | "Dominado" {
  const observed = e.seconds > 0 || e.answered > 0 || e.reviews > 0;
  if (!observed) return "Não estudado";
  const recent = (date?: string) =>
    !!date &&
    now.getTime() - Date.parse(date) >= 0 &&
    now.getTime() - Date.parse(date) <= 30 * 86400000;
  if (
    e.answered >= 20 &&
    e.correct / e.answered >= 0.8 &&
    e.reviews >= 2 &&
    recent(e.lastQuestions) &&
    recent(e.lastReview)
  )
    return "Dominado";
  if (
    e.reviews >= 1 &&
    e.answered >= 5 &&
    (recent(e.lastStudy) || recent(e.lastReview))
  )
    return "Em revisão";
  return "Em aprendizagem";
}
export const localDay = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function duration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
