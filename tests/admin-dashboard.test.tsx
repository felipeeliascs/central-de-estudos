import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), admin: false }));
vi.mock("../src/repository", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("../src/AuthGate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (repo: unknown, logout: unknown) => unknown;
  }) =>
    children(
      {
        user: "test-user",
        demo: false,
        load: async () => ({ nodes: [], materials: [], checks: [], notes: [] }),
        members: async () => [],
      },
      vi.fn(),
    ),
}));
vi.mock("../src/planner-data", () => ({
  readPlan: async () => ({ state: { blocks: [] } }),
}));
vi.mock("../src/flashcard-data", () => ({ countDueReviews: async () => 0 }));

const pending = "pending@example.test";

beforeEach(() => {
  mock.admin = false;
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string) => {
    if (name === "study_catalog_admin") return { data: mock.admin };
    if (name === "study_admin_overview") {
      return {
        data: {
          accounts: 1,
          confirmed: 1,
          administrators: 1,
          pending: 1,
          users: [
            {
              id: "test-user",
              display_name: "Pessoa administradora",
              email: "admin@example.test",
              role: "admin",
              confirmed: true,
            },
          ],
          authorizations: [
            {
              email: pending,
              expires_at: "2026-12-14T18:30:00Z",
              used: false,
              active: true,
            },
          ],
        },
      };
    }
    return { data: true };
  });
});
afterEach(cleanup);

it("mostra Administração apenas ao admin e mantém os mesmos módulos de estudo", async () => {
  const renderStudent = render(<App />);
  await waitFor(() =>
    expect(mock.rpc).toHaveBeenCalledWith("study_catalog_admin"),
  );
  const studentNav = within(
    screen.getByRole("navigation", { name: "Módulos principais" }),
  );
  expect(
    studentNav.queryByRole("button", { name: "Administração" }),
  ).toBeNull();
  const studentModules = studentNav
    .getAllByRole("button")
    .map((element) => element.textContent);
  renderStudent.unmount();

  mock.admin = true;
  const user = userEvent.setup();
  render(<App />);
  const adminNav = within(
    screen.getByRole("navigation", { name: "Módulos principais" }),
  );
  const adminLink = await adminNav.findByRole("button", {
    name: "Administração",
  });
  expect(
    adminNav
      .getAllByRole("button")
      .filter((element) => element !== adminLink)
      .map((element) => element.textContent),
  ).toEqual(studentModules);
  await user.click(adminLink);
  expect(await screen.findByText("Pessoa administradora")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Concursos e editais" }),
  ).toBeTruthy();
});

it("autoriza cadastro e pede confirmação antes de revogar uma autorização", async () => {
  mock.admin = true;
  const originalShow = HTMLDialogElement.prototype.showModal;
  const originalClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  try {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Administração" }),
    );
    await user.type(
      await screen.findByLabelText("E-mail", { exact: true }),
      "next@example.test",
    );
    await user.click(
      screen.getByRole("button", { name: "Autorizar cadastro" }),
    );
    expect(await screen.findByText(/Cadastro autorizado/)).toBeTruthy();
    expect(mock.rpc).toHaveBeenCalledWith("study_admin_allow_signup", {
      address: "next@example.test",
      valid_days: 7,
    });
    await user.click(
      await screen.findByRole("button", {
        name: `Revogar autorização de ${pending}`,
      }),
    );
    expect(mock.rpc).not.toHaveBeenCalledWith("study_admin_revoke_signup", {
      address: pending,
    });
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirmar revogação",
      }),
    );
    expect(await screen.findByText("Autorização revogada.")).toBeTruthy();
    expect(mock.rpc).toHaveBeenCalledWith("study_admin_revoke_signup", {
      address: pending,
    });
  } finally {
    cleanup();
    HTMLDialogElement.prototype.showModal = originalShow;
    HTMLDialogElement.prototype.close = originalClose;
  }
});
