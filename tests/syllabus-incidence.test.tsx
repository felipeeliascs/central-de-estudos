import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../src/productivity-data", () => ({ readHistoricalIncidence: read }));
import { SyllabusIncidence } from "../src/SyllabusIncidence";
import type { Node } from "../src/domain";
const nodes: Node[] = [{ id: "t", parent_id: null, kind: "topic", name: "Assunto fictício", board: "Banca", owner_id: "a", position: 0 }];
afterEach(cleanup);
const show = () => render(<SyllabusIncidence nodes={nodes} root="t" user="a" demo={false} />);
it("mostra ausência de evidência para assunto sem amostra", async () => {
  read.mockResolvedValue([]);
  show();
  await screen.findByText(/Sem dados de incidência/);
  expect(screen.queryByRole("link")).toBeNull();
});
it("exibe denominador, banca, período e fonte sem confundir com probabilidade", async () => {
  read.mockResolvedValue([{ topic_id: "t", board: "Banca fictícia", sample: 20, occurrences: 5, source_url: "https://example.org/provas", period_start: "2020-01-01", period_end: "2025-12-31", measure: "questions" }]);
  show();
  await screen.findByText(/25% das questões/);
  expect(screen.getByText(/25% das questões/).textContent).toContain("5/20 questões");
  expect(screen.getByText(/25% das questões/).textContent).toContain("2020-01-01 a 2025-12-31");
  expect(screen.getByRole("link", { name: "Fonte da amostra" }).getAttribute("href")).toBe("https://example.org/provas");
  expect(screen.getByText(/Não representa probabilidade/)).toBeTruthy();
});
it("diferencia falha de consulta de ausência de dados", async () => {
  read.mockRejectedValue(new Error("Indisponível"));
  show();
  await screen.findByRole("alert");
  expect(screen.queryByText(/Sem dados de incidência/)).toBeNull();
});
