import { useEffect, useState } from "react";
import { ModulePage } from "./ModulePage";
import type { Snapshot } from "./domain";
import {
  activityLabel,
  addDays,
  capacity,
  daysBetween,
  finalStretch,
  generatePlan,
  todayInBrazil,
  type Block,
  type PlannerInputs,
  type Settings,
} from "./planner";
import {
  plannerInputs,
  readPlan,
  writePlan,
  type SavedPlan,
} from "./planner-data";

const weekdays = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
const viewNames = {
  day: "Plano diário",
  week: "Plano semanal",
  calendar: "Calendário",
  cycle: "Ciclo de estudos",
  history: "Histórico",
};
type View = keyof typeof viewNames;

export function PlannerPanel({
  snapshot,
  user,
  demo,
  close,
  openReviews,
  study,
}: {
  snapshot: Snapshot;
  user: string;
  demo: boolean;
  close: () => void;
  openReviews?: () => void;
  study?: (id: string) => void;
}) {
  const [today, setToday] = useState(todayInBrazil);
  const [day, setDay] = useState(today);
  const [saved, setSaved] = useState<SavedPlan | null>(null);
  const [inputs, setInputs] = useState<PlannerInputs | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [view, setView] = useState<View>("day");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayInBrazil()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      const [current, source] = await Promise.all([
        readPlan(user, demo),
        plannerInputs(snapshot, user, demo),
      ]);
      if (!active) return;
      setInputs(source);
      setSaved(current);
      setDraft(current.state.settings);
      setDay(today);
      const plan = generatePlan(
        source,
        current.state.settings,
        today,
        current.state.blocks,
      );
      if (
        current.state.plannedOn !== today ||
        JSON.stringify(plan.blocks) !== JSON.stringify(current.state.blocks)
      ) {
        const next = await writePlan(user, demo, current, {
          settings: current.state.settings,
          blocks: plan.blocks,
          plannedOn: today,
        });
        if (active) setSaved(next);
      }
    }
    setBusy(true);
    setError("");
    void load()
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot, user, demo, today]);

  async function save(settings: Settings, blocks?: Block[]) {
    if (!saved || !inputs || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const source = blocks
        ? inputs
        : await plannerInputs(snapshot, user, demo);
      const nextBlocks =
        blocks ??
        generatePlan(source, settings, today, saved.state.blocks).blocks;
      const next = await writePlan(user, demo, saved, {
        settings,
        blocks: nextBlocks,
        plannedOn: today,
      });
      setInputs(source);
      setSaved(next);
      setDraft(settings);
      setStatus(
        blocks
          ? "Atividade registrada no histórico."
          : "Planejamento atualizado.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const allBlocks = saved?.state.blocks ?? [];
  const blocks = allBlocks.filter((b) => !b.waiting);
  const settings = saved?.state.settings;
  const projection =
    inputs && settings
      ? generatePlan(inputs, settings, today, allBlocks)
      : null;
  const weekStart = day
    ? addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
    : today;
  const selectedDay = day || today;
  const visibleBlocks = blocks.filter((b) =>
    view === "history"
      ? b.completed
      : view === "week"
        ? b.day >= weekStart && b.day < addDays(weekStart, 7)
        : b.day === selectedDay,
  );
  function complete(block: Block) {
    if (settings)
      void save(
        settings,
        allBlocks.map((b) =>
          b.id === block.id ? { ...b, completed: true } : b,
        ),
      );
  }
  function renderBlock(b: Block) {
    return (
      <li key={b.id} className="catalog-entry">
        <strong>
          {activityLabel[b.kind]} · {b.name}
        </strong>
        <p>
          {b.minutes} min · {dateLabel(b.day)}
          {b.completed ? " · Concluída" : ""}
        </p>
        <small>{b.reason}</small>
        {study && b.topicIds.map(id => <button key={id} className="text-button" onClick={() => study(id)}>Estudar {snapshot.nodes.find(n=>n.id===id)?.name || "conteúdo"} e materiais</button>)}
        {b.kind === "review" && !b.completed && openReviews && (
          <div>
            <button className="secondary" onClick={openReviews}>
              Abrir fila de flashcards
            </button>
          </div>
        )}
        {!b.completed && b.day <= today && (
          <div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => complete(b)}
            >
              Marcar como concluída
            </button>
          </div>
        )}
      </li>
    );
  }
  const currentOverride = draft?.overrides[topic] ?? {
    priority: 0,
    difficulty: 0,
  };
  function override(field: "priority" | "difficulty", value: number) {
    if (draft && topic)
      setDraft({
        ...draft,
        overrides: {
          ...draft.overrides,
          [topic]: { ...currentOverride, [field]: value },
        },
      });
  }
  return (
    <ModulePage title="Plano de Estudos" close={close} busy={busy}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {busy && <p role="status">Atualizando o planejamento…</p>}
      {inputs && draft && settings && (
        <>
          {!inputs.contests.length && (
            <p>
              Selecione pelo menos um concurso em Meus concursos para gerar a
              sua trilha.
            </p>
          )}
          <ul>
            {inputs.contests.map((c) => {
              const left = c.exam ? daysBetween(today, c.exam) : null;
              return (
                <li key={c.id}>
                  <strong>{c.name}</strong> ·{" "}
                  {left === null
                    ? "Prova sem data"
                    : left < 0
                      ? "Prova realizada"
                      : left === 0
                        ? "Prova hoje"
                        : `${left} dias até a prova`}
                  {finalStretch(c, today, settings) ? " · Reta final" : ""}
                </li>
              );
            })}
          </ul>
          {projection?.warnings.map((w) => (
            <p className="error" key={w}>
              {w}
            </p>
          ))}
          {allBlocks.some((b) => b.waiting) && (
            <details className="catalog-entry">
              <summary>Atividades atrasadas aguardando vaga</summary>
              <ul>
                {allBlocks
                  .filter((b) => b.waiting)
                  .map((b) => (
                    <li key={b.id}>
                      {activityLabel[b.kind]} · {b.name} · {b.minutes} min desde{" "}
                      {dateLabel(b.day)}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <details className="catalog-entry">
            <summary>Configurar meta, disponibilidade e prioridades</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(draft);
              }}
            >
              <fieldset disabled={busy}>
                <div className="catalog-fields">
                  <label>
                    Meta inicial em minutos
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={goal}
                      onChange={(e) =>
                        setGoal(e.currentTarget.valueAsNumber || 0)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        minutes: Array<number>(7).fill(
                          Math.max(0, Math.min(1440, Math.round(goal))),
                        ),
                      })
                    }
                  >
                    Aplicar meta a todos os dias
                  </button>
                </div>
                <div className="catalog-fields">
                  {weekdays.map((label, i) => (
                    <label key={label}>
                      {label} (min)
                      <input
                        type="number"
                        min={0}
                        max={1440}
                        required
                        value={draft.minutes[i]}
                        onChange={(e) => {
                          const value = e.currentTarget.valueAsNumber || 0;
                          setDraft({
                            ...draft,
                            minutes: draft.minutes.map((n, index) =>
                              index === i ? value : n,
                            ),
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Dias de antecedência da reta final
                  <input
                    type="number"
                    min={0}
                    max={365}
                    required
                    value={draft.finalDays}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        finalDays: e.currentTarget.valueAsNumber || 0,
                      })
                    }
                  />
                </label>
                <label>
                  Assunto para ajuste manual
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.currentTarget.value)}
                  >
                    <option value="">Selecione um assunto</option>
                    {inputs.topics.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.disciplineName} / {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {topic && (
                  <div className="catalog-fields">
                    <label>
                      Prioridade manual
                      <select
                        value={currentOverride.priority}
                        onChange={(e) =>
                          override("priority", Number(e.currentTarget.value))
                        }
                      >
                        <option value={0}>Automática</option>
                        <option value={1}>Reforçar</option>
                        <option value={2}>Alta</option>
                        <option value={3}>Máxima</option>
                      </select>
                    </label>
                    <label>
                      Dificuldade individual
                      <select
                        value={currentOverride.difficulty}
                        onChange={(e) =>
                          override("difficulty", Number(e.currentTarget.value))
                        }
                      >
                        <option value={0}>Não informada</option>
                        <option value={1}>Baixa</option>
                        <option value={2}>Média</option>
                        <option value={3}>Alta</option>
                      </select>
                    </label>
                  </div>
                )}
                <button className="primary">Salvar e gerar plano</button>
              </fieldset>
            </form>
          </details>
          <div className="catalog-actions">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => { if (window.confirm("Recalcular as atividades pendentes com os dados e a disponibilidade atuais? Tarefas concluídas, histórico, sessões e desempenho serão preservados.")) void save(settings); }}
            >
              Recalcular plano de estudos
            </button>
          </div>
          <nav className="segmented plan-views" aria-label="Visões do planejamento">
            {(Object.keys(viewNames) as View[]).map((v) => (
              <button
                key={v}
                className={v === view ? "primary" : "secondary"}
                aria-pressed={v === view}
                onClick={() => setView(v)}
              >
                {viewNames[v]}
              </button>
            ))}
          </nav>
          {(view === "day" || view === "week") && (
            <label>
              Data do plano
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.currentTarget.value)}
              />
            </label>
          )}
          {view === "day" && (
            <p>
              {visibleBlocks.reduce((sum, b) => sum + b.minutes, 0)} de{" "}
              {capacity(settings, selectedDay)} min disponíveis
            </p>
          )}
          {view === "week" && (
            <ul>
              {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(
                (d) => (
                  <li key={d}>
                    {dateLabel(d)} ·{" "}
                    {blocks
                      .filter((b) => b.day === d)
                      .reduce((sum, b) => sum + b.minutes, 0)}{" "}
                    / {capacity(settings, d)} min
                  </li>
                ),
              )}
            </ul>
          )}
          {view === "calendar" && (
            <div className="planner-calendar">
              {Array.from({ length: 28 }, (_, i) => addDays(today, i)).map(
                (d) => (
                  <button
                    key={d}
                    className="secondary"
                    onClick={() => {
                      setDay(d);
                      setView("day");
                    }}
                  >
                    {dateLabel(d)} ·{" "}
                    {blocks
                      .filter((b) => b.day === d)
                      .reduce((sum, b) => sum + b.minutes, 0)}{" "}
                    min
                  </button>
                ),
              )}
            </div>
          )}
          {view === "cycle" && (
            <>
              <p>Tempo planejado por disciplina nos próximos 28 dias.</p>
              <ul>
                {projection?.cycle
                  .filter((d) => d.minutes > 0)
                  .map((d) => (
                    <li key={d.name}>
                      {d.name} · {d.minutes} min
                    </li>
                  ))}
              </ul>
              <p>Sequência do ciclo</p>
              <ol>
                {blocks
                  .filter((b) => !b.completed && b.day >= today)
                  .map((b) => (
                    <li key={b.id}>
                      {dateLabel(b.day)} · {activityLabel[b.kind]} · {b.name} ·{" "}
                      {b.minutes} min
                    </li>
                  ))}
              </ol>
            </>
          )}
          {(view === "day" || view === "week" || view === "history") &&
            (visibleBlocks.length ? (
              <ul className="planner-blocks">
                {visibleBlocks.map(renderBlock)}
              </ul>
            ) : (
              <p>Nenhuma atividade nesta visão.</p>
            ))}
        </>
      )}
    </ModulePage>
  );
}
