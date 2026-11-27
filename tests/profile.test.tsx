import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePage } from "../src/ProfilePage";

const calls = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock("../src/repository", () => ({
  supabase: {
    auth: { getUser: calls.getUser, updateUser: calls.updateUser },
    from: () => calls,
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  calls.getUser.mockResolvedValue({
    data: { user: { id: "me", email: "user@example.test" } },
    error: null,
  });
  calls.select.mockReturnValue(calls);
  calls.update.mockReturnValue(calls);
  calls.eq.mockReturnValue(calls);
  calls.single.mockResolvedValue({
    data: { display_name: "Nome inicial" },
    error: null,
  });
});

afterEach(cleanup);

it("exibe o e-mail da sessão e salva o nome no perfil da própria conta", async () => {
  const user = userEvent.setup();
  render(<ProfilePage userId="me" demo={false} onBack={vi.fn()} />);
  await screen.findByText("user@example.test");
  await user.click(screen.getByText("Dados da conta"));
  const name = screen.getByLabelText<HTMLInputElement>("Nome de exibição");
  await user.clear(name);
  await user.type(name, "Nome atualizado");
  await user.click(screen.getByRole("button", { name: "Salvar nome" }));
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Nome atualizado.",
  );
  expect(calls.update).toHaveBeenCalledWith({
    display_name: "Nome atualizado",
  });
  expect(calls.eq).toHaveBeenLastCalledWith("user_id", "me");
});

it("valida a confirmação, informa quando a senha atual falha e só anuncia sucesso após resposta do Supabase", async () => {
  const user = userEvent.setup();
  calls.updateUser
    .mockResolvedValueOnce({ error: { code: "invalid_credentials" } })
    .mockResolvedValueOnce({ error: null });
  render(<ProfilePage userId="me" demo={false} onBack={vi.fn()} />);
  await user.click(await screen.findByText("Senha e segurança"));
  const old = screen.getByLabelText<HTMLInputElement>("Senha atual");
  const next = screen.getByLabelText<HTMLInputElement>("Nova senha", {
    exact: true,
  });
  const confirmation = screen.getByLabelText<HTMLInputElement>(
    "Confirme a nova senha",
  );
  const save = screen.getByRole("button", { name: "Trocar senha" });
  await user.type(old, "senha-anterior");
  await user.type(next, "senha-nova-segura");
  await user.type(confirmation, "senha-diferente");
  await user.click(save);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "A confirmação deve ser igual à nova senha.",
  );
  expect(calls.updateUser).not.toHaveBeenCalled();
  await user.clear(confirmation);
  await user.type(confirmation, "senha-nova-segura");
  await user.click(save);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "A senha atual está incorreta.",
  );
  expect(calls.updateUser).toHaveBeenCalledWith({
    current_password: "senha-anterior",
    password: "senha-nova-segura",
  });
  await user.click(save);
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Senha atualizada. Use a nova senha no próximo acesso.",
  );
  expect([old.value, next.value, confirmation.value]).toEqual(["", "", ""]);
});

it("oferece saída no perfil e exibe falha recuperável", async () => {
  const user = userEvent.setup();
  const logout = vi.fn().mockRejectedValueOnce(new Error("Falha ao sair")).mockResolvedValue(undefined);
  render(<ProfilePage userId="me" demo={false} onBack={vi.fn()} onLogout={logout} />);
  await user.click(screen.getByRole("button", { name: "Sair da conta" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Falha ao sair");
  await user.click(screen.getByRole("button", { name: "Sair da conta" }));
  expect(logout).toHaveBeenCalledTimes(2);
});
