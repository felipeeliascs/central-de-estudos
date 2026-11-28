import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePage } from "../src/ProfilePage";

const calls = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock("../src/repository", () => ({
  supabase: {
    rpc: calls.rpc,
    auth: { getUser: calls.getUser, updateUser: calls.updateUser },
    from: () => calls,
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  calls.rpc.mockImplementation(async (name: string) => ({ data: name === "study_my_billing_summary" ? { access: "free", charging_enabled: false, integration: "not_configured", subscription: null } : null, error: null }));
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
  await user.click(screen.getByRole("button", { name: "Salvar dados" }));
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Dados da conta atualizados.",
  );
  expect(calls.update).toHaveBeenCalledWith({
    display_name: "Nome atualizado", username: "", phone: "",
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

it("salva usuário e telefone privados e registra solicitação confirmada de exclusão", async () => {
  const user = userEvent.setup();
  render(<ProfilePage userId="me" demo={false} onBack={vi.fn()} />);
  await screen.findByText("user@example.test");
  await user.click(screen.getByText("Dados da conta"));
  await user.type(screen.getByLabelText("Usuário"), "estudante.teste");
  await user.type(screen.getByLabelText("Telefone"), "11999999999");
  await user.click(screen.getByRole("button", { name: "Salvar dados" }));
  expect(calls.update).toHaveBeenCalledWith({ display_name: "Nome inicial", username: "estudante.teste", phone: "11999999999" });
  await user.click(screen.getByText("Excluir minha conta"));
  await user.click(screen.getByLabelText("Confirmo que desejo solicitar a exclusão da minha conta."));
  await user.click(screen.getByRole("button", { name: "Solicitar exclusão ao administrador" }));
  await screen.findByText(/Solicitação enviada ao administrador/);
  expect(calls.rpc).toHaveBeenCalledWith("study_request_account_deletion", { request_reason: "" });
  await user.click(screen.getByRole("button", { name: "Cancelar solicitação" }));
  await screen.findByText("Solicitação cancelada.");
  expect(calls.rpc).toHaveBeenCalledWith("study_cancel_account_deletion");
});

it("recusa foto com formato inválido antes de alterar o perfil", async () => {
  const user = userEvent.setup({ applyAccept: false });
  render(<ProfilePage userId="me" demo={false} onBack={vi.fn()} />);
  await screen.findByText("user@example.test");
  await user.click(screen.getByText("Foto e descrição"));
  await user.upload(screen.getByLabelText("Foto do perfil"), new File(["imagem fictícia"], "foto.gif", { type: "image/gif" }));
  await user.click(screen.getByRole("button", { name: "Salvar foto e descrição" }));
  expect((await screen.findByRole("alert")).textContent).toContain("PNG, JPEG ou WebP de até 2 MB");
  expect(calls.update).not.toHaveBeenCalled();
});
