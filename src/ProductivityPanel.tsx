import { CollapsibleSection } from "./CollapsibleSection";
import { PracticeDashboard } from "./PerformanceOverview";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { incidenceSummary } from "./incidence";
import { ModulePage } from "./ModulePage";
import { safeUrl, type Snapshot, type Node } from "./domain";
import { readPlan, plannerInputs } from "./planner-data";
import {
  addDays,
  todayInBrazil,
  generatePlan,
  type PlannerInputs,
  type Settings,
} from "./planner";
import {
  advance,
  dominance,
  duration,
  elapsed,
  finish,
  localDay,
  modeLabels,
  pause,
  resume,
  type Evidence,
  type ExternalResult,
  type Mode,
  type Session,
  type Timer,
} from "./productivity";
import {
  productivityStore,
  type Incidence,
  type ProductivityData,
} from "./productivity-data";

function ancestors(nodes: Node[], id: string) {
  const path: Node[] = [];
  let n = nodes.find((x) => x.id === id);
  while (n) {
    path.unshift(n);
    const parent = n.parent_id;
    n = nodes.find((x) => x.id === parent);
  }
  return path;
}
const dateFor = (day: string) => new Date(`${day}T12:00:00-03:00`);
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${day}T00:00:00Z`));
const key = (user: string) => `central-study-timer:${user}`;

export function ProductivityPanel({
  snapshot,
  user,
  demo,
  close,
  externalMock = false,
  startIncidence = false,
  startDashboard = false,
}: {
  snapshot: Snapshot;
  user: string;
  demo: boolean;
  close: () => void;
  externalMock?: boolean;
  startIncidence?: boolean;
  startDashboard?: boolean;
}) {
  const [view, setView] = useState<
    "timer" | "dashboard" | "results" | "incidence"
  >(startIncidence ? "incidence" : externalMock ? "results" : startDashboard ? "dashboard" : "timer");
  const [resultKind, setResultKind] = useState<"practice" | "mock">(
    externalMock ? "mock" : "practice",
  );
  const [timer, setTimer] = useState<Timer | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(key(user)) ?? "null");
    } catch {
      return null;
    }
  });
  const [tick, setTick] = useState(() => Date.now());
  const [data, setData] = useState<ProductivityData | null>(null);
  const [source, setSource] = useState<PlannerInputs | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [contest, setContest] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("theory");
  const [pomodoro, setPomodoro] = useState(false);
  const [focus, setFocus] = useState(25);
  const [rest, setRest] = useState(5);
  const [editing, setEditing] = useState<Session | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [sessionDay, setSessionDay] = useState(todayInBrazil());
  const [manualId, setManualId] = useState(() => crypto.randomUUID());
  const [provider, setProvider] = useState("Gran Questões");
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [resultUrl, setResultUrl] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [resultDay, setResultDay] = useState(todayInBrazil());
  const [resultId, setResultId] = useState(() => crypto.randomUUID());
  const [board, setBoard] = useState("");
  const [measure, setMeasure] = useState<"exams" | "questions">("exams");
  const [sample, setSample] = useState(0);
  const [occurrences, setOccurrences] = useState(0);
  const [sourceUrl, setSourceUrl] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [filterContest, setFilterContest] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("");
  const [from, setFrom] = useState(addDays(todayInBrazil(), -27));
  const [to, setTo] = useState(todayInBrazil());
  const db = productivityStore(user, demo);
  const nodes = snapshot.nodes;
  const contests = nodes.filter(
    (n) => n.kind === "contest" && !n.catalog_archived,
  );
  const disciplines = nodes.filter(
    (n) =>
      n.kind === "discipline" && n.parent_id === contest && !n.catalog_archived,
  );
  const topics = nodes.filter(
    (n) =>
      ["topic", "subtopic"].includes(n.kind) &&
      ancestors(nodes, n.id).some((x) => x.id === discipline) &&
      !ancestors(nodes, n.id).some((x) => x.catalog_archived),
  );
  const name = (id: string) =>
    nodes.find((n) => n.id === id)?.name ?? "Assunto indisponível";
  const stored = useMemo(() => productivityStore(user, demo), [user, demo]);
  async function reload() {
    const [records, input, plan] = await Promise.all([
      stored.load(),
      plannerInputs(snapshot, user, demo),
      readPlan(user, demo),
    ]);
    setData(records);
    setSource(input);
    setSettings(plan.state.settings);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      stored.load(),
      plannerInputs(snapshot, user, demo),
      readPlan(user, demo),
    ])
      .then(([records, input, plan]) => {
        if (active) {
          setData(records);
          setSource(input);
          setSettings(plan.state.settings);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    if (!demo)
      void import("./repository")
        .then(({ supabase }) => supabase!.rpc("study_catalog_admin"))
        .then((r) => {
          if (active && !r.error) setAdmin(r.data === true);
        });
    return () => {
      active = false;
    };
  }, [snapshot, user, demo, stored]);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!timer) return;
    const next = advance(timer, tick);
    if (next !== timer) {
      localStorage.setItem(key(user), JSON.stringify(next));
      setTimer(next);
    }
  }, [tick, timer, user]);
  function changeTimer(next: Timer | null) {
    if (next) localStorage.setItem(key(user), JSON.stringify(next));
    else localStorage.removeItem(key(user));
    setTimer(next);
  }
  async function run(
    action: () => Promise<void>,
    message: string,
    after?: () => void,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      await reload();
      after?.();
      setStatus(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function start() {
    if (!topic) {
      setError("Selecione concurso, disciplina e assunto.");
      return;
    }
    const now = Date.now();
    changeTimer({
      id: crypto.randomUUID(),
      topic,
      mode,
      started: now,
      accumulated: 0,
      runningSince: now,
      phase: "focus",
      pomodoro,
      focusMinutes: focus,
      breakMinutes: rest,
      phaseStarted: now,
      phaseAccumulated: 0,
      phaseEnd: pomodoro ? now + focus * 60000 : null,
    });
    setError("");
  }
  function saveTimer() {
    if (!timer) return;
    const done = finish(timer, Date.now());
    changeTimer(done);
    if (!done.finalSeconds) {
      setError("A sessão precisa ter ao menos um segundo de estudo.");
      return;
    }
    const record: Session = {
      id: done.id,
      client_event_id: done.id,
      topic_id: done.topic,
      mode: done.mode,
      started_at: new Date(done.started).toISOString(),
      ended_at: new Date(done.finished!).toISOString(),
      seconds: done.finalSeconds,
    };
    void run(
      () => db.session(record),
      "Sessão salva.",
      () => changeTimer(null),
    );
  }
  function saveManual(e: FormEvent) {
    e.preventDefault();
    const record: Session = editing
      ? {
          ...editing,
          mode,
          seconds: Math.round(minutes * 60),
          started_at: dateFor(sessionDay).toISOString(),
          ended_at: new Date(
            dateFor(sessionDay).getTime() + minutes * 60000,
          ).toISOString(),
        }
      : {
          id: manualId,
          client_event_id: manualId,
          topic_id: topic,
          mode,
          started_at: dateFor(sessionDay).toISOString(),
          ended_at: new Date(
            dateFor(sessionDay).getTime() + minutes * 60000,
          ).toISOString(),
          seconds: Math.round(minutes * 60),
        };
    if (
      !record.topic_id ||
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      minutes > 1440
    ) {
      setError("Informe assunto e duração entre 1 e 1.440 minutos.");
      return;
    }
    void run(
      () => (editing ? db.correct(record) : db.session(record)),
      editing ? "Sessão corrigida." : "Sessão manual salva.",
      () => {
        setEditing(null);
        setManualId(crypto.randomUUID());
      },
    );
  }
  function saveResult(e: FormEvent) {
    e.preventDefault();
    if (
      !topic ||
      !provider.trim() ||
      !Number.isInteger(answered) ||
      !Number.isInteger(correct) ||
      answered < 1 ||
      correct < 0 ||
      correct > answered
    ) {
      setError("Informe assunto, plataforma e quantidades válidas.");
      return;
    }
    let url: string | null = null;
    try {
      if (resultUrl) url = safeUrl(resultUrl);
    } catch {
      setError("Informe uma URL HTTPS válida.");
      return;
    }
    const result: ExternalResult = {
      id: resultId,
      topic_id: topic,
      provider: provider.trim(),
      answered,
      correct,
      recorded_at: dateFor(resultDay).toISOString(),
      result_kind: resultKind,
      source_url: url,
      notes: resultNote,
    };
    void run(
      () => db.result(result),
      "Resultado manual salvo.",
      () => {
        setResultId(crypto.randomUUID());
        setAnswered(0);
        setCorrect(0);
        setResultNote("");
      },
    );
  }
  function saveIncidence(e: FormEvent) {
    e.preventDefault();
    try {
      if (
        !topic ||
        !board.trim() ||
        !Number.isInteger(sample) ||
        sample < 1 ||
        !Number.isInteger(occurrences) ||
        occurrences < 0 ||
        occurrences > sample ||
        !periodStart ||
        !periodEnd ||
        periodEnd < periodStart
      )
        throw new Error("Preencha assunto, banca, período e amostra válidos.");
      const value: Incidence = {
        topic_id: topic,
        measure,
        board: board.trim(),
        sample,
        occurrences,
        source_url: safeUrl(sourceUrl),
        period_start: periodStart,
        period_end: periodEnd,
      };
      void run(() => db.incidence(value), "Incidência registrada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const matches = (id: string) => {
    const path = ancestors(nodes, id);
    return (
      (!filterContest || path.some((n) => n.id === filterContest)) &&
      (!filterDiscipline || path.some((n) => n.id === filterDiscipline))
    );
  };
  const inPeriod = (stamp: string) => {
    const day = localDay(new Date(stamp));
    return day >= from && day <= to;
  };
  const cardTopic = new Map(
    (data?.cards ?? [])
      .filter((c) => !c.archived)
      .map((c) => [
        c.id,
        data?.decks.find((d) => d.id === c.deck_id && !d.archived)?.topic_id,
      ]),
  );
  const sessions = (data?.sessions ?? []).filter(
    (s) => matches(s.topic_id) && inPeriod(s.started_at),
  );
  const results = (data?.results ?? []).filter(
    (r) => matches(r.topic_id) && inPeriod(r.recorded_at),
  );
  const answers = (data?.answers ?? []).filter(
    (a) =>
      a.study_questions &&
      matches(a.study_questions.topic_id) &&
      inPeriod(a.created_at),
  );
  const reviews = (data?.reviews ?? []).filter((r) => {
    const id = cardTopic.get(r.card_id);
    return id && matches(id) && inPeriod(r.reviewed_at);
  });
  const due = (data?.due ?? []).filter((d) => {
    const id = cardTopic.get(d.card_id);
    return id && matches(id) && Date.parse(d.due) <= tick;
  });
  const count =
    results.reduce((sum, r) => sum + r.answered, 0) + answers.length;
  const hits =
    results.reduce((sum, r) => sum + r.correct, 0) +
    answers.filter((a) => a.correct).length;
  const today = todayInBrazil();
  const monday = addDays(
    today,
    -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  const daySeconds = (data?.sessions ?? [])
    .filter(
      (s) => matches(s.topic_id) && localDay(new Date(s.started_at)) === today,
    )
    .reduce((sum, s) => sum + s.seconds, 0);
  const weekSeconds = (data?.sessions ?? [])
    .filter(
      (s) =>
        matches(s.topic_id) &&
        localDay(new Date(s.started_at)) >= monday &&
        localDay(new Date(s.started_at)) <= today,
    )
    .reduce((sum, s) => sum + s.seconds, 0);
  const relevant = nodes.filter(
    (n) =>
      ["topic", "subtopic"].includes(n.kind) &&
      !ancestors(nodes, n.id).some((x) => x.catalog_archived) &&
      matches(n.id),
  );
  const priority =
    source && settings
      ? generatePlan(source, settings, today)
          .blocks.filter(
            (b) => !b.completed && !b.waiting && b.topicIds.some(matches),
          )
          .slice(0, 5)
      : [];
  function evidence(id: string): Evidence {
    const ss = (data?.sessions ?? []).filter((s) => s.topic_id === id);
    const rr = (data?.results ?? []).filter((r) => r.topic_id === id);
    const aa = (data?.answers ?? []).filter(
      (a) => a.study_questions?.topic_id === id,
    );
    const vv = (data?.reviews ?? []).filter(
      (r) => cardTopic.get(r.card_id) === id,
    );
    const newest = (values: string[]) => values.sort().at(-1);
    return {
      seconds: ss.reduce((sum, s) => sum + s.seconds, 0),
      answered: rr.reduce((sum, r) => sum + r.answered, 0) + aa.length,
      correct:
        rr.reduce((sum, r) => sum + r.correct, 0) +
        aa.filter((a) => a.correct).length,
      reviews: vv.length,
      lastStudy: newest(ss.map((s) => s.ended_at)),
      lastQuestions: newest([
        ...rr.map((r) => r.recorded_at),
        ...aa.map((a) => a.created_at),
      ]),
      lastReview: newest(vv.map((r) => r.reviewed_at)),
    };
  }
  const chartDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const byDay = chartDays.map((day) => ({
    day,
    seconds: sessions
      .filter((s) => localDay(new Date(s.started_at)) === day)
      .reduce((sum, s) => sum + s.seconds, 0),
  }));
  const max = Math.max(1, ...byDay.map((d) => d.seconds));
  return (
    <ModulePage title="Meu desempenho" close={close} busy={busy}>
      <p className="page-description">Acompanhe sua evolução nas questões e identifique pontos de atenção.</p>
      <nav className="catalog-actions" aria-label="Módulos de produtividade">
        {(
          [
            ["timer", "Cronômetro"],
            ["dashboard", "Dashboard"],
            ["results", "Questões externas"],
            ["incidence", "Raio-X do edital"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={view === id ? "primary" : "secondary"}
            key={id}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!data && <p>Carregando dados…</p>}
      {view !== "dashboard" && (
        <div className="catalog-fields">
          <label>
            Concurso
            <select
              value={contest}
              onChange={(e) => {
                setContest(e.target.value);
                setDiscipline("");
                setTopic("");
              }}
            >
              <option value="">Selecione</option>
              {contests.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Disciplina
            <select
              value={discipline}
              onChange={(e) => {
                setDiscipline(e.target.value);
                setTopic("");
              }}
            >
              <option value="">Selecione</option>
              {disciplines.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assunto ou subassunto
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Selecione</option>
              {topics.map((n) => (
                <option key={n.id} value={n.id}>
                  {ancestors(nodes, n.id)
                    .slice(2)
                    .map((x) => x.name)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {view === "timer" && (
        <>
          <label>
            Modalidade
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              {Object.entries(modeLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={pomodoro}
              onChange={(e) => setPomodoro(e.target.checked)}
            />
            Modo Pomodoro
          </label>
          {pomodoro && (
            <div className="catalog-fields">
              <label>
                Foco (min)
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={focus}
                  onChange={(e) =>
                    setFocus(Math.max(1, Math.min(180, Number(e.target.value))))
                  }
                />
              </label>
              <label>
                Intervalo (min)
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={rest}
                  onChange={(e) =>
                    setRest(Math.max(1, Math.min(180, Number(e.target.value))))
                  }
                />
              </label>
            </div>
          )}
          {timer ? (
            <div className="catalog-entry">
              <h2>
                {duration(
                  (timer.phase === "focus"
                    ? elapsed(timer, tick)
                    : timer.accumulated) / 1000,
                )}
              </h2>
              <p>
                {name(timer.topic)} · {modeLabels[timer.mode]} ·{" "}
                {timer.finished
                  ? "Aguardando salvamento"
                  : timer.runningSince === null
                    ? "Pausado"
                    : timer.phase === "break"
                      ? "Intervalo"
                      : "Estudando"}
              </p>
              {timer.pomodoro && !timer.finished && (
                <p>
                  {timer.phase === "break" ? "Intervalo" : "Foco"} ·{" "}
                  {timer.phaseEnd
                    ? duration(Math.max(0, timer.phaseEnd - tick) / 1000)
                    : "Pronto para retomar"}
                </p>
              )}
              <div className="catalog-actions">
                {!timer.finished &&
                  (timer.runningSince === null ? (
                    <button
                      className="secondary"
                      onClick={() => changeTimer(resume(timer, Date.now()))}
                    >
                      Retomar{" "}
                      {timer.pomodoro
                        ? timer.phase === "break"
                          ? "intervalo"
                          : "foco"
                        : ""}
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => changeTimer(pause(timer, Date.now()))}
                    >
                      Pausar
                    </button>
                  ))}
                <button className="primary" disabled={busy} onClick={saveTimer}>
                  {timer.finished
                    ? "Tentar salvar novamente"
                    : "Finalizar e salvar"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Descartar a sessão atual?"))
                      changeTimer(null);
                  }}
                >
                  Descartar
                </button>
              </div>
            </div>
          ) : (
            <button className="primary" onClick={start}>
              Iniciar cronômetro
            </button>
          )}
          <details className="catalog-entry" id="manual-session">
            <summary>
              {editing ? "Corrigir sessão" : "Registrar sessão manual"}
            </summary>
            {editing && (
              <p>
                Corrigindo {name(editing.topic_id)}. A data é registrada às 12h
                no fuso de São Paulo.
              </p>
            )}
            <form onSubmit={saveManual}>
              <label>
                Data
                <input
                  required
                  type="date"
                  value={sessionDay}
                  onChange={(e) => setSessionDay(e.target.value)}
                />
              </label>
              <label>
                Minutos líquidos
                <input
                  required
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
              <button className="primary" disabled={busy}>
                Salvar sessão
              </button>
              {editing && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancelar correção
                </button>
              )}
            </form>
          </details>
          <h3>Sessões registradas</h3>
          <ul>
            {data?.sessions.map((s) => (
              <li key={s.id}>
                {name(s.topic_id)} ·{" "}
                {dateLabel(localDay(new Date(s.started_at)))} ·{" "}
                {duration(s.seconds)} · {modeLabels[s.mode] ?? "Teoria"}{" "}
                <button
                  className="text-button"
                  onClick={() => {
                    setEditing(s);
                    setMode(s.mode ?? "theory");
                    setMinutes(Math.round(s.seconds / 60));
                    setSessionDay(localDay(new Date(s.started_at)));
                    document
                      .getElementById("manual-session")
                      ?.setAttribute("open", "");
                  }}
                >
                  Corrigir
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {view === "results" && (
        <>
          <form onSubmit={saveResult}>
            <div className="catalog-fields">
              <label>
                Tipo de resultado
                <select
                  value={resultKind}
                  onChange={(e) =>
                    setResultKind(e.target.value as "practice" | "mock")
                  }
                >
                  <option value="practice">Prática externa</option>
                  <option value="mock">Simulado externo</option>
                </select>
              </label>
              <label>
                Plataforma
                <input
                  required
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </label>
              <label>
                Data
                <input
                  required
                  type="date"
                  value={resultDay}
                  onChange={(e) => setResultDay(e.target.value)}
                />
              </label>
              <label>
                Questões resolvidas
                <input
                  required
                  type="number"
                  min={1}
                  value={answered}
                  onChange={(e) => setAnswered(Number(e.target.value))}
                />
              </label>
              <label>
                Acertos
                <input
                  required
                  type="number"
                  min={0}
                  max={answered}
                  value={correct}
                  onChange={(e) => setCorrect(Number(e.target.value))}
                />
              </label>
              <label>
                Link da prática (opcional)
                <input
                  type="url"
                  value={resultUrl}
                  onChange={(e) => setResultUrl(e.target.value)}
                />
              </label>
            </div>
            <label>
              Observações
              <textarea
                value={resultNote}
                onChange={(e) => setResultNote(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Salvar resultado manual
            </button>
          </form>
          <ul>
            {data?.results.map((r) => (
              <li key={r.id}>
                {name(r.topic_id)} · {r.provider} · {r.correct}/{r.answered} ·{" "}
                {dateLabel(localDay(new Date(r.recorded_at)))}
                {r.result_kind === "mock" ? " · Simulado externo" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {view === "dashboard" && <nav className="period-shortcuts" aria-label="Período do desempenho">
        {([["Hoje", 0], ["7 dias", 6], ["15 dias", 14], ["30 dias", 29]] as const).map(([label, days]) => <button key={label} className="secondary" aria-pressed={from === addDays(today, -days) && to === today} onClick={() => { setFrom(addDays(today, -days)); setTo(today); }}>{label}</button>)}
        <button className="secondary" aria-pressed={from === "0001-01-01"} onClick={() => { setFrom("0001-01-01"); setTo(today); }}>Desde o início</button>
      </nav>}
      {(view === "dashboard" || view === "incidence") && (
        <div className="catalog-fields">
          <label>
            Concurso
            <select
              value={filterContest}
              onChange={(e) => {
                setFilterContest(e.target.value);
                setFilterDiscipline("");
              }}
            >
              <option value="">Todos</option>
              {contests.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Disciplina
            <select
              value={filterDiscipline}
              onChange={(e) => setFilterDiscipline(e.target.value)}
            >
              <option value="">Todas</option>
              {nodes
                .filter(
                  (n) =>
                    n.kind === "discipline" &&
                    (!filterContest || n.parent_id === filterContest),
                )
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}
      {view === "dashboard" && data && (
        <>
          <PracticeDashboard points={Array.from(new Set([...results.map(r => localDay(new Date(r.recorded_at))), ...answers.map(a => localDay(new Date(a.created_at)))])).sort().map(day => ({
            day,
            answered: results.filter(r => localDay(new Date(r.recorded_at)) === day).reduce((sum, r) => sum + r.answered, 0) + answers.filter(a => localDay(new Date(a.created_at)) === day).length,
            correct: results.filter(r => localDay(new Date(r.recorded_at)) === day).reduce((sum, r) => sum + r.correct, 0) + answers.filter(a => localDay(new Date(a.created_at)) === day && a.correct).length,
          }))} />
          <CollapsibleSection title="Tempo de estudo, revisões e indicadores detalhados" description="Histórico de tempo e indicadores complementares." icon={null} storageKey={"central-performance:"+user+":details"}>
          <div className="overview-grid">
            <div className="catalog-entry">
              Horas líquidas no período
              <strong>
                {" "}
                {duration(sessions.reduce((sum, s) => sum + s.seconds, 0))}
              </strong>
            </div>
            <div className="catalog-entry">
              Meta diária{" "}
              <strong>
                {duration(daySeconds)} /{" "}
                {settings?.minutes[
                  (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
                ] ?? 0}{" "}
                min
              </strong>
            </div>
            <div className="catalog-entry">
              Meta semanal{" "}
              <strong>
                {duration(weekSeconds)} /{" "}
                {settings?.minutes.reduce((a, b) => a + b, 0) ?? 0} min
              </strong>
            </div>
            <div className="catalog-entry">
              Questões <strong>{count}</strong> · Acertos {hits} · Erros{" "}
              {count - hits} ·{" "}
              {count ? `${Math.round((hits / count) * 100)}%` : "Sem dados"}
            </div>
            <div className="catalog-entry">
              Flashcards revisados <strong>{reviews.length}</strong> · Revisões
              vencidas <strong>{due.length}</strong>
            </div>
            <div className="catalog-entry">
              Progresso do edital{" "}
              <strong>
                {relevant.length
                  ? `${Math.round((relevant.filter((n) => snapshot.checks.filter((c) => c.topic_id === n.id && c.done && c.user_id === user).length === 5).length / relevant.length) * 100)}%`
                  : "Sem dados"}
              </strong>
            </div>
          </div>
          <h3>Evolução do tempo nos últimos sete dias</h3>
          <div
            className="productivity-chart"
            role="img"
            aria-label={`Tempo líquido por dia. ${byDay.map((d) => `${dateLabel(d.day)} ${duration(d.seconds)}`).join(", ")}`}
          >
            <div className="chart-bars" aria-hidden="true">
              {byDay.map((d) => (
                <div key={d.day}>
                  <span style={{ height: `${(d.seconds / max) * 100}%` }} />
                  <small>{dateLabel(d.day)}</small>
                </div>
              ))}
            </div>
          </div>
          <ul>
            {byDay.map((d) => (
              <li key={d.day}>
                {dateLabel(d.day)} · {duration(d.seconds)}
              </li>
            ))}
          </ul>
          </CollapsibleSection>
          <CollapsibleSection title="Desempenho por disciplina" description="Acertos por área de conhecimento." icon={null} storageKey={"central-performance:"+user+":disciplines"}>
          <ul>
            {nodes
              .filter((n) => n.kind === "discipline" && matches(n.id))
              .map((n) => {
                const ids = new Set(
                  nodes
                    .filter((x) =>
                      ancestors(nodes, x.id).some((a) => a.id === n.id),
                    )
                    .map((x) => x.id),
                );
                const r = results.filter((x) => ids.has(x.topic_id));
                const a = answers.filter(
                  (x) =>
                    x.study_questions && ids.has(x.study_questions.topic_id),
                );
                const total = r.reduce((s, x) => s + x.answered, 0) + a.length;
                const ok =
                  r.reduce((s, x) => s + x.correct, 0) +
                  a.filter((x) => x.correct).length;
                return (
                  <li key={n.id}>
                    {n.name} ·{" "}
                    {total
                      ? `${Math.round((ok / total) * 100)}% (${ok}/${total})`
                      : "Sem dados"}
                  </li>
                );
              })}
          </ul>
          </CollapsibleSection>
          <CollapsibleSection title="Mapa de domínio" description="Consulte evidências de aprendizagem." icon={null} storageKey={"central-performance:"+user+":mastery"}>
          <p>
            Usa histórico completo até hoje. Dominado exige pelo menos 20
            questões, 80% de acerto, duas revisões e evidências recentes.
          </p>
          <ul>
            {relevant.map((n) => (
              <li key={n.id}>
                {ancestors(nodes, n.id)
                  .slice(1)
                  .map((x) => x.name)
                  .join(" / ")}{" "}
                · {dominance(evidence(n.id), new Date(tick))}
              </li>
            ))}
          </ul>
          </CollapsibleSection>
          <CollapsibleSection title="Conteúdos prioritários" description="Veja os próximos focos de preparação." icon={null} storageKey={"central-performance:"+user+":priorities"}>
          {priority.length ? (
            <ul>
              {priority.map((b) => (
                <li key={b.id}>
                  {b.name} · {b.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Selecione concursos e gere o planejamento para consultar
              prioridades.
            </p>
          )}
          </CollapsibleSection>
          <CollapsibleSection title="Próximas provas" description="Datas cadastradas e tempo disponível." icon={null} storageKey={"central-performance:"+user+":exams"}>
          <ul>
            {source?.contests
              .filter((c) => !filterContest || c.id === filterContest)
              .map((c) => (
                <li key={c.id}>
                  {c.name} ·{" "}
                  {c.exam
                    ? `${Math.ceil((dateFor(c.exam).getTime() - dateFor(today).getTime()) / 86400000)} dias`
                    : "Data não informada"}
                </li>
              ))}
          </ul>
          </CollapsibleSection>
        </>
      )}
      {view === "incidence" && (
        <>
          <p>
            Registros com período, fonte e amostra. A lista usa a interseção com
            o período selecionado. Frequência histórica não é probabilidade da próxima prova.
          </p>
          <ul>
            {data?.incidence
              .filter(
                (i) =>
                  matches(i.topic_id) &&
                  (!i.period_end || i.period_end >= from) &&
                  (!i.period_start || i.period_start <= to),
              )
              .map((i) => (
                <li key={i.topic_id + i.board}>
                  {name(i.topic_id)} · {incidenceSummary(i) ?? "Sem dados de incidência"}
                  {incidenceSummary(i) && <> · <a href={i.source_url} target="_blank" rel="noreferrer">Fonte da amostra</a></>}
                </li>
              ))}
          </ul>
          {(admin || demo) && (
            <details className="catalog-entry">
              <summary>Cadastrar incidência histórica</summary>
              <form onSubmit={saveIncidence}>
                <label>
                  Banca
                  <input
                    required
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                  />
                </label>
                <div className="catalog-fields">
                  <label>
                    Início do período
                    <input
                      type="date"
                      required
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Fim do período
                    <input
                      type="date"
                      required
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </label>
                  <label>
                    Unidade da amostra
                    <select value={measure} onChange={e => setMeasure(e.target.value as "exams" | "questions")}>
                      <option value="exams">Provas: provas com o assunto / provas analisadas</option>
                      <option value="questions">Questões: questões do assunto / questões analisadas</option>
                    </select>
                  </label>
                  <label>
                    Amostra
                    <input
                      type="number"
                      required
                      min={1}
                      value={sample}
                      onChange={(e) => setSample(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Ocorrências
                    <input
                      type="number"
                      required
                      min={0}
                      max={sample}
                      value={occurrences}
                      onChange={(e) => setOccurrences(Number(e.target.value))}
                    />
                  </label>
                </div>
                <label>
                  Fonte HTTPS
                  <input
                    type="url"
                    required
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Salvar incidência
                </button>
              </form>
            </details>
          )}
        </>
      )}
    </ModulePage>
  );
}
