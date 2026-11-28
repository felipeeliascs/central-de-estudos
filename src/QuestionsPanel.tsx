import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Forms";
import { safeUrl, type Node } from "./domain";
import { questionStore } from "./question-data";
import {
  blankQuestion,
  difficulties,
  importQuestions,
  origins,
  pathFor,
  selectQuestions,
  validateQuestion,
  type Attempt,
  type BankQuestion,
  type ErrorEntry,
  type QuestionDraft,
  type Quota,
} from "./questions";

type View =
  "bank" | "new" | "import" | "practice" | "mock" | "history" | "errors";
type Data = Awaited<ReturnType<ReturnType<typeof questionStore>["load"]>>;
type Batch = ReturnType<typeof importQuestions>;
const labels = {
  bank: "Banco",
  new: "Nova questão",
  import: "Importar JSON",
  practice: "Estudo",
  mock: "Simulados",
  history: "Tentativas",
  errors: "Caderno de erros",
};
const labelFor = (index: number) => String.fromCharCode(65 + index);
const stamp = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
function safeLink(value: string | null | undefined) {
  try {
    return value ? safeUrl(value) : null;
  } catch {
    return null;
  }
}
function QuestionImage({ url }: { url: string | null | undefined }) {
  const src = safeLink(url);
  return src ? (
    <img
      className="flash-image"
      src={src}
      alt="Ilustração da questão"
      referrerPolicy="no-referrer"
    />
  ) : null;
}
function Link({
  url,
  children,
}: {
  url: string | null | undefined;
  children: string;
}) {
  const href = safeLink(url);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : null;
}

