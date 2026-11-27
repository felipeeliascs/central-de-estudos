import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import { PracticeDashboard } from "../src/PerformanceOverview";
import { Modal } from "../src/Forms";
beforeEach(() => {
  localStorage.clear(); history.replaceState(null, "", "/");
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
it("oferece resumo no início e URLs próprias nos caminhos, incluindo navegação do navegador", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Seu desempenho de hoje" });
  await user.click(screen.getByRole("button", { name: "Ver desempenho completo →" }));
  await screen.findByRole("heading", { name: "Meu desempenho", level: 1 });
  expect(location.search).toBe("?page=productivity");
  const paths = within(screen.getByRole("navigation", { name: "Caminho da página" }));
  expect(paths.getByRole("link", { name: "Início" }).getAttribute("href")).toContain("?page=home");
  expect(paths.getByRole("link", { name: "Meu desempenho" }).getAttribute("href")).toContain("?page=productivity");
  await act(async () => { history.replaceState(null, "", "?page=profile"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await screen.findByRole("heading", { name: "Meu perfil", level: 1 });
  expect(location.search).toBe("?page=profile");
});
it("restaura link direto para planejamento", async () => {
  history.replaceState(null, "", "?page=planner");
  render(<App />);
  await screen.findByRole("heading", { name: "Planejamento adaptativo", level: 1 });
  expect(location.search).toBe("?page=planner");
});
it("mostra distribuição documentada e estado vazio sem inventar desempenho", () => {
  const view = render(<PracticeDashboard points={[]} />);
  expect(screen.getByText("Dados insuficientes")).toBeTruthy();
  expect(screen.getByText("Sem dados")).toBeTruthy();
  view.rerender(<PracticeDashboard points={[{ day: "2026-11-27", answered: 10, correct: 7 }]} />);
  expect(screen.getByText("70%")).toBeTruthy();
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain("7 acertos e 3 erros");
});
it("mantém o botão de fechar fora do conteúdo rolável do diálogo", () => {
  const close = vi.fn();
  render(<Modal title="Teste" close={close}><p>Conteúdo extenso</p></Modal>);
  expect(screen.getByRole("button", { name: "Fechar" }).closest(".dialog-scroll")).toBeNull();
  expect(screen.getByText("Conteúdo extenso").closest(".dialog-scroll")).not.toBeNull();
});
