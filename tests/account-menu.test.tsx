import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../src/streak-data",()=>({readStreak:async()=>({current:3,best:5,studied_today:true,last_day:"2026-11-27",active_days:["2026-11-27"]})}));
import { AccountMenu } from "../src/AccountMenu";
afterEach(cleanup);
it("abre menu, navega, alterna tema e fecha com Escape ou clique externo",async()=>{
  const user=userEvent.setup(), navigate=vi.fn(),theme=vi.fn();
  render(<AccountMenu user="demo" demo theme="light" toggleTheme={theme} navigate={navigate} logout={vi.fn()} refreshKey="1"/>);
  const trigger=screen.getByRole("button",{name:"Abrir menu da conta"});
  await user.click(trigger);
  await screen.findByRole("menu",{name:"Menu da conta"});
  await screen.findByText("3 dias seguidos estudados");
  await user.click(screen.getByRole("menuitemcheckbox",{name:"Modo noturno"}));
  expect(theme).toHaveBeenCalledOnce();
  await user.keyboard("{Escape}");expect(screen.queryByRole("menu")).toBeNull();expect(document.activeElement).toBe(trigger);
  await user.click(trigger);await user.click(screen.getByRole("menuitem",{name:"Minhas trilhas"}));
  expect(navigate).toHaveBeenCalledWith("trails");expect(screen.queryByRole("menu")).toBeNull();
  await user.click(trigger);await user.click(document.body);expect(screen.queryByRole("menu")).toBeNull();
});
it("mantém erro recuperável ao falhar a saída e permite tentar novamente",async()=>{
  const user=userEvent.setup(),logout=vi.fn().mockRejectedValueOnce(new Error("Falha ao sair")).mockResolvedValue(undefined);
  render(<AccountMenu user="demo" demo theme="light" toggleTheme={vi.fn()} navigate={vi.fn()} logout={logout} refreshKey="1"/>);
  await user.click(screen.getByRole("button",{name:"Abrir menu da conta"}));
  await user.click(screen.getByRole("menuitem",{name:"Sair"}));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("menuitem",{name:"Sair"}));
  expect(logout).toHaveBeenCalledTimes(2);expect(screen.queryByRole("menu")).toBeNull();
});
