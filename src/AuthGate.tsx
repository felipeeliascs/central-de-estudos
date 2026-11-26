import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { BookOpen } from "lucide-react";
import {
  demoRepository,
  remoteRepository,
  supabase,
  type Repository,
} from "./repository";
type Mode = "login" | "signup" | "request" | "recovery";
export function AuthGate({
  children,
}: {
  children: (repo: Repository, logout: () => Promise<void>) => ReactNode;
}) {
  const [user, setUser] = useState<string | null>(null);
  const [demo, setDemo] = useState(!supabase);
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(location.search).get("flow") === "recovery"
      ? "recovery"
      : "login",
  );
  const [loading, setLoading] = useState(!!supabase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        setUser(session?.user.id || null);
        setLoading(false);
        if (event === "PASSWORD_RECOVERY") {
          setMode("recovery");
          setDemo(false);
        }
        if (event === "SIGNED_OUT") {
          setUser(null);
          setDemo(false);
          setMode("login");
        }
      },
    );
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setUser(data.session?.user.id || null);
          setLoading(false);
          if (error)
            setError("Sua sessão não pôde ser restaurada. Entre novamente.");
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError("Não foi possível verificar a sessão. Tente novamente.");
        }
      });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const repo = useMemo(
    () => (demo ? demoRepository() : user ? remoteRepository(user) : null),
    [demo, user],
  );
  function change(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
  }
  async function logout() {
    if (demo) {
      setDemo(false);
      return;
    }
    const { error } = await supabase!.auth.signOut({ scope: "global" });
    if (error)
      throw new Error("Não foi possível encerrar a sessão. Tente novamente.");
    setUser(null);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setBusy(true);
    setError("");
    setMessage("");
    const redirect = new URL(location.pathname, location.origin);
    redirect.searchParams.set("flow", "recovery");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error)
          throw new Error(
            "Não foi possível entrar. Confira as credenciais e a conexão.",
          );
      }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(location.pathname, location.origin).href,
          },
        });
        if (error)
          throw new Error(
            "Cadastro não concluído. Verifique a autorização com o administrador e tente novamente.",
          );
        setMessage(
          "Se o cadastro estiver autorizado, confira seu e-mail para confirmar a conta.",
        );
      }
      if (mode === "request") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirect.href,
        });
        if (error)
          throw new Error(
            "Não foi possível solicitar a recuperação. Tente novamente.",
          );
        setMessage(
          "Se houver uma conta para esse e-mail, você receberá instruções. Abra o link neste mesmo navegador.",
        );
      }
      if (mode === "recovery") {
        if (!user)
          throw new Error(
            "Abra um link de recuperação válido para criar uma nova senha.",
          );
        if (password !== String(form.get("confirm")))
          throw new Error("As senhas precisam ser iguais.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error)
          throw new Error(
            "Não foi possível atualizar a senha. Solicite um novo link se necessário.",
          );
        const { error: signoutError } = await supabase.auth.signOut({
          scope: "global",
        });
        if (signoutError)
          throw new Error(
            "Senha alterada, mas não foi possível encerrar as sessões. Tente sair novamente.",
          );
        setUser(null);
        setMode("login");
        history.replaceState(null, "", location.pathname);
        setMessage("Senha alterada. Entre novamente.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (repo && mode !== "recovery") return children(repo, logout);
  return (
    <main className="auth">
      <div className="brand">
        <BookOpen />
        Central de Estudos
      </div>
      <h1>
        {mode === "signup"
          ? "Criar conta autorizada"
          : mode === "request"
            ? "Recuperar acesso"
            : mode === "recovery"
              ? "Definir nova senha"
              : "Seu próximo passo começa aqui."}
      </h1>
      {loading ? (
        <p role="status">Verificando sessão…</p>
      ) : (
        <>
          <p>
            {mode === "signup"
              ? "O administrador precisa autorizar seu e-mail antes do cadastro."
              : mode === "recovery"
                ? "Use pelo menos 12 caracteres. Você precisará entrar novamente."
                : "Acesse seu ambiente individual de estudos."}
          </p>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {mode !== "recovery" && (
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                  />
                </label>
              )}
              {mode !== "request" && (
                <label>
                  {mode === "recovery" ? "Nova senha" : "Senha"}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>
              )}
              {mode === "recovery" && (
                <label>
                  Confirmar nova senha
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
              )}
              <button
                className="primary"
                disabled={busy || (mode === "recovery" && !user)}
              >
                {busy
                  ? "Aguarde…"
                  : mode === "signup"
                    ? "Cadastrar"
                    : mode === "request"
                      ? "Enviar instruções"
                      : mode === "recovery"
                        ? "Salvar nova senha"
                        : "Entrar"}
              </button>
            </fieldset>
          </form>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {mode === "login" ? (
        <>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => change("request")}
          >
            Esqueci minha senha
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => change("signup")}
          >
            Cadastrar conta autorizada
          </button>
        </>
      ) : (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => change("login")}
        >
          Voltar para entrar
        </button>
      )}
      {mode !== "recovery" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setMode("login");
            setDemo(true);
          }}
        >
          Explorar demonstração fictícia
        </button>
      )}
    </main>
  );
}
