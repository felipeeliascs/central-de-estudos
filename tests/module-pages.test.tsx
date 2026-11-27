import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("abre os quatro módulos na mesma main e mantém o menu acessível", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Plano de hoje" });
  const main = screen.getByRole("main");
  const nav = within(screen.getByRole("navigation", { name: "Módulos principais" }));
  for (const [menu, title] of [
    ["Meus concursos", "Meus concursos"],
    ["Planejamento", "Planejamento adaptativo"],
    ["Central de Prompts", "Central de Prompts e Inteligência Artificial"],
    ["Desempenho", "Meu desempenho"],
    ["Trilhas", "Trilha da Semana"],
  ]) {
    await user.click(nav.getByRole("button", { name: menu }));
    await within(main).findByRole("heading", { name: title, level: 1 });
    expect(screen.getAllByRole("main")).toEqual([main]);
    expect(main.id).toBe("conteudo");
    expect(main.classList.contains("workspace")).toBe(true);
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(main);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    expect(nav.getByRole("button", { name: menu }).getAttribute("aria-current")).toBe("page");
  }
  await user.click(nav.getByRole("button", { name: "Desempenho" }));
  await within(main).findByText(/Horas líquidas no período/);
  await user.click(nav.getByRole("button", { name: "Início" }));
  await within(main).findByRole("heading", { name: "Plano de hoje" });
  expect(screen.queryByRole("heading", { name: "Meu desempenho" })).toBeNull();
});

it("abre atalhos do Início, volta e entra no edital pela página de concursos", async () => {
  const user = userEvent.setup();
  render(<App />);
  const main = screen.getByRole("main");
  await user.click(await within(main).findByRole("button", { name: "Abrir planejamento →" }));
  await within(main).findByRole("heading", { name: "Planejamento adaptativo", level: 1 });
  await user.click(within(main).getByRole("button", { name: "Voltar" }));
  await within(main).findByRole("heading", { name: "Plano de hoje" });
  const nav = within(screen.getByRole("navigation", { name: "Módulos principais" }));
  await user.click(nav.getByRole("button", { name: "Meus concursos" }));
  await user.click(await within(main).findByRole("button", { name: /^Abrir edital de / }));
  await within(main).findByRole("heading", { name: "Disciplinas do concurso" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
