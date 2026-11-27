import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, KeyRound, UserRound } from "lucide-react";
import { supabase } from "./repository";

type Account = { email: string; name: string };

const passwordErrors: Record<string, string> = {
  invalid_credentials: "A senha atual está incorreta.",
  same_password: "Escolha uma senha diferente da atual.",
  weak_password: "A nova senha foi recusada. Escolha uma senha mais forte.",
  reauthentication_needed:
    "Por segurança, saia e entre novamente antes de trocar a senha.",
  session_not_found: "Sua sessão expirou. Entre novamente.",
  over_request_rate_limit:
    "Muitas tentativas. Aguarde um pouco e tente novamente.",
};

export function ProfilePage({
  userId,
  demo,
  onBack,
  onLogout,
}: {
  userId: string;
  demo: boolean;
  onBack: () => void;
  onLogout?: () => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [savingName, setSavingName] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameStatus, setNameStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  useEffect(() => {
    if (demo || !supabase) return;
    let active = true;
    setLoadError(false);
    const db = supabase;
    Promise.all([
      db.auth.getUser(),
      db
        .from("study_profiles")
        .select("display_name")
        .eq("user_id", userId)
        .single(),
    ])
      .then(([identity, profile]) => {
        if (!active) return;
        if (
          identity.error ||
          identity.data.user?.id !== userId ||
          profile.error
        ) {
          setLoadError(true);
          return;
        }
        setAccount({
          email: identity.data.user.email ?? "",
          name: profile.data.display_name,
        });
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [demo, userId, retry]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account || savingName) return;
    const name = String(
      new FormData(event.currentTarget).get("display-name") ?? "",
    ).trim();
    setNameError("");
    setNameStatus("");
    if (!name || name.length > 180) {
      setNameError("Informe um nome de até 180 caracteres.");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("study_profiles")
        .update({ display_name: name })
        .eq("user_id", userId)
        .select("display_name")
        .single();
      if (error) throw error;
      setAccount({ ...account, name });
      setNameStatus("Nome atualizado.");
    } catch {
      setNameError("Não foi possível salvar seu nome. Tente novamente.");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account || changingPassword) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const current = String(fields.get("current-password") ?? "");
    const password = String(fields.get("new-password") ?? "");
    setPasswordError("");
    setPasswordStatus("");
    if (!current || password.length < 12 || password.length > 128) {
      setPasswordError(
        "Informe a senha atual e uma nova senha de 12 a 128 caracteres.",
      );
      return;
    }
    if (password !== fields.get("confirm-password")) {
      setPasswordError("A confirmação deve ser igual à nova senha.");
      return;
    }
    if (current === password) {
      setPasswordError(passwordErrors.same_password);
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        current_password: current,
        password,
      });
      if (error) {
        setPasswordError(
          passwordErrors[error.code ?? ""] ??
            "Não foi possível alterar a senha. Confira a senha atual e tente novamente.",
        );
        return;
      }
      form.reset();
      setPasswordStatus(
        "Senha atualizada. Use a nova senha no próximo acesso.",
      );
    } catch {
      setPasswordError(
        "Não foi possível concluir a solicitação. Confira sua conexão e tente novamente.",
      );
    } finally {
      setChangingPassword(false);
    }
  }

  const name = demo ? "Modo demonstração" : account?.name || "Minha conta";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toLocaleUpperCase("pt-BR");

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <button className="text-button profile-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Voltar
      </button>
      <h1 id="profile-title">Meu perfil</h1>
      {onLogout && (
        <div className="profile-feedback">
          <button className="secondary" disabled={leaving} onClick={async () => {
            setLeaving(true);
            setLogoutError("");
            try { await onLogout(); }
            catch (error) { setLogoutError((error as Error).message); }
            finally { setLeaving(false); }
          }}>{leaving ? "Saindo…" : "Sair da conta"}</button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      )}
      <div className="profile-identity">
        <span className="profile-initials" aria-hidden="true">
          {initials}
        </span>
        <div>
          <h2>{name}</h2>
          {account?.email && <p>{account.email}</p>}
          {demo && (
            <p>
              Você está usando a demonstração. Entre com sua conta para editar o
              perfil e a senha.
            </p>
          )}
        </div>
      </div>
      {!demo &&
        !account &&
        (loadError ? (
          <div className="profile-feedback">
            <p role="alert">Não foi possível carregar os dados da conta.</p>
            <button
              className="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <p role="status">Carregando perfil…</p>
        ))}
      {account && (
        <div className="profile-sections">
          <details>
            <summary>
              <span className="profile-section-icon">
                <UserRound size={19} aria-hidden="true" />
              </span>
              <span>
                <strong>Dados da conta</strong>
                <small>Nome e e-mail</small>
              </span>
              <ChevronDown
                size={18}
                className="profile-chevron"
                aria-hidden="true"
              />
            </summary>
            <form className="profile-form" onSubmit={saveName}>
              <fieldset disabled={savingName}>
                <label>
                  Nome de exibição
                  <input
                    name="display-name"
                    autoComplete="name"
                    maxLength={180}
                    defaultValue={account.name}
                    required
                  />
                </label>
                <label>
                  E-mail da conta
                  <input value={account.email} autoComplete="email" readOnly />
                </label>
                <button className="primary">
                  {savingName ? "Salvando…" : "Salvar nome"}
                </button>
              </fieldset>
              {nameError && (
                <p className="profile-message" role="alert">
                  {nameError}
                </p>
              )}
              {nameStatus && (
                <p className="profile-message" role="status">
                  {nameStatus}
                </p>
              )}
            </form>
          </details>
          <details>
            <summary>
              <span className="profile-section-icon">
                <KeyRound size={19} aria-hidden="true" />
              </span>
              <span>
                <strong>Senha e segurança</strong>
                <small>Troque sua senha de acesso</small>
              </span>
              <ChevronDown
                size={18}
                className="profile-chevron"
                aria-hidden="true"
              />
            </summary>
            <form className="profile-form" onSubmit={changePassword}>
              <fieldset disabled={changingPassword}>
                <label>
                  Senha atual
                  <input
                    name="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  Nova senha
                  <input
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    aria-describedby="new-password-length"
                  />
                </label>
                <p className="muted" id="new-password-length">
                  Use de 12 a 128 caracteres.
                </p>
                <label>
                  Confirme a nova senha
                  <input
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
                <button className="primary">
                  {changingPassword ? "Alterando…" : "Trocar senha"}
                </button>
              </fieldset>
              {passwordError && (
                <p className="profile-message" role="alert">
                  {passwordError}
                </p>
              )}
              {passwordStatus && (
                <p className="profile-message" role="status">
                  {passwordStatus}
                </p>
              )}
            </form>
          </details>
        </div>
      )}
    </section>
  );
}
