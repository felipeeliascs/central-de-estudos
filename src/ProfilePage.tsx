import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, ChevronDown, CreditCard, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { AccountDeletion } from "./AccountDeletion";
import { supabase } from "./repository";

type Account = { email: string; name: string; username?: string; phone?: string; bio?: string; avatar_path?: string; created_at?: string };

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
  const [account, setAccount] = useState<Account | null>(() => {
    if (!demo) return null;
    try { return JSON.parse(localStorage.getItem("central-profile-demo:" + userId) ?? "null") ?? { email: "estudante@example.test", name: "Estudante fictício" }; }
    catch { return { email: "estudante@example.test", name: "Estudante fictício" }; }
  });
  const [avatarUrl, setAvatarUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");
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
        .select("display_name,username,phone,bio,avatar_path,created_at")
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
          username: profile.data.username ?? "", phone: profile.data.phone ?? "", bio: profile.data.bio ?? "", avatar_path: profile.data.avatar_path ?? "", created_at: profile.data.created_at,
        });
        if (profile.data.avatar_path) {
          void db.storage.from("profile-photos").createSignedUrl(profile.data.avatar_path, 60).then(result => {
            if (active && !result.error) setAvatarUrl(result.data?.signedUrl ?? "");
          });
        }
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
    if ((!supabase && !demo) || !account || savingName) return;
    const name = String(
      new FormData(event.currentTarget).get("display-name") ?? "",
    ).trim();
    const fields = new FormData(event.currentTarget);
    const username = String(fields.get("username") ?? "").trim().toLocaleLowerCase();
    const phone = String(fields.get("phone") ?? "").trim();
    if ((username && !/^[a-z0-9._-]{3,40}$/.test(username)) || phone.length > 30) {
      setNameError("Use um usuário de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado e telefone de até 30 caracteres.");
      return;
    }
    setNameError("");
    setNameStatus("");
    if (!name || name.length > 180) {
      setNameError("Informe um nome de até 180 caracteres.");
      return;
    }
    setSavingName(true);
    try {
      if (!demo) {
        const { error } = await supabase!.from("study_profiles")
          .update({ display_name: name, username, phone }).eq("user_id", userId).select("display_name").single();
        if (error) throw error;
      }
      const next = { ...account, name, username, phone };
      setAccount(next);
      if (demo) localStorage.setItem("central-profile-demo:" + userId, JSON.stringify(next));
      setNameStatus("Dados da conta atualizados.");
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

  async function savePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const bio = String(form.get("bio") ?? "").trim();
    const file = photoFile;
    setPhotoError(""); setPhotoStatus(""); setPhotoBusy(true);
    let uploaded = "";
    let committed = false;
    try {
      if (file?.size && (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) throw new Error("Envie PNG, JPEG ou WebP de até 2 MB.");
      if (bio.length > 1000) throw new Error("A descrição aceita até 1.000 caracteres.");
      if (demo && file?.size) throw new Error("Upload de foto exige o ambiente conectado de teste.");
      const bucket = !demo && file?.size ? supabase!.storage.from("profile-photos") : null;
      if (bucket && file?.size) {
        uploaded = userId + "/" + crypto.randomUUID() + "." + (file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]);
        const upload = await bucket.upload(uploaded, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
      }
      const next = { ...account, bio, avatar_path: uploaded || account.avatar_path || "" };
      if (demo) localStorage.setItem("central-profile-demo:" + userId, JSON.stringify(next));
      else {
        const saved = await supabase!.from("study_profiles").update({ bio, avatar_path: next.avatar_path }).eq("user_id", userId).select("user_id").single();
        if (saved.error) throw saved.error;
        committed = true;
        if (uploaded && bucket) {
          const signed = await bucket.createSignedUrl(uploaded, 60);
          if (!signed.error) setAvatarUrl(signed.data.signedUrl);
          if (account.avatar_path) await bucket.remove([account.avatar_path]);
        }
      }
      setAccount(next);
      setPhotoFile(null);
      const photoInput = formElement.elements.namedItem("photo") as HTMLInputElement | null;
      if (photoInput) photoInput.value = "";
      setPhotoStatus("Foto e descrição atualizadas.");
    } catch (error) {
      if (uploaded && !committed) await supabase!.storage.from("profile-photos").remove([uploaded]);
      setPhotoError((error as Error).message || "Não foi possível salvar.");
    } finally { setPhotoBusy(false); }
  }

  const name = account?.name || (demo ? "Modo demonstração" : "Minha conta");
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
      <p className="page-description">Edite suas informações e personalize sua experiência.</p>
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
      <div className="profile-identity reference-profile">
        <span className="profile-initials" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="Foto do seu perfil" onError={() => setAvatarUrl("")} /> : initials}
        </span>
        <div>
          <h2>{name}</h2>
          {account?.email && <p>{account.email}</p>}
          <span className="catalog-badge">Uso gratuito</span>
          {account?.created_at && <small>Conta criada em {new Date(account.created_at).toLocaleDateString("pt-BR")}</small>}
          {demo && (
            <p>
              Dados fictícios: as edições de perfil ficam somente neste navegador. Foto e senha exigem uma conta de teste conectada.
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
                <small>Nome, usuário, e-mail e telefone</small>
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
                <label>Usuário<input name="username" maxLength={40} pattern="[a-z0-9._-]{3,40}" defaultValue={account.username ?? ""} autoComplete="nickname" /></label>
                <label>Telefone<input name="phone" type="tel" maxLength={30} defaultValue={account.phone ?? ""} autoComplete="tel" /></label>
                <label>
                  E-mail da conta
                  <input value={account.email} autoComplete="email" readOnly />
                </label>
                <button className="primary">
                  {savingName ? "Salvando…" : "Salvar dados"}
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
              <fieldset disabled={changingPassword || demo}>
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
          <details>
            <summary><span className="profile-section-icon"><Camera size={19} /></span><span><strong>Foto e descrição</strong><small>Sua identificação pessoal na Central</small></span><ChevronDown size={18} className="profile-chevron" /></summary>
            <form className="profile-form" onSubmit={savePhoto}><fieldset disabled={photoBusy}>
              <label>Foto do perfil<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPhotoFile(event.target.files?.[0] ?? null)} /></label>
              <small>PNG, JPEG ou WebP de até 2 MB. A foto permanece privada.</small>
              <label>Descrição<textarea name="bio" maxLength={1000} rows={4} defaultValue={account.bio ?? ""} /></label>
              <button className="primary">Salvar foto e descrição</button>
            </fieldset>{photoError && <p role="alert">{photoError}</p>}{photoStatus && <p role="status">{photoStatus}</p>}</form>
          </details>
          <details>
            <summary><span className="profile-section-icon"><ShieldCheck size={19} /></span><span><strong>Privacidade e rede</strong><small>Quem pode acessar seus dados</small></span><ChevronDown size={18} className="profile-chevron" /></summary>
            <div className="profile-feedback"><p>Seu perfil, telefone, foto, anotações e histórico de estudo são privados. A Central não possui perfil público ou rede de seguidores.</p><p>Materiais só são compartilhados quando você escolhe destinatários na Biblioteca. Administradores gerenciam o catálogo e autorizações, sem acesso geral ao seu estudo.</p></div>
          </details>
          <details>
            <summary><span className="profile-section-icon"><CreditCard size={19} /></span><span><strong>Minha assinatura</strong><small>Uso gratuito</small></span><ChevronDown size={18} className="profile-chevron" /></summary>
            <div className="profile-feedback"><p>A Central não possui assinatura, cobrança ou pagamento integrado. O acesso a serviços externos segue as condições desses serviços.</p></div>
          </details>
          <AccountDeletion demo={demo} />
        </div>
      )}
    </section>
  );
}