export function QuestionsPanel({
  startImport = false,
  nodes,
  user,
  demo,
  close,
  openExternal,
  initialTopic = "",
}: {
  nodes: Node[];
  startImport?: boolean;
  user: string;
  demo: boolean;
  close: () => void;
  openExternal: () => void;
  initialTopic?: string;
}) {
  const [view, setView] = useState<View>(startImport ? "import" : "bank");
  const [data, setData] = useState<Data | null>(null);
  const [current, setCurrent] = useState<Attempt | null>(null);
  const [draft, setDraft] = useState<QuestionDraft>(blankQuestion);
  const [raw, setRaw] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [search, setSearch] = useState("");
  const [contest, setContest] = useState(() => pathFor(nodes,initialTopic).find(n=>n.kind==="contest")?.id ?? "");
  const [discipline, setDiscipline] = useState(() => pathFor(nodes,initialTopic).find(n=>n.kind==="discipline")?.id ?? "");
  const [topic, setTopic] = useState(initialTopic);
  const [board, setBoard] = useState("");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [diagnostic, setDiagnostic] = useState(false);
  const [perDiscipline, setPerDiscipline] = useState(true);
  const [targets, setTargets] = useState<
    Record<string, { count: number; weight: number }>
  >({});
  const [entry, setEntry] = useState<ErrorEntry | null>(null);
  const [externalId, setExternalId] = useState(() => crypto.randomUUID());
  const [deck, setDeck] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false);
  const startRequest = useRef<{ signature: string; id: string } | null>(null);
  const db = useMemo(
    () => questionStore(user, demo, nodes),
    [user, demo, nodes],
  );
  useEffect(() => {
    let active = true;
    void db
      .load()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [db]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(action: () => Promise<void>, message = "") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      if (message) setStatus(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function switchView(v: View) {
    setView(v);
    setCurrent(null);
    setChoice(null);
    setError("");
    setStatus("");
  }
  const lookup = useMemo(
    () => new Map(nodes.map((n) => [n.id, pathFor(nodes, n.id)])),
    [nodes],
  );
  const topicNodes = nodes.filter(
    (n) => n.kind === "topic" || n.kind === "subtopic",
  );
  const topics = new Set(topicNodes.map((n) => n.id));
  const name = (id: string) =>
    nodes.find((n) => n.id === id)?.name ?? "Assunto indisponível";
  const pathName = (id: string) =>
    lookup
      .get(id)
      ?.map((n) => n.name)
      .join(" / ") ?? name(id);
  const fits = (q: BankQuestion) =>
    (!contest || lookup.get(q.topic_id)?.[0]?.id === contest) &&
    (!discipline || lookup.get(q.topic_id)?.[1]?.id === discipline) &&
    (!topic || lookup.get(q.topic_id)?.some((n) => n.id === topic)) &&
    (!board ||
      q.board
        .toLocaleLowerCase("pt-BR")
        .includes(board.trim().toLocaleLowerCase("pt-BR")));
  const pool = (data?.bank ?? []).filter(fits);
  const displayed = pool.filter((q) =>
    q.statement
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const disciplines = nodes.filter(
    (n) => n.kind === "discipline" && (!contest || n.parent_id === contest),
  );
  const groups = disciplines.filter(
    (n) =>
      (!discipline || n.id === discipline) &&
      (!topic || lookup.get(topic)?.[1]?.id === n.id) &&
      (contest ||
        discipline ||
        topic ||
        pool.some((q) => lookup.get(q.topic_id)?.[1]?.id === n.id)),
  );
  const document = data?.catalog.find(
    (c) => c.contest_id === contest,
  )?.document;
  const quotas: Quota[] = perDiscipline
    ? groups.map((n) => {
        const official = !topic
          ? document?.items.find((i) => i.id === n.catalog_key)
          : undefined;
        const values = targets[n.id] ?? {
          count: official?.questions ?? 1,
          weight: official?.weight && official.weight > 0 ? official.weight : 1,
        };
        return {
          id: n.id,
          label: name(n.id),
          pool: pool.filter((q) => lookup.get(q.topic_id)?.[1]?.id === n.id),
          ...values,
        };
      })
    : [
        {
          id: "all",
          label: "Filtro atual",
          pool,
          ...(targets.all ?? { count: 5, weight: 1 }),
        },
      ];
  const seconds = current?.deadline
    ? Math.max(0, Math.ceil((Date.parse(current.deadline) - now) / 1000))
    : null;
  const expired = current && !current.finished_at && seconds === 0;
  const item = current?.items[current.cursor];
  function begin(kind: Attempt["kind"], question?: BankQuestion) {
    void run(async () => {
      if (
        kind !== "study" &&
        (!Number.isInteger(minutes) || minutes < 1 || minutes > 480)
      )
        throw new Error("Informe duração de 1 a 480 minutos.");
      const selection = question
        ? [{ id: question.id, weight: 1 }]
        : selectQuestions(quotas);
      const label = question
        ? "Estudo individual"
        : title.trim() ||
          (kind === "diagnostic" ? "Simulado diagnóstico" : "Simulado interno");
      const signature = JSON.stringify([kind, label, minutes, selection]);
      if (startRequest.current?.signature !== signature)
        startRequest.current = { signature, id: crypto.randomUUID() };
      setChoice(null);
      setCurrent(
        await db.begin(
          startRequest.current.id,
          label,
          kind,
          minutes,
          selection,
        ),
      );
      startRequest.current = null;
      setView(kind === "study" ? "practice" : "mock");
    });
  }
  function step(patch: Parameters<typeof db.step>[1]) {
    if (!current) return;
    void run(async () => {
      const next = await db.step(current.id, patch);
      setCurrent(next);
      if (next.finished_at) {
        setData(await db.load());
        setStatus("Correção disponível.");
      }
    });
  }
  function saveQuestion() {
    void run(async () => {
      const item = validateQuestion(draft, topics);
      if (item.source === "licensed" && !authorized)
        throw new Error("Confirme a autorização da fonte.");
      const count = await db.add([item], false);
      if (!count) throw new Error("Já existe uma questão com esse enunciado.");
      setData(await db.load());
      setDraft(blankQuestion);
      setAuthorized(false);
      setView("bank");
    }, "Questão cadastrada.");
  }
  function commitImport() {
    if (!batch) return;
    void run(async () => {
      const items = batch.filter((x) => !x.duplicate).map((x) => x.question);
      if (!items.length) throw new Error("O lote contém somente duplicatas.");
      if (!authorized)
        throw new Error("Confirme a origem e a autorização do conteúdo.");
      const count = await db.add(items, true);
      setData(await db.load());
      setBatch(null);
      setRaw("");
      setAuthorized(false);
      setView("bank");
      setStatus(`${count} questões cadastradas.`);
    });
  }
  function saveError() {
    if (!entry) return;
    void run(async () => {
      if (!entry.reason.trim()) throw new Error("Informe o motivo do erro.");
      await db.editError(entry.id, {
        reason: entry.reason.trim(),
        notes: entry.notes,
        resolved: entry.resolved,
        external_url: entry.external_url ? safeUrl(entry.external_url) : null,
        image_url: entry.image_url ? safeUrl(entry.image_url) : null,
      });
      setData(await db.load());
    }, "Anotações atualizadas.");
  }
  const filters = (
    <div className="catalog-fields">
      <label>
        Concurso
        <select
          value={contest}
          onChange={(e) => {
            setContest(e.target.value);
            setDiscipline("");
            setTopic("");
            setTargets({});
          }}
        >
          <option value="">Todos</option>
          {nodes
            .filter((n) => n.kind === "contest")
            .map((n) => (
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
            setTargets({});
          }}
        >
          <option value="">Todas</option>
          {disciplines.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assunto
        <select
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setTargets({});
          }}
        >
          <option value="">Todos</option>
          {topicNodes
            .filter(
              (n) =>
                (!contest || lookup.get(n.id)?.[0]?.id === contest) &&
                (!discipline || lookup.get(n.id)?.[1]?.id === discipline),
            )
            .map((n) => (
              <option key={n.id} value={n.id}>
                {pathName(n.id)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Banca
        <input value={board} onChange={(e) => setBoard(e.target.value)} />
      </label>
    </div>
  );
  return (
    <Modal
      title="Questões, simulados e caderno de erros"
      close={close}
      busy={busy}
    >
      <nav className="catalog-actions" aria-label="Módulo de questões">
        {Object.entries(labels).map(([id, label]) => (
          <button
            key={id}
            disabled={busy}
            className={id === view ? "primary" : "secondary"}
            onClick={() => switchView(id as View)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!data && !error && <p>Carregando banco e tentativas…</p>}
      {data && !current && (view === "bank" || view === "practice") && (
        <>
          {filters}
          <label>
            Buscar enunciado
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {!displayed.length && <p>Nenhuma questão para estes filtros.</p>}
          <ul>
            {displayed.map((q) => (
              <li key={q.id} className="catalog-entry">
                <strong>{q.statement}</strong>
                <p>
                  {pathName(q.topic_id)} · {origins[q.source]} ·{" "}
                  {difficulties[q.difficulty]}
                  {q.board && ` · ${q.board}`}
                  {q.year && ` · ${q.year}`}
                  {q.source_name && ` · ${q.source_name}`} ·{" "}
                  {q.reviewed
                    ? "Questão revisada"
                    : "Revisão editorial pendente"}
                </p>
                <Link url={q.source_url}>Fonte original</Link>
                <button
                  className="secondary"
                  disabled={busy || !q.playable}
                  onClick={() => begin("study", q)}
                >
                  Responder em modo estudo
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {view === "new" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveQuestion();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Assunto e disciplina
              <select
                required
                value={draft.topic_id}
                onChange={(e) =>
                  setDraft({ ...draft, topic_id: e.target.value })
                }
              >
                <option value="">Selecione</option>
                {topicNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {pathName(n.id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Enunciado
              <textarea
                required
                value={draft.statement}
                onChange={(e) =>
                  setDraft({ ...draft, statement: e.target.value })
                }
              />
            </label>
            <label>
              Alternativas, uma por linha
              <textarea
                required
                value={draft.options.join("\n")}
                onChange={(e) =>
                  setDraft({ ...draft, options: e.target.value.split("\n") })
                }
              />
            </label>
            <label>
              Gabarito
              <select
                value={draft.answer}
                onChange={(e) =>
                  setDraft({ ...draft, answer: Number(e.target.value) })
                }
              >
                {draft.options.map((option, i) => (
                  <option key={i} value={i}>
                    {labelFor(i)} · {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Explicação
              <textarea
                required
                value={draft.explanation}
                onChange={(e) =>
                  setDraft({ ...draft, explanation: e.target.value })
                }
              />
            </label>
            <div className="catalog-fields">
              <label>
                Banca
                <input
                  value={draft.board}
                  onChange={(e) =>
                    setDraft({ ...draft, board: e.target.value })
                  }
                />
              </label>
              <label>
                Ano
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={draft.year ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      year: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label>
                Dificuldade
                <select
                  value={draft.difficulty}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      difficulty: e.target.value as QuestionDraft["difficulty"],
                    })
                  }
                >
                  {Object.entries(difficulties).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Classificação
                <select
                  value={draft.source}
                  onChange={(e) => {
                    setAuthorized(false);
                    setDraft({
                      ...draft,
                      source: e.target.value as QuestionDraft["source"],
                    });
                  }}
                >
                  {Object.entries(origins).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fonte
                <input
                  value={draft.source_name}
                  onChange={(e) =>
                    setDraft({ ...draft, source_name: e.target.value })
                  }
                />
              </label>
              <label>
                Link original
                <input
                  type="url"
                  value={draft.source_url ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, source_url: e.target.value || null })
                  }
                />
              </label>
              <label>
                Imagem por URL HTTPS
                <input
                  type="url"
                  value={draft.image_url ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, image_url: e.target.value || null })
                  }
                />
              </label>
            </div>
            {draft.source === "licensed" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                Tenho autorização para cadastrar esta questão.
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.reviewed}
                onChange={(e) =>
                  setDraft({ ...draft, reviewed: e.target.checked })
                }
              />
              Conferi o enunciado e o gabarito
            </label>
            <button className="primary">Salvar questão</button>
          </fieldset>
        </form>
      )}
      {view === "import" && data && (
        <>
          <label>
            Arquivo JSON
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setBatch(null);
                if (!file) return;
                if (file.size > 256 * 1024) {
                  setError("Limite de 256 KiB.");
                  return;
                }
                void file
                  .text()
                  .then(setRaw)
                  .catch(() => setError("Falha ao ler o arquivo."));
              }}
            />
          </label>
          <label>
            Ou cole o JSON
            <textarea
              rows={10}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setBatch(null);
              }}
            />
          </label>
          <details>
            <summary>Identificadores dos assuntos</summary>
            <ul>
              {topicNodes.map((n) => (
                <li key={n.id}>
                  {pathName(n.id)} · <code>{n.id}</code>
                </li>
              ))}
            </ul>
          </details>
          <button
            className="secondary"
            onClick={() => {
              setError("");
              setBatch(null);
              try {
                setBatch(importQuestions(raw, topics, data.bank));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Gerar prévia
          </button>
          {batch && (
            <>
              <ul>
                {batch.map((row, i) => (
                  <li key={i}>
                    {row.duplicate ? "Duplicata ignorada" : "Nova"} ·{" "}
                    {row.question.statement} · {pathName(row.question.topic_id)}{" "}
                    · {origins[row.question.source]}
                  </li>
                ))}
              </ul>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                Conferi a origem e tenho permissão de uso dos itens autorizados.
              </label>
              <button
                className="primary"
                disabled={
                  busy || !authorized || batch.every((r) => r.duplicate)
                }
                onClick={commitImport}
              >
                Confirmar importação
              </button>
            </>
          )}
        </>
      )}
      {view === "mock" && data && !current && (
        <>
          {filters}
          <div className="catalog-fields">
            <label>
              Título
              <input
                maxLength={180}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Tempo em minutos
              <input
                type="number"
                min={1}
                max={480}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={diagnostic}
              onChange={(e) => setDiagnostic(e.target.checked)}
            />
            Simulado diagnóstico
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={perDiscipline}
              onChange={(e) => setPerDiscipline(e.target.checked)}
            />
            Distribuir por disciplina
          </label>
          <p>
            Confira as quantidades e pesos. Quando disponíveis, os valores
            iniciais vêm do edital.
          </p>
          {quotas.map((q) => (
            <div className="catalog-entry" key={q.id}>
              <strong>{q.label}</strong>
              <p>
                {q.pool.filter((x) => x.playable).length} questões disponíveis
              </p>
              <div className="catalog-fields">
                <label>
                  Quantidade para {q.label}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={q.count}
                    onChange={(e) =>
                      setTargets({
                        ...targets,
                        [q.id]: {
                          count: Number(e.target.value),
                          weight: q.weight,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Peso por questão de {q.label}
                  <input
                    type="number"
                    min="0.0001"
                    max={10000}
                    step="any"
                    value={q.weight}
                    onChange={(e) =>
                      setTargets({
                        ...targets,
                        [q.id]: {
                          count: q.count,
                          weight: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <div className="catalog-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => begin(diagnostic ? "diagnostic" : "mock")}
            >
              Iniciar simulado
            </button>
            <button className="secondary" onClick={openExternal}>
              Registrar simulado externo
            </button>
          </div>
        </>
      )}
      {view === "history" && data && !current && (
        <>
          {!data.attempts.length && <p>Nenhuma tentativa registrada.</p>}
          <ul>
            {data.attempts.map((a) => (
              <li key={a.id}>
                {a.title} · {stamp(a.started_at)} ·{" "}
                {a.finished_at ? `Nota ${a.score}%` : "Em andamento"}{" "}
                <button
                  className="secondary"
                  onClick={() => {
                    setChoice(null);
                    setCurrent(a);
                  }}
                >
                  {a.finished_at ? "Ver correção" : "Retomar tentativa"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {current && item && !current.finished_at && (
        <article className="catalog-entry">
          <h3>{current.title}</h3>
          {seconds !== null && (
            <p>
              {expired
                ? "Tempo esgotado. Encerre para ver a correção."
                : `Tempo restante: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
            </p>
          )}
          <p>
            Questão {current.cursor + 1} de {current.items.length} ·{" "}
            {Object.keys(current.picks).length} respondidas
          </p>
          <p>{item.statement}</p>
          <QuestionImage url={item.image_url} />
          <fieldset disabled={busy || !!expired}>
            <legend>Alternativas</legend>
            {item.options.map((option, i) => (
              <label key={i} className="check-label">
                <input
                  type="radio"
                  name="question-option"
                  checked={
                    (current.kind === "study"
                      ? choice
                      : current.picks[item.id]) === i
                  }
                  onChange={() =>
                    current.kind === "study"
                      ? setChoice(i)
                      : step({ item: item.id, choice: i })
                  }
                />
                {labelFor(i)}. {option}
              </label>
            ))}
          </fieldset>
          {current.kind === "study" ? (
            <button
              className="primary"
              disabled={busy || choice === null}
              onClick={() => step({ item: item.id, choice: choice! })}
            >
              Corrigir resposta
            </button>
          ) : (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  disabled={busy || !!expired}
                  checked={!!current.flags[item.id]}
                  onChange={(e) =>
                    step({ item: item.id, marked: e.target.checked })
                  }
                />
                Marcar para revisar
              </label>
              <nav
                className="catalog-actions"
                aria-label="Navegação do simulado"
              >
                {current.items.map((q, i) => (
                  <button
                    className={i === current.cursor ? "primary" : "secondary"}
                    key={q.id}
                    disabled={busy || !!expired}
                    aria-label={`Questão ${i + 1}${current.flags[q.id] ? ", marcada para revisar" : ""}`}
                    onClick={() => step({ cursor: i })}
                  >
                    {i + 1}
                    {current.flags[q.id] ? " •" : ""}
                  </button>
                ))}
              </nav>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (
                    expired ||
                    window.confirm(
                      "Finalizar a tentativa e mostrar a correção?",
                    )
                  )
                    step({ finish: true });
                }}
              >
                Finalizar tentativa
              </button>
            </>
          )}
        </article>
      )}
      {current?.finished_at && (
        <article className="catalog-entry">
          <h3>
            {current.title} · {current.score}%
          </h3>
          {current.kind === "diagnostic" && (
            <p>
              Use a distribuição de acertos por disciplina para orientar a
              revisão.
            </p>
          )}
          <ul>
            {[...new Set(current.items.map((q) => q.discipline_id))].map(
              (id) => {
                const rows =
                  current.correction?.filter(
                    (r) => r.item.discipline_id === id,
                  ) ?? [];
                return (
                  <li key={id}>
                    {name(id)} · {rows.filter((r) => r.correct).length}/
                    {rows.length} acertos ·{" "}
                    {rows.filter((r) => r.selected === null).length} em branco
                  </li>
                );
              },
            )}
          </ul>
          {current.correction?.map((r) => (
            <section className="catalog-entry" key={r.id}>
              <strong>
                {r.correct
                  ? "Acerto"
                  : r.selected === null
                    ? "Em branco"
                    : "Erro"}{" "}
                · {r.item.statement}
              </strong>
              <QuestionImage url={r.item.image_url} />
              <p>
                Sua resposta:{" "}
                {r.selected === null ? "Em branco" : r.item.options[r.selected]}
              </p>
              <p>Gabarito: {r.item.options[r.answer]}</p>
              <p>{r.explanation}</p>
              <Link url={r.source_url}>Fonte original</Link>
            </section>
          ))}
          <button
            className="secondary"
            onClick={() => {
              setCurrent(null);
              setChoice(null);
            }}
          >
            Voltar
          </button>
        </article>
      )}
      {view === "errors" && data && (
        <>
          <details className="catalog-entry">
            <summary>Registrar erro de questão externa</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                const form = e.currentTarget;
                void run(async () => {
                  const value = (key: string) =>
                    String(fields.get(key) ?? "").trim();
                  if (
                    !topics.has(value("topic")) ||
                    !value("statement") ||
                    !value("answer") ||
                    !value("reason")
                  )
                    throw new Error(
                      "Informe assunto, referência, resposta e motivo.",
                    );
                  await db.addExternalError({
                    id: externalId,
                    topic_id: value("topic"),
                    answer_id: null,
                    answer: null,
                    reason: value("reason"),
                    notes: value("notes"),
                    resolved: false,
                    external_url: safeUrl(value("url")),
                    image_url: value("image") ? safeUrl(value("image")) : null,
                    external_statement: value("statement"),
                    external_answer: value("answer"),
                  });
                  setData(await db.load());
                  setExternalId(crypto.randomUUID());
                  form.reset();
                }, "Erro externo registrado.");
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  Assunto do erro externo
                  <select required name="topic">
                    <option value="">Selecione</option>
                    {topicNodes.map((n) => (
                      <option value={n.id} key={n.id}>
                        {pathName(n.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Referência ou resumo próprio
                  <input name="statement" required maxLength={1000} />
                </label>
                <label>
                  Link da questão
                  <input type="url" name="url" required />
                </label>
                <label>
                  Resposta correta em suas palavras
                  <textarea name="answer" required maxLength={3000} />
                </label>
                <label>
                  Motivo
                  <input name="reason" required maxLength={200} />
                </label>
                <label>
                  Anotações
                  <textarea name="notes" maxLength={4000} />
                </label>
                <label>
                  Imagem opcional por URL HTTPS
                  <input name="image" type="url" />
                </label>
                <button className="primary">Salvar erro externo</button>
              </fieldset>
            </form>
          </details>
          {!data.errors.length && (
            <p>Nenhum erro registrado nas suas tentativas.</p>
          )}
          {data.errors.map((e) => (
            <article key={e.id} className="catalog-entry">
              <strong>
                {e.answer?.question_snapshot.statement ??
                  e.external_statement ??
                  "Questão indisponível"}
              </strong>
              <p>
                {e.resolved ? "Revisada" : "A revisar"} · {name(e.topic_id)} ·{" "}
                {e.reason}
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setEntry(e);
                  setDeck("");
                }}
              >
                Abrir erro
              </button>
            </article>
          ))}
          {entry && (
            <article className="catalog-entry">
              <h3>
                {entry.answer?.question_snapshot.statement ??
                  entry.external_statement}
              </h3>
              <QuestionImage
                url={
                  entry.image_url ?? entry.answer?.question_snapshot.image_url
                }
              />
              <p>
                Gabarito:{" "}
                {entry.answer?.question_snapshot.options?.[
                  entry.answer.question_snapshot.answer ?? -1
                ] ??
                  entry.external_answer ??
                  "Não disponível nesta tentativa"}
              </p>
              <p>{entry.answer?.question_snapshot.explanation}</p>
              <Link
                url={
                  entry.external_url ??
                  entry.answer?.question_snapshot.source_url
                }
              >
                Abrir referência
              </Link>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveError();
                }}
              >
                <label>
                  Motivo do erro
                  <input
                    required
                    value={entry.reason}
                    onChange={(e) =>
                      setEntry({ ...entry, reason: e.target.value })
                    }
                  />
                </label>
                <label>
                  Anotações
                  <textarea
                    value={entry.notes}
                    onChange={(e) =>
                      setEntry({ ...entry, notes: e.target.value })
                    }
                  />
                </label>
                <label>
                  Link externo
                  <input
                    type="url"
                    value={entry.external_url ?? ""}
                    onChange={(e) =>
                      setEntry({
                        ...entry,
                        external_url: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label>
                  Imagem opcional por URL HTTPS
                  <input
                    type="url"
                    value={entry.image_url ?? ""}
                    onChange={(e) =>
                      setEntry({ ...entry, image_url: e.target.value || null })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={entry.resolved}
                    onChange={(e) =>
                      setEntry({ ...entry, resolved: e.target.checked })
                    }
                  />
                  Questão revisada
                </label>
                <p>
                  Revisar a questão não altera o domínio do assunto. O mapa usa
                  acertos, amostra e recência.
                </p>
                <button className="primary" disabled={busy}>
                  Salvar anotações
                </button>
              </form>
              <h4>Histórico desta questão</h4>
              <ul>
                {data.attempts.flatMap((a) =>
                  (a.correction ?? [])
                    .filter((r) => r.id === entry.answer?.question_id)
                    .map((r) => (
                      <li key={a.id}>
                        {stamp(a.finished_at!)} · {a.title} ·{" "}
                        {r.correct
                          ? "Acerto"
                          : r.selected === null
                            ? "Em branco"
                            : "Erro"}
                      </li>
                    )),
                )}
              </ul>
              <label>
                Baralho privado para o flashcard
                <select value={deck} onChange={(e) => setDeck(e.target.value)}>
                  <option value="">Selecione</option>
                  {data.decks
                    .filter(
                      (d) =>
                        d.visibility === "private" &&
                        d.topic_id === entry.topic_id,
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="secondary"
                disabled={
                  !deck || (!entry.answer && !entry.external_statement) || busy
                }
                onClick={() =>
                  void run(
                    () => db.convert(entry, deck),
                    "Flashcard vinculado à questão.",
                  )
                }
              >
                Transformar em flashcard
              </button>
            </article>
          )}
        </>
      )}
    </Modal>
  );
}
