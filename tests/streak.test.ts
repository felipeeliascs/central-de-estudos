import { expect, it } from "vitest";
import { calculateStreak } from "../src/streak";
it("deduplica atividades do mesmo dia e usa o dia de São Paulo na virada UTC",()=>{
  const result=calculateStreak(["2026-11-26T15:00:00Z","2026-11-27T17:00:00Z","2026-11-28T00:30:00Z"],new Date("2026-11-28T01:00:00Z"));
  expect(result).toMatchObject({current:2,best:2,studied_today:true,last_day:"2026-11-27"});
});
it("mantém a sequência de ontem enquanto hoje está em aberto, mas interrompe após uma lacuna",()=>{
  expect(calculateStreak(["2026-11-25T15:00:00Z","2026-11-26T15:00:00Z"],new Date("2026-11-27T18:00:00Z")).current).toBe(2);
  const result=calculateStreak(["2026-11-25T15:00:00Z"],new Date("2026-11-27T18:00:00Z"));
  expect(result.current).toBe(0);expect(result.best).toBe(1);
});
it("não inventa sequência sem atividade e ignora datas futuras ou inválidas",()=>{
  expect(calculateStreak([],new Date("2026-11-27T18:00:00Z")).current).toBe(0);
  expect(calculateStreak(["inválido","2026-11-28T18:00:00Z"],new Date("2026-11-27T18:00:00Z")).current).toBe(0);
});
