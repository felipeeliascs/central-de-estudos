import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlashcardPanel } from "../src/FlashcardPanel";
import { demoData, demoUser } from "../src/demo";
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("cria baralho e cartão, revela o verso e mantém a avaliação ao reabrir", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const user = userEvent.setup();
  const panel = () =>
    render(
      <FlashcardPanel
        nodes={demoData().nodes}
        user={demoUser}
        demo
        close={() => {}}
      />,
    );
  const screen1 = panel();
  await user.click(await screen.findByRole("button", { name: "Novo baralho" }));
  await user.type(screen.getByLabelText("Título"), "Meu baralho");
  await user.click(screen.getByRole("button", { name: "Salvar baralho" }));
  await user.click(await screen.findByRole("button", { name: "Novo cartão" }));
  await user.type(
    screen.getByLabelText("Frente", { exact: true }),
    "Minha pergunta",
  );
  await user.type(
    screen.getByLabelText("Verso", { exact: true }),
    "Minha resposta",
  );
  await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
  await screen.findByRole("status", { name: "" });
  await user.click(screen.getByRole("button", { name: "Revisar" }));
  expect(screen.queryByText("Minha resposta")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Revelar verso" }));
  expect(screen.getByText("Minha resposta")).toBeTruthy();
  const button = within(screen.getByRole("article")).getByRole("button", {
    name: /Bom ·/,
  });
  await user.click(button);
  await screen.findByText("Avaliação registrada.");
  screen1.unmount();
  panel();
  await screen.findByText(/revisões hoje/);
  expect(screen.getByText(/revisões hoje/).textContent).toContain(
    "1 revisões hoje",
  );
});
