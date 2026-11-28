import { possibleDuplicates } from "./library";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X } from "lucide-react";
import {
  type Material,
  type Node,
  type Section,
  sections,
  validateMaterial,
  validateFile,
  isUuid,
} from "./domain";
import type { Member } from "./repository";
export const FeedbackContext = createContext("");
export function Modal({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const error = useContext(FeedbackContext);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-label={title}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon"
          aria-label="Fechar"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-scroll">
        {error && <p className="error" role="alert">{error}</p>}
        {children}
      </div>
    </dialog>
  );
}
export function MaterialForm({
  initial,
  topic,
  user,
  section,
  onSave,
  close,
  busy,
  demo,
  materials = [],
  useExisting,
}: {
  materials?: Material[];
  useExisting?: (m: Material) => Promise<boolean>;
  initial?: Material;
  topic: string;
  user: string;
  section: Section;
  onSave: (m: Material, f?: File) => Promise<boolean>;
  close: () => void;
  busy: boolean;
  demo: boolean;
}) {
  const [m, set] = useState<Material>(
    () =>
      initial || {
        id: crypto.randomUUID(),
        topic_id: topic,
        owner_id: user,
        section,
        title: "",
        kind:
          section === "Videoaulas"
            ? "youtube"
            : section === "Questões externas"
              ? "link"
              : "text",
        url: "",
        body: "",
        back: "",
        file_path: "",
        visibility: "private",
        shared_with: [],
        position: 0,
        embed: true,
        verified: false,
      },
  );
  const [duplicates, setDuplicates] = useState<Material[]>([]);
  const [pending, setPending] = useState<{ value: Material; file?: File } | null>(null);
  const [recipients, setRecipients] = useState(m.shared_with.join(", "));
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const field = <K extends keyof Material>(key: K, value: Material[K]) =>
    set({ ...m, [key]: value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const value = {
        ...m,
        shared_with:
          m.visibility === "private"
            ? []
            : recipients.split(/[\s,;]+/).filter(Boolean),
      };
      validateMaterial(value);
      if (file) validateFile(file);
      if ((m.kind === "pdf" || m.kind === "image") && !file && !m.file_path)
        throw new Error("Selecione um arquivo.");
      const matches = possibleDuplicates(value, materials);
      if (!initial && matches.length) { setDuplicates(matches); setPending({ value, file }); return; }
      if (await onSave(value, file)) close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={initial ? "Editar material" : "Adicionar material"}
      close={close}
      busy={busy}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            Título
            <input
              required
              maxLength={180}
              value={m.title}
              onChange={(e) => field("title", e.target.value)}
              autoFocus
            />
          </label>
          <div className="form-grid">
            <label>
              Seção
              <select
                value={m.section}
                onChange={(e) => field("section", e.target.value as Section)}
              >
                {sections
                  .filter(
                    (s) => !["Anotações", "Progresso e checklist"].includes(s),
                  )
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
            <label>
              Formato
              <select
                value={m.kind}
                onChange={(e) => {
                  set({
                    ...m,
                    kind: e.target.value as Material["kind"],
                    file_path: "",
                    url: "",
                    embed: e.target.value === "youtube",
                  });
                  setFile(undefined);
                }}
              >
                {[
                  ["youtube", "YouTube"],
                  ["link", "Link externo"],
                  ["text", "Texto"],
                  ["pdf", "PDF"],
                  ["image", "Imagem"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="material-metadata"><summary>Autor, obra e identificação do material</summary>
            <label>Autor<input maxLength={180} value={m.author ?? ""} onChange={e => field("author", e.target.value)} /></label>
            <label>Obra<input maxLength={180} value={m.work ?? ""} onChange={e => field("work", e.target.value)} /></label>
            <label>Edição<input maxLength={180} value={m.edition ?? ""} onChange={e => field("edition", e.target.value)} /></label>
            <label>Fonte<input maxLength={2000} value={m.source ?? ""} onChange={e => field("source", e.target.value)} /></label>
            <label>Versão do conteúdo<input maxLength={80} value={m.content_version ?? ""} onChange={e => field("content_version", e.target.value)} /></label>
          </details>
          {(m.kind === "youtube" || m.kind === "link") && (
            <label>
              Endereço HTTPS
              <input
                type="url"
                required
                value={m.url}
                onChange={(e) => field("url", e.target.value)}
                placeholder="https://"
              />
            </label>
          )}
          {m.kind === "youtube" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={m.embed}
                onChange={(e) => field("embed", e.target.checked)}
              />
              Tentar incorporar com o player oficial do YouTube
            </label>
          )}
          {(m.kind === "pdf" || m.kind === "image") && (
            <label>
              Arquivo · até 20 MB
              <input
                type="file"
                accept={
                  m.kind === "pdf"
                    ? "application/pdf"
                    : "image/png,image/jpeg,image/webp"
                }
                disabled={demo}
                onChange={(e) => setFile(e.target.files?.[0])}
              />
              {demo ? (
                <small>Conecte o Supabase para enviar arquivos.</small>
              ) : (
                m.file_path && (
                  <small>
                    Arquivo existente. Selecione outro apenas para substituir.
                  </small>
                )
              )}
            </label>
          )}
          <label>
            {m.section === "Flashcards"
              ? "Frente do cartão"
              : m.kind === "text"
                ? "Texto"
                : "Observações"}
            <textarea
              required={m.kind === "text" || m.section === "Flashcards"}
              maxLength={100000}
              rows={5}
              value={m.body}
              onChange={(e) => field("body", e.target.value)}
            />
          </label>
          {m.section === "Flashcards" && (
            <label>
              Verso do cartão
              <textarea
                required
                rows={4}
                maxLength={100000}
                value={m.back}
                onChange={(e) => field("back", e.target.value)}
              />
            </label>
          )}
          {(m.kind === "youtube" || m.kind === "link") && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={m.verified}
                onChange={(e) => field("verified", e.target.checked)}
              />
              Conferi o destino e a correspondência ao assunto
            </label>
          )}
          <label>
            Privacidade
            <select
              value={m.visibility}
              onChange={(e) =>
                field("visibility", e.target.value as Material["visibility"])
              }
            >
              <option value="private">Privado · apenas eu</option>
              <option value="shared" disabled={demo}>
                Compartilhado · usuários autorizados
              </option>
            </select>
          </label>
          {m.visibility === "shared" && (
            <label>
              IDs dos usuários autorizados
              <textarea
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="UUIDs separados por vírgula"
              />
              <small>
                Os destinatários também precisam ter acesso ao concurso. Somente
                você poderá editar ou remover este material. Links de arquivo
                expiram em 60 segundos; após revogar, um link já emitido pode
                valer até expirar.
              </small>
            </label>
          )}
          {pending && <section className="duplicate-review" aria-label="Possíveis materiais duplicados"><h3>Possíveis materiais duplicados</h3><p>Compare conteúdo, fonte e versão. Nenhum material foi alterado.</p><ul>{duplicates.map(existing => <li key={existing.id}><strong>{existing.title}</strong> · {existing.author || "Autor não informado"} · {existing.edition || "Edição não informada"}
            {useExisting && <button type="button" className="text-button" onClick={async () => { if (await useExisting(existing)) close(); }}>Utilizar material existente</button>}
            {existing.owner_id === user && !existing.catalog_managed && <button type="button" className="text-button" onClick={async () => { if (!window.confirm("Atualizar este material? O novo conteúdo aparecerá em todos os seus vínculos.")) return; if (await onSave({ ...pending.value, id: existing.id, library_key: existing.library_key, topic_id: existing.topic_id, owner_id: existing.owner_id, visibility: existing.visibility, shared_with: existing.shared_with, file_path: existing.file_path }, pending.file)) close(); }}>Atualizar material existente</button>}
          </li>)}</ul><button type="button" className="secondary" onClick={async () => { if (await onSave(pending.value, pending.file)) close(); }}>Manter ambos como materiais distintos</button><button type="button" className="text-button" onClick={() => { setPending(null); setDuplicates([]); }}>Voltar à edição do material</button></section>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              {busy ? "Salvando…" : "Salvar material"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function NodeForm({
  parent,
  initial,
  user,
  count,
  close,
  save,
  busy,
}: {
  parent?: Node;
  initial?: Node;
  user: string;
  count: number;
  close: () => void;
  save: (n: Node) => Promise<boolean>;
  busy: boolean;
}) {
  const kind =
    initial?.kind ||
    (!parent
      ? "contest"
      : parent.kind === "contest"
        ? "discipline"
        : parent.kind === "discipline"
          ? "topic"
          : "subtopic");
  const label = {
    contest: "concurso",
    discipline: "disciplina",
    topic: "assunto",
    subtopic: "subassunto",
  }[kind];
  const [name, setName] = useState(initial?.name || "");
  const [board, setBoard] = useState(initial?.board || "");
  return (
    <Modal
      title={`${initial ? "Editar" : "Adicionar"} ${label}`}
      close={close}
      busy={busy}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await save(
              initial
                ? { ...initial, name: name.trim(), board }
                : {
                    id: crypto.randomUUID(),
                    parent_id: parent?.id || null,
                    kind,
                    name: name.trim(),
                    board,
                    owner_id: parent?.owner_id || user,
                    position: count,
                  },
            )
          )
            close();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Nome {kind === "discipline" ? "da" : "do"} {label}
            <input
              required
              maxLength={180}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          {kind === "contest" && (
            <label>
              Banca (opcional)
              <input
                maxLength={180}
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              />
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="primary">
              Salvar
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function ShareForm({
  contest,
  members,
  close,
  save,
  busy,
}: {
  contest: Node;
  members: Member[];
  close: () => void;
  save: (m: Member, remove?: boolean) => Promise<boolean>;
  busy: boolean;
}) {
  const [id, setId] = useState("");
  const [role, setRole] = useState<Member["role"]>("reader");
  const [error, setError] = useState("");
  return (
    <Modal title="Acesso ao concurso" close={close} busy={busy}>
      <p>
        Autorize contas pelo identificador exibido no rodapé da conta. Isso
        compartilha a estrutura; materiais privados, anotações e progresso
        permanecem individuais.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!isUuid(id)) {
            setError("Informe um UUID válido.");
            return;
          }
          if (await save({ contest_id: contest.id, user_id: id, role })) {
            setId("");
            setError("");
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            ID do usuário
            <input value={id} onChange={(e) => setId(e.target.value.trim())} />
          </label>
          <label>
            Permissão
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Member["role"])}
            >
              <option value="reader">Leitor da estrutura</option>
              <option value="editor">Editor da estrutura</option>
            </select>
          </label>
          <small>
            Leitores podem adicionar seus materiais. Editores também podem criar
            e renomear itens do edital. Materiais alheios continuam somente para
            leitura.
          </small>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit">
            Autorizar acesso
          </button>
        </fieldset>
      </form>
      <ul className="member-list">
        {members
          .filter((m) => m.contest_id === contest.id)
          .map((m) => (
            <li key={m.user_id}>
              <span>
                {m.user_id}
                <small>{m.role === "reader" ? "Leitor" : "Editor"}</small>
              </span>
              <button
                className="danger"
                disabled={busy}
                onClick={() => save(m, true)}
              >
                Revogar
              </button>
            </li>
          ))}
      </ul>
    </Modal>
  );
}
