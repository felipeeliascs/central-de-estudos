import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
beforeEach(() => {
  history.replaceState(null, "", "/");
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("cria, edita, ordena e remove materiais, preservando os dados após reabrir", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(await screen.findByRole("button", { name: "Continuar estudando" }));
  await screen.findByRole("heading", {
    name: "Direitos e garantias fundamentais",
  });
  await user.click(screen.getByRole("tab", { name: "Teoria e resumos" }));
  await user.click(screen.getByRole("button", { name: "Adicionar material" }));
  let dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Título"), "Meu resumo");
  await user.type(
    within(dialog).getByLabelText("Texto"),
    "Minha teoria pessoal",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Salvar material" }),
  );
  await screen.findByRole("heading", { name: "Meu resumo" });
  await user.click(screen.getByLabelText("Ações do material Meu resumo"));
  await user.click(
    screen.getByRole("button", { name: "Mover Meu resumo para cima" }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("article")[0].textContent).toContain(
      "Meu resumo",
    ),
  );
  await user.click(screen.getByLabelText("Ações do material Meu resumo"));
  await user.click(screen.getByRole("button", { name: "Editar Meu resumo" }));
  dialog = screen.getByRole("dialog");
  await user.clear(within(dialog).getByLabelText("Título"));
  await user.type(within(dialog).getByLabelText("Título"), "Resumo revisado");
  await user.click(
    within(dialog).getByRole("button", { name: "Salvar material" }),
  );
  await screen.findByRole("heading", { name: "Resumo revisado" });
  view.unmount();
  history.replaceState(null, "", "/");
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Continuar estudando" }));
  await screen.findByRole("heading", {
    name: "Direitos e garantias fundamentais",
  });
  await user.click(screen.getByRole("tab", { name: "Teoria e resumos" }));
  await screen.findByRole("heading", { name: "Resumo revisado" });
  await user.click(screen.getByLabelText("Ações do material Resumo revisado"));
  await user.click(
    screen.getByRole("button", { name: "Remover Resumo revisado" }),
  );
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Remover material",
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Resumo revisado" }),
    ).toBeNull(),
  );
});
it("salva notas e checklist individual, mostra progresso e fallback do Gran", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(await screen.findByRole("button", { name: "Continuar estudando" }));
  await screen.findByRole("heading", {
    name: "Direitos e garantias fundamentais",
  });
  await user.click(screen.getByRole("tab", { name: "Progresso e checklist" }));
  await user.click(
    screen.getByRole("checkbox", { name: /Assistir à videoaula/ }),
  );
  await screen.findByText("1 de 10 etapas concluídas · inclui subassuntos");
  await user.click(screen.getByRole("tab", { name: "Anotações" }));
  await user.type(
    screen.getByRole("textbox", { name: "Anotações pessoais · somente você" }),
    "Revisar o artigo com calma.",
  );
  await user.click(screen.getByRole("button", { name: "Salvar anotações" }));
  await screen.findByText(/Todas as anotações salvas/);
  view.unmount();
  history.replaceState(null, "", "/");
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Continuar estudando" }));
  await screen.findByRole("heading", {
    name: "Direitos e garantias fundamentais",
  });
  await user.click(screen.getByRole("tab", { name: "Anotações" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Anotações pessoais · somente você",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Revisar o artigo com calma.");
  await user.click(screen.getByRole("tab", { name: "Questões externas" }));
  expect(
    screen
      .getByRole("link", { name: "Abrir Gran Questões" })
      .getAttribute("href"),
  ).toBe("https://questoes.grancursosonline.com.br/");
  expect(screen.getByText(/Nenhum resultado é sincronizado/)).toBeTruthy();
});
it("cadastra um concurso com disciplina, assunto e subassunto", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Continuar estudando" }));
  await screen.findByRole("heading", {
    name: "Direitos e garantias fundamentais",
  });
  await user.click(screen.getByRole("button", { name: "Adicionar concurso" }));
  let dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Nome do concurso"),
    "Meu concurso",
  );
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Meu concurso" }));
  for (const [button, label, name] of [
    ["Disciplina", "Nome da disciplina", "Matemática"],
    ["Assunto", "Nome do assunto", "Álgebra"],
    ["Subassunto", "Nome do subassunto", "Equações"],
  ]) {
    await user.click(screen.getByRole("button", { name: button }));
    dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(label), name);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(
      within(screen.getByRole("navigation", { name: "Concursos, disciplinas e assuntos" })).getByRole("button", {
        name: new RegExp(`^${name}`),
      }),
    );
  }
  await screen.findByRole("heading", { name: "Equações" });
});

it("mostra início, alterna tema e informa ausência de conexão", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Plano de hoje" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Revisões pendentes" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  window.dispatchEvent(new Event("offline"));
  await screen.findByText(/A sincronização offline não está disponível/);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.dispatchEvent(new Event("online"));
});
