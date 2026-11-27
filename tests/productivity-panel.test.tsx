import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductivityPanel } from "../src/ProductivityPanel";
import { demoData, demoUser } from "../src/demo";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("registra uma sessão manual e um resultado externo e os mostra no dashboard", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const user = userEvent.setup();
  render(
    <ProductivityPanel
      snapshot={demoData()}
      user={demoUser}
      demo
      close={() => {}}
    />,
  );
  await screen.findByText("Registrar sessão manual");
  await user.selectOptions(
    screen.getByLabelText("Concurso", { exact: true }),
    "demo-contest",
  );
  await user.selectOptions(
    screen.getByLabelText("Disciplina", { exact: true }),
    "demo-discipline",
  );
  await user.selectOptions(
    screen.getByLabelText("Assunto ou subassunto"),
    "demo-topic",
  );
  await user.click(screen.getByText("Registrar sessão manual"));
  await user.click(screen.getByRole("button", { name: "Salvar sessão" }));
  await screen.findByText("Sessão manual salva.");
  await user.click(screen.getByRole("button", { name: "Questões externas" }));
  await user.clear(screen.getByLabelText("Questões resolvidas"));
  await user.type(screen.getByLabelText("Questões resolvidas"), "10");
  await user.clear(screen.getByLabelText("Acertos"));
  await user.type(screen.getByLabelText("Acertos"), "7");
  await user.click(
    screen.getByRole("button", { name: "Salvar resultado manual" }),
  );
  await screen.findByText("Resultado manual salvo.");
  await user.click(screen.getByRole("button", { name: "Dashboard" }));
  await user.click(screen.getByText("Tempo de estudo, revisões e indicadores detalhados"));
  const dialog = screen.getByRole("region", { name: "Meu desempenho" });
  expect(within(dialog).getByText(/Acertos 7/).textContent).toContain(
    "Erros 3",
  );
  expect(
    within(dialog).getByText(/Horas líquidas no período/).textContent,
  ).toContain("00:30:00");
});
