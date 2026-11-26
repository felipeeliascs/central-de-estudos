import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import sample from "../examples/concurso-ficticio.json";
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: "saved", error: null }),
}));
vi.mock("../src/repository", () => ({
  supabase: {
    rpc,
    from: () => {
      const response = { data: [], error: null };
      const query = {
        select: () => query,
        like: () => query,
        order: () => query,
        eq: () => query,
        limit: () => Promise.resolve(response),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: typeof response) => void) =>
          Promise.resolve(response).then(resolve),
      };
      return query;
    },
  },
}));
import { ContestPanel } from "../src/ContestPanel";
afterEach(cleanup);
it("exige confirmação após a prévia antes de chamar a gravação", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const user = userEvent.setup();
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <ContestPanel
      nodes={[]}
      editable={new Set()}
      user="a"
      admin
      close={() => {}}
      open={() => {}}
      refresh={refresh}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Importar JSON" }));
  await user.click(screen.getByLabelText("Ou cole o JSON"));
  await user.paste(JSON.stringify(sample));
  await user.click(screen.getByRole("button", { name: "Gerar prévia" }));
  await screen.findByRole("heading", { name: "Prévia de alterações" });
  expect(rpc).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmar e salvar" }));
  await screen.findByText("Concurso salvo.");
  expect(rpc).toHaveBeenCalledWith(
    "study_apply_catalog",
    expect.objectContaining({
      doc: sample,
      expected: null,
      operation: "import",
    }),
  );
  expect(refresh).toHaveBeenCalledOnce();
});
