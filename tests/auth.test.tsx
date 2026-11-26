import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state = vi.hoisted(() => ({
  event: undefined as
    | undefined
    | ((event: string, session: { user: { id: string } } | null) => void),
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock("../src/repository", () => ({
  supabase: { auth: state.auth },
  demoRepository: () => ({ user: "demo", demo: true }),
  remoteRepository: (id: string) => ({ user: id, demo: false }),
}));
import { AuthGate } from "../src/AuthGate";
beforeEach(() => {
  history.replaceState(null, "", "/");
  state.auth.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
  state.auth.onAuthStateChange.mockImplementation((cb) => {
    state.event = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  for (const method of [
    "signUp",
    "signInWithPassword",
    "resetPasswordForEmail",
    "updateUser",
    "signOut",
  ] as const)
    state.auth[method].mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const gate = () =>
  render(
    <AuthGate>
      {(repo, logout) => (
        <div>
          Conta: {repo.user}
          <button onClick={() => void logout()}>Sair da conta</button>
        </div>
      )}
    </AuthGate>,
  );
it("cadastra sem enviar papel administrativo e pede confirmação por e-mail", async () => {
  const u = userEvent.setup();
  gate();
  await screen.findByRole("button", { name: "Entrar" });
  await u.click(
    screen.getByRole("button", { name: "Cadastrar conta autorizada" }),
  );
  await u.type(screen.getByLabelText("E-mail"), "new@example.test");
  await u.type(screen.getByLabelText("Senha"), "longpassword123");
  await u.click(screen.getByRole("button", { name: "Cadastrar" }));
  await screen.findByRole("status");
  expect(state.auth.signUp).toHaveBeenCalledWith({
    email: "new@example.test",
    password: "longpassword123",
    options: { emailRedirectTo: location.origin + "/" },
  });
});
it("envia recuperação com redirect local e mensagem sem revelar existência de conta", async () => {
  const u = userEvent.setup();
  gate();
  await screen.findByRole("button", { name: "Entrar" });
  await u.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
  await u.type(screen.getByLabelText("E-mail"), "someone@example.test");
  await u.click(screen.getByRole("button", { name: "Enviar instruções" }));
  await screen.findByText(/Se houver uma conta/);
  expect(state.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "someone@example.test",
    { redirectTo: location.origin + "/?flow=recovery" },
  );
});
it("trata recuperação, altera a senha e encerra sessões", async () => {
  const u = userEvent.setup();
  gate();
  await screen.findByRole("button", { name: "Entrar" });
  act(() => state.event!("PASSWORD_RECOVERY", { user: { id: "user-a" } }));
  await u.type(
    screen.getByLabelText("Nova senha", { exact: true }),
    "longpassword123",
  );
  await u.type(
    screen.getByLabelText("Confirmar nova senha"),
    "longpassword123",
  );
  await u.click(screen.getByRole("button", { name: "Salvar nova senha" }));
  await screen.findByText(/Senha alterada. Entre novamente/);
  expect(state.auth.updateUser).toHaveBeenCalledWith({
    password: "longpassword123",
  });
  expect(state.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
});
it("restaura sessão, acompanha renovação e limpa a conta ao sair", async () => {
  const u = userEvent.setup();
  state.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "user-a" } } },
    error: null,
  });
  gate();
  await screen.findByText("Conta: user-a");
  act(() => state.event!("TOKEN_REFRESHED", { user: { id: "user-a" } }));
  await u.click(screen.getByRole("button", { name: "Sair da conta" }));
  await waitFor(() => expect(screen.queryByText("Conta: user-a")).toBeNull());
  expect(state.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
});

it("mostra falha de login sem abrir a conta e aceita nova tentativa", async () => {
  const user = userEvent.setup();
  state.auth.signInWithPassword.mockResolvedValueOnce({
    error: new Error("Falha de rede"),
  });
  gate();
  await user.type(
    await screen.findByLabelText("E-mail"),
    "student@example.test",
  );
  await user.type(screen.getByLabelText("Senha"), "test-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Confira as credenciais e a conexão",
  );
  expect(screen.queryByText(/Conta:/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(state.auth.signInWithPassword).toHaveBeenCalledTimes(2);
  act(() => state.event!("SIGNED_IN", { user: { id: "user-a" } }));
  await screen.findByText("Conta: user-a");
});
