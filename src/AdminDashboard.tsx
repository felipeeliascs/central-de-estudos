import { AdminCatalogAvailability } from "./AdminCatalogAvailability";
import { BillingStatus } from "./BillingStatus";
import { AdminDeletionRequests } from "./AccountDeletion";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "./repository";
import { Modal } from "./Forms";

type Directory = {
  accounts: number;
  confirmed: number;
  administrators: number;
  pending: number;
  users: {
    id: string;
    email: string | null;
    display_name: string;
    role: string;
    confirmed: boolean;
  }[];
  authorizations: {
    email: string;
    expires_at: string;
    used: boolean;
    active: boolean;
  }[];
};

const formatDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function AdminDashboard({
  onBack,
  onCatalog,
  onPrompts,
  onIncidence,
  onProfile,
}: {
  onBack: () => void;
  onCatalog: () => void;
  onPrompts: () => void;
  onIncidence: () => void;
  onProfile: () => void;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.resolve(
      supabase.rpc("study_admin_overview", { search_text: query }),
    )
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setDirectory(null);
          setLoadError(
            error?.code === "42501"
              ? "Você não tem acesso à administração."
              : "Não foi possível abrir o painel administrativo. Tente novamente.",
          );
          return;
        }
        setDirectory(data as Directory);
      })
      .catch(() => {
        if (!active) return;
        setDirectory(null);
        setLoadError(
          "Não foi possível abrir o painel administrativo. Tente novamente.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, version]);

  function refresh() {
    setVersion((value) => value + 1);
  }

  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setActionError("");
    setStatus("");
    try {
      const { error } = await supabase.rpc("study_admin_allow_signup", {
        address: String(fields.get("email") ?? "").trim(),
        valid_days: Number(fields.get("days")),
      });
      if (error) {
        setActionError(
          error.code === "23505"
            ? "Já existe uma conta com esse e-mail."
            : "Não foi possível autorizar o cadastro. Confira os dados e tente novamente.",
        );
        return;
      }
      form.reset();
      setStatus(
        "Cadastro autorizado. A pessoa já pode iniciar o cadastro com esse e-mail.",
      );
      refresh();
    } catch {
      setActionError(
        "Falha de conexão. Atualize a lista antes de tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!supabase || !revoking || busy) return;
    setBusy(true);
    setActionError("");
    setStatus("");
    try {
      const { data, error } = await supabase.rpc("study_admin_revoke_signup", {
        address: revoking,
      });
      if (error) throw error;
      setRevoking(null);
      setStatus(
        data ? "Autorização revogada." : "A autorização já não estava ativa.",
      );
      refresh();
    } catch {
      setActionError(
        "Não foi possível confirmar a revogação. Atualize a lista se a conexão caiu.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <button className="text-button profile-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Voltar
      </button>
      <h1 id="admin-title">Administração</h1>
      <p className="muted">
        Gerencie contas autorizadas e conteúdo da Central.
      </p>
      {loadError && (
        <div className="error">
          <p role="alert">{loadError}</p>
          <button className="secondary" onClick={refresh}>
            Atualizar painel
          </button>
        </div>
      )}
      {loading && <p role="status">Carregando administração…</p>}
      {directory && (
        <>
          <AdminCatalogAvailability onCatalog={onCatalog} />
          <section className="admin-card"><h2>Perfil e conta</h2><p>Meu Perfil reúne dados da conta, foto privada, descrição, senha, privacidade, uso gratuito e solicitação de exclusão.</p><button className="secondary" onClick={onProfile}>Abrir Meu Perfil</button><p className="muted">O administrador consulta nome, e-mail e papel das contas. Telefones, fotos, descrições e estudos de outras pessoas permanecem privados.</p></section>
          <AdminDeletionRequests />
          <section className="admin-card"><h2>Assinaturas e Mercado Pago</h2><BillingStatus admin /></section>
          <dl className="admin-metrics">
            <div>
              <dt>Contas</dt>
              <dd>{directory.accounts}</dd>
            </div>
            <div>
              <dt>E-mails confirmados</dt>
              <dd>{directory.confirmed}</dd>
            </div>
            <div>
              <dt>Administradores</dt>
              <dd>{directory.administrators}</dd>
            </div>
            <div>
              <dt>Cadastros autorizados</dt>
              <dd>{directory.pending}</dd>
            </div>
          </dl>
          <div className="admin-shortcuts" aria-label="Gestão de conteúdo">
            <button className="secondary" onClick={onCatalog}>
              <BookOpen size={18} aria-hidden="true" /> Concursos e editais
            </button>
            <button className="secondary" onClick={onPrompts}>
              <Sparkles size={18} aria-hidden="true" /> Modelos de prompts
            </button>
            <button className="secondary" onClick={onIncidence}>
              <ChartNoAxesColumnIncreasing size={18} aria-hidden="true" />{" "}
              Raio-X do edital
            </button>
          </div>
          <section className="admin-card">
            <h2>
              <ShieldCheck size={20} aria-hidden="true" /> Autorizar cadastro
            </h2>
            <p className="muted">
              O cadastro usa este e-mail e a pessoa define a própria senha. A
              autorização não envia e-mail.
            </p>
            <form onSubmit={authorize}>
              <fieldset className="admin-form" disabled={busy}>
                <label>
                  E-mail
                  <input
                    type="email"
                    name="email"
                    autoComplete="off"
                    maxLength={254}
                    required
                  />
                </label>
                <label>
                  Validade (dias)
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    defaultValue={7}
                    required
                  />
                </label>
                <button className="primary" type="submit">
                  Autorizar cadastro
                </button>
              </fieldset>
            </form>
            {status && (
              <p className="profile-message" role="status">
                {status}
              </p>
            )}
            {actionError && !revoking && (
              <p className="profile-message" role="alert">
                {actionError}
              </p>
            )}
          </section>
          <section className="admin-card">
            <h2>Usuários e autorizações</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(search.trim());
                refresh();
              }}
            >
              <div className="admin-form">
                <label>
                  Buscar por nome ou e-mail
                  <input
                    type="search"
                    value={search}
                    maxLength={254}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <button type="submit" className="secondary">
                  Buscar
                </button>
              </div>
            </form>
            <p className="muted">São exibidos até 50 resultados por lista.</p>
            <h3>Contas cadastradas</h3>
            {directory.users.length ? (
              <ul className="admin-list">
                {directory.users.map((user) => (
                  <li key={user.id}>
                    <div>
                      <strong>
                        {user.display_name || user.email || "Conta sem e-mail"}
                      </strong>
                      {user.display_name && <small>{user.email}</small>}
                    </div>
                    <div>
                      <strong>
                        {user.role === "admin" ? "Administrador" : "Estudante"}
                      </strong>
                      <small>
                        {user.confirmed
                          ? "E-mail confirmado"
                          : "Confirmação pendente"}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhuma conta encontrada.</p>
            )}
            <h3>Autorizações de cadastro</h3>
            {directory.authorizations.length ? (
              <ul className="admin-list">
                {directory.authorizations.map((entry) => (
                  <li key={entry.email}>
                    <div>
                      <strong>{entry.email}</strong>
                      <small>
                        {entry.used
                          ? "Usada"
                          : entry.active
                            ? `Válida até ${formatDate.format(new Date(entry.expires_at))}`
                            : "Inativa"}
                      </small>
                    </div>
                    {entry.active && (
                      <button
                        className="secondary"
                        disabled={busy}
                        aria-label={`Revogar autorização de ${entry.email}`}
                        onClick={() => {
                          setActionError("");
                          setRevoking(entry.email);
                        }}
                      >
                        Revogar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhuma autorização encontrada.</p>
            )}
          </section>
        </>
      )}
      {revoking && (
        <Modal
          title="Revogar autorização"
          busy={busy}
          close={() => setRevoking(null)}
        >
          <p>
            Revogar a autorização de <strong>{revoking}</strong>? Isso impede o
            uso dessa autorização para um novo cadastro.
          </p>
          {actionError && (
            <p className="profile-message" role="alert">
              {actionError}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void revoke()}
          >
            {busy ? "Revogando…" : "Confirmar revogação"}
          </button>
        </Modal>
      )}
    </section>
  );
}
