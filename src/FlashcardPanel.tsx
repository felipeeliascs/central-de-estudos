import { useEffect, useRef, useState } from "react";
import type { Grade } from "ts-fsrs";
import { Modal } from "./Forms";
import { isUuid, safeUrl, type Node } from "./domain";
import { flashStore, type FlashData } from "./flashcard-data";
import {
  emptyContent,
  exportDeck,
  intervalLabel,
  parseDeck,
  previewReview,
  ratings,
  reviewQueue,
  validateCard,
  type CardContent,
  type Deck,
  type Flashcard,
  type Goals,
} from "./flashcards";

function pathFor(nodes: Node[], id: string) {
  const path: Node[] = [];
  let node = nodes.find((n) => n.id === id);
  while (node) {
    path.unshift(node);
    const parent = node.parent_id;
    node = nodes.find((n) => n.id === parent);
  }
  return path;
}
function Image({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null;
  let src: string;
  try {
    src = safeUrl(url);
  } catch {
    return null;
  }
  return (
    <img
      className="flash-image"
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
    />
  );
}
type Mode = "library" | "deck" | "card" | "import" | "review";

export function FlashcardPanel({
  startImport = false,
  nodes,
  user,
  demo,
  close,
}: {
  nodes: Node[];
  startImport?: boolean;
  user: string;
  demo: boolean;
  close: () => void;
}) {
  const [data, setData] = useState<FlashData | null>(null);
  const [mode, setMode] = useState<Mode>(startImport ? "import" : "library");
  const [active, setActive] = useState("");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [card, setCard] = useState<Flashcard | null>(null);
  const [recipients, setRecipients] = useState("");
  const [search, setSearch] = useState("");
  const [author, setAuthor] = useState("");
  const [catalog, setCatalog] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [subject, setSubject] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [raw, setRaw] = useState("");
  const [importId, setImportId] = useState("");
  const [destination, setDestination] = useState("");
  const [incoming, setIncoming] = useState<ReturnType<typeof parseDeck> | null>(
    null,
  );
  const [errorRef, setErrorRef] = useState("");
  const [goals, setGoals] = useState<Goals | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [review, setReview] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(() =>
    Boolean(flashStore(user, demo).pending()),
  );
  const db = flashStore(user, demo);
  useEffect(() => {
    let alive = true;
    void flashStore(user, demo)
      .load()
      .then((d) => {
        if (alive) {
          setData(d);
          setGoals(d.goals);
        }
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      });
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, demo]);
  async function run(
    action: () => Promise<void>,
    status: string,
    after?: () => void,
  ) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setData(await db.load());
      setNow(new Date());
      setMessage(status);
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(Boolean(db.pending()));
      locked.current = false;
      setBusy(false);
    }
  }
  const current = data?.decks.find((d) => d.id === active);
  const deckCards = data?.cards.filter((c) => c.deck_id === active) ?? [];
  const activeDecks = new Set(
    data?.decks.filter((d) => !d.archived).map((d) => d.id),
  );
  const activeCards =
    data?.cards.filter((c) => activeDecks.has(c.deck_id)) ?? [];
  const counts = data
    ? reviewQueue(activeCards, data.states, data.logs, data.goals, now)
    : null;
  const queue = data
    ? reviewQueue(
        active ? activeCards.filter((c) => c.deck_id === active) : activeCards,
        data.states,
        data.logs,
        data.goals,
        now,
      ).eligible
    : [];
  const prompt =
    mode === "review" ? (queue.find((c) => c.id === review) ?? queue[0]) : null;
  const preview =
    prompt && revealed && data
      ? previewReview(data.states[prompt.id], now)
      : null;
  const subjects = nodes.filter((n) => ["topic", "subtopic"].includes(n.kind));
  const subjectOptions = subjects.map((n) => (
    <option key={n.id} value={n.id}>
      {pathFor(nodes, n.id)
        .map((p) => p.name)
        .join(" / ")}
    </option>
  ));
  const shown =
    data?.decks.filter((d) => {
      const path = pathFor(nodes, d.topic_id);
      const term = search.trim().toLocaleLowerCase();
      const match = [
        d.title,
        d.author,
        ...path.map((p) => p.name),
        ...data.cards
          .filter((c) => c.deck_id === d.id)
          .flatMap((c) => [c.front, c.back]),
      ].some((text) => text.toLocaleLowerCase().includes(term));
      return (
        (showArchived || !d.archived) &&
        match &&
        (!author ||
          d.author
            .toLocaleLowerCase()
            .includes(author.trim().toLocaleLowerCase())) &&
        (!catalog || path.some((n) => n.id === catalog)) &&
        (!discipline || path.some((n) => n.id === discipline)) &&
        (!subject || path.some((n) => n.id === subject))
      );
    }) ?? [];
  function editDeck(existing?: Deck) {
    const value = existing ?? {
      id: crypto.randomUUID(),
      owner_id: user,
      topic_id: subjects[0]?.id ?? "",
      title: "",
      author: "",
      archived: false,
      visibility: "private" as const,
      shared_with: [],
    };
    setDeck(value);
    setRecipients(value.shared_with.join(", "));
    setMode("deck");
  }
  function editCard(existing?: Flashcard) {
    setCard(
      existing ?? {
        ...emptyContent,
        id: crypto.randomUUID(),
        deck_id: active,
        archived: false,
      },
    );
    setMode("card");
  }
  function begin(deckId: string) {
    setActive(deckId);
    setReview("");
    setRevealed(false);
    setChoice(null);
    setMode("review");
  }
  function resetReview() {
    setReview("");
    setRevealed(false);
    setChoice(null);
  }
  function rate(grade: Grade) {
    if (!prompt || !revealed || !data || pending) return;
    void run(
      async () => {
        const event = db.prepare(
          prompt.id,
          data.states[prompt.id],
          grade,
          new Date(),
        );
        await db.submit(event);
      },
      "Avaliação registrada.",
      resetReview,
    );
  }
  function saveDeck() {
    if (!deck) return;
    void run(
      async () => {
        const shared =
          deck.visibility === "shared"
            ? [...new Set(recipients.split(/[\s,;]+/).filter(Boolean))]
            : [];
        if (!deck.title.trim() || !deck.topic_id)
          throw new Error("Informe o título e o assunto.");
        if (
          deck.visibility === "shared" &&
          (!shared.length || shared.some((id) => !isUuid(id) || id === user))
        )
          throw new Error("Informe IDs válidos de outras contas autorizadas.");
        await db.deck({
          ...deck,
          title: deck.title.trim(),
          shared_with: shared,
        });
      },
      "Baralho salvo.",
      () => {
        setActive(deck.id);
        setMode("library");
      },
    );
  }
  function saveCard() {
    if (!card) return;
    void run(
      async () => {
        await db.card({ ...card, ...validateCard(card) });
      },
      "Cartão salvo.",
      () => setMode("library"),
    );
  }
  function saveImport() {
    if (!incoming || !destination) return;
    void run(
      () =>
        db.import(
          {
            id: importId,
            topic_id: destination,
            owner_id: user,
            title: incoming.title,
            author: incoming.author,
            archived: false,
            visibility: "private",
            shared_with: [],
          },
          incoming.cards,
        ),
      "Baralho importado.",
      () => {
        setActive(importId);
        setMode("library");
        setIncoming(null);
        setRaw("");
      },
    );
  }
  function download(value: Deck) {
    const json = new Blob(
      [JSON.stringify(exportDeck(value, data!.cards), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(json);
    const link = document.createElement("a");
    link.href = url;
    link.download = `baralho-${value.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changeContent(update: Partial<CardContent>) {
    if (card) setCard({ ...card, ...update });
  }
  return (
    <Modal title="Flashcards e revisão" close={close} busy={busy}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <p>
          Há uma avaliação aguardando confirmação.{" "}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              const event = db.pending();
              if (event)
                void run(
                  () => db.submit(event),
                  "Avaliação confirmada.",
                  resetReview,
                );
            }}
          >
            Reenviar avaliação
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Carregando baralhos…</p>}
      {mode !== "library" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setMode("library");
            resetReview();
          }}
        >
          Voltar aos baralhos
        </button>
      )}
      {data && mode === "library" && (
        <>
          {counts && (
            <p>
              <strong>{counts.fresh}</strong> novos ·{" "}
              <strong>{counts.pending}</strong> agendados ·{" "}
              <strong>{counts.overdue}</strong> vencidos ·{" "}
              <strong>{counts.done}</strong> revisões hoje
            </p>
          )}
          {goals && (
            <details className="catalog-entry">
              <summary>Metas diárias</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => db.goals(goals), "Metas salvas.");
                }}
              >
                <div className="catalog-fields">
                  <label>
                    Cartões novos
                    <input
                      type="number"
                      min={0}
                      max={500}
                      required
                      value={goals.daily_new}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          daily_new: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Avaliações totais
                    <input
                      type="number"
                      min={0}
                      max={2000}
                      required
                      value={goals.daily_reviews}
                      onChange={(e) =>
                        setGoals({
                          ...goals,
                          daily_reviews: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <button className="primary" disabled={busy}>
                  Salvar metas
                </button>
              </form>
            </details>
          )}
          <div className="catalog-actions">
            <button className="primary" onClick={() => begin("")}>
              Revisar todos
            </button>
            <button className="secondary" onClick={() => editDeck()}>
              Novo baralho
            </button>
            <button
              className="secondary"
              onClick={() => {
                setIncoming(null);
                setMode("import");
              }}
            >
              Importar JSON
            </button>
          </div>
          <div className="catalog-fields">
            <label>
              Buscar nos baralhos e cartões
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Autor
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
            <label>
              Concurso
              <select
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
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
                onChange={(e) => setDiscipline(e.target.value)}
              >
                <option value="">Todas</option>
                {nodes
                  .filter(
                    (n) =>
                      n.kind === "discipline" &&
                      (!catalog || n.parent_id === catalog),
                  )
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Assunto
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">Todos</option>
                {subjectOptions}
              </select>
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Exibir arquivados
          </label>
          {shown.length === 0 && <p>Nenhum baralho encontrado.</p>}
          {shown.map((d) => (
            <article key={d.id} className="catalog-entry">
              <h3>{d.title}</h3>
              <p>
                {pathFor(nodes, d.topic_id)
                  .map((p) => p.name)
                  .join(" / ")}
                {d.author && ` · ${d.author}`}
                {d.archived
                  ? " · Arquivado"
                  : d.visibility === "shared"
                    ? " · Compartilhado"
                    : " · Privado"}
              </p>
              <div className="catalog-actions">
                <button
                  className="secondary"
                  onClick={() => setActive(d.id === active ? "" : d.id)}
                >
                  Ver cartões
                </button>
                {!d.archived && (
                  <button className="secondary" onClick={() => begin(d.id)}>
                    Revisar
                  </button>
                )}
                {d.owner_id === user && (
                  <>
                    <button className="secondary" onClick={() => editDeck(d)}>
                      Editar baralho
                    </button>
                    <button className="secondary" onClick={() => download(d)}>
                      Exportar JSON
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => db.deck({ ...d, archived: !d.archived }),
                          d.archived
                            ? "Baralho restaurado."
                            : "Baralho arquivado.",
                        )
                      }
                    >
                      {d.archived ? "Restaurar" : "Arquivar"}
                    </button>
                  </>
                )}
              </div>
              {current?.id === d.id && (
                <>
                  {d.owner_id === user && !d.archived && (
                    <button className="secondary" onClick={() => editCard()}>
                      Novo cartão
                    </button>
                  )}
                  {d.owner_id === user &&
                    d.visibility === "private" &&
                    !d.archived &&
                    data.errors.length > 0 && (
                      <div className="catalog-actions">
                        <label>
                          Questão do caderno de erros
                          <select
                            value={errorRef}
                            onChange={(e) => setErrorRef(e.target.value)}
                          >
                            <option value="">Selecione um erro</option>
                            {data.errors.map((entry) => (
                              <option value={entry.id} key={entry.id}>
                                {entry.reason}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="secondary"
                          disabled={busy || !errorRef}
                          onClick={() =>
                            void run(
                              () => db.convert(d.id, errorRef),
                              "Cartão vinculado à questão original.",
                            )
                          }
                        >
                          Criar cartão do erro
                        </button>
                      </div>
                    )}
                  <ul>
                    {deckCards
                      .filter((c) => showArchived || !c.archived)
                      .map((c) => (
                        <li key={c.id}>
                          <strong>{c.front}</strong>
                          {c.archived ? " · Arquivado" : ""}
                          {c.source_question_id ? " · Do caderno de erros" : ""}
                          {data.states[c.id] && (
                            <p>
                              Próxima revisão:{" "}
                              {new Date(data.states[c.id].due).toLocaleString(
                                "pt-BR",
                                { timeZone: "America/Sao_Paulo" },
                              )}
                            </p>
                          )}
                          {d.owner_id === user && (
                            <div className="catalog-actions">
                              <button
                                className="secondary"
                                onClick={() => editCard(c)}
                              >
                                Editar cartão
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () =>
                                      db.card({ ...c, archived: !c.archived }),
                                    c.archived
                                      ? "Cartão restaurado."
                                      : "Cartão arquivado.",
                                  )
                                }
                              >
                                {c.archived
                                  ? "Restaurar cartão"
                                  : "Arquivar cartão"}
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </article>
          ))}
          <details className="catalog-entry">
            <summary>Histórico de avaliações</summary>
            {!data.logs.length && <p>Nenhuma avaliação registrada.</p>}
            <ol>
              {[...data.logs]
                .sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))
                .slice(0, 50)
                .map((log) => (
                  <li key={log.client_event_id}>
                    {new Date(log.reviewed_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    ·{" "}
                    {data.cards.find((c) => c.id === log.card_id)?.front ??
                      "Cartão sem acesso"}{" "}
                    · {ratings.find((r) => r.grade === log.rating)?.label}
                  </li>
                ))}
            </ol>
          </details>
        </>
      )}
      {mode === "deck" && deck && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveDeck();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Título
              <input
                required
                maxLength={180}
                value={deck.title}
                onChange={(e) => setDeck({ ...deck, title: e.target.value })}
              />
            </label>
            <label>
              Autor do baralho
              <input
                maxLength={180}
                value={deck.author}
                onChange={(e) => setDeck({ ...deck, author: e.target.value })}
              />
            </label>
            <label>
              Concurso / disciplina / assunto
              <select
                required
                disabled={!!data?.decks.some((d) => d.id === deck.id)}
                value={deck.topic_id}
                onChange={(e) => setDeck({ ...deck, topic_id: e.target.value })}
              >
                <option value="">Selecione o assunto</option>
                {subjectOptions}
              </select>
            </label>
            <label>
              Visibilidade
              <select
                value={deck.visibility}
                onChange={(e) =>
                  setDeck({
                    ...deck,
                    visibility: e.target.value as Deck["visibility"],
                  })
                }
              >
                <option value="private">Privado</option>
                <option value="shared" disabled={demo}>
                  Compartilhado com contas autorizadas
                </option>
              </select>
            </label>
            {deck.visibility === "shared" && (
              <label>
                IDs das contas com acesso ao concurso
                <input
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  required
                />
              </label>
            )}
            <button className="primary">Salvar baralho</button>
          </fieldset>
        </form>
      )}
      {mode === "card" && card && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCard();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Frente
              <textarea
                required
                maxLength={20000}
                value={card.front}
                onChange={(e) => changeContent({ front: e.target.value })}
              />
            </label>
            <label>
              Imagem da frente (URL HTTPS)
              <input
                type="url"
                value={card.front_image ?? ""}
                onChange={(e) =>
                  changeContent({ front_image: e.target.value || null })
                }
              />
            </label>
            <label>
              Verso
              <textarea
                required
                maxLength={20000}
                value={card.back}
                onChange={(e) => changeContent({ back: e.target.value })}
              />
            </label>
            <label>
              Imagem do verso (URL HTTPS)
              <input
                type="url"
                value={card.back_image ?? ""}
                onChange={(e) =>
                  changeContent({ back_image: e.target.value || null })
                }
              />
            </label>
            <label>
              Tipo de cartão
              <select
                value={card.choices.length ? "choice" : "basic"}
                onChange={(e) =>
                  changeContent(
                    e.target.value === "choice"
                      ? { choices: ["", ""], correct_choice: 0 }
                      : { choices: [], correct_choice: null },
                  )
                }
              >
                <option value="basic">Frente e verso</option>
                <option value="choice">Múltipla escolha</option>
              </select>
            </label>
            {card.choices.length > 0 && (
              <>
                <label>
                  Alternativas (uma por linha)
                  <textarea
                    required
                    value={card.choices.join("\n")}
                    onChange={(e) =>
                      changeContent({ choices: e.target.value.split("\n") })
                    }
                  />
                </label>
                <label>
                  Alternativa correta
                  <select
                    value={card.correct_choice ?? 0}
                    onChange={(e) =>
                      changeContent({ correct_choice: Number(e.target.value) })
                    }
                  >
                    {card.choices.map((text, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {text}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button className="primary">Salvar cartão</button>
          </fieldset>
        </form>
      )}
      {mode === "import" && (
        <fieldset disabled={busy}>
          <label>
            Arquivo JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                setIncoming(null);
                if (file.size > 1024 * 1024) {
                  setError("Limite de 1 MiB por arquivo.");
                  return;
                }
                void file
                  .text()
                  .then(setRaw)
                  .catch(() => setError("Não foi possível ler o arquivo."));
              }}
            />
          </label>
          <label>
            Ou cole o JSON
            <textarea
              rows={10}
              value={raw}
              onChange={(e) => {
                setIncoming(null);
                setRaw(e.target.value);
              }}
            />
          </label>
          <label>
            Assunto de destino
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Selecione o assunto</option>
              {subjectOptions}
            </select>
          </label>
          <div className="catalog-actions">
            <button
              className="secondary"
              onClick={() => {
                setIncoming(null);
                setError("");
                try {
                  setIncoming(parseDeck(raw));
                  setImportId(crypto.randomUUID());
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Prévia do baralho
            </button>
            {incoming && (
              <button
                className="primary"
                disabled={!destination}
                onClick={saveImport}
              >
                Confirmar importação
              </button>
            )}
          </div>
          {incoming && (
            <p role="status">
              {incoming.title} · {incoming.cards.length} cartões
            </p>
          )}
        </fieldset>
      )}
      {mode === "review" && !prompt && (
        <p>Fila vazia ou meta de hoje atingida.</p>
      )}
      {prompt && (
        <article className="catalog-entry">
          <h3>{prompt.front}</h3>
          <Image url={prompt.front_image} alt="Imagem da frente do cartão" />
          {prompt.choices.length > 0 && (
            <fieldset disabled={revealed}>
              <legend>Escolha uma resposta</legend>
              {prompt.choices.map((text, i) => (
                <label className="check-label" key={i}>
                  <input
                    type="radio"
                    name="flash-choice"
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                  />
                  {text}
                </label>
              ))}
            </fieldset>
          )}
          {!revealed ? (
            <button
              className="primary"
              disabled={busy || pending}
              onClick={() => {
                setReview(prompt.id);
                setRevealed(true);
              }}
            >
              Revelar verso
            </button>
          ) : (
            <>
              <p>{prompt.back}</p>
              <Image url={prompt.back_image} alt="Imagem do verso do cartão" />
              {prompt.correct_choice !== null && (
                <p>
                  Resposta correta: {prompt.choices[prompt.correct_choice]}
                  {choice !== null &&
                    (choice === prompt.correct_choice
                      ? " · Você acertou"
                      : " · Sua escolha foi diferente")}
                </p>
              )}
              <div className="catalog-actions">
                {ratings.map((r) => (
                  <button
                    className="secondary"
                    key={r.grade}
                    disabled={busy || pending}
                    onClick={() => rate(r.grade)}
                  >
                    {r.label} · {intervalLabel(preview![r.grade].card.due, now)}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      )}
    </Modal>
  );
}
