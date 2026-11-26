import { expect, it } from "vitest";
import base from "../examples/concurso-ficticio.json";
import update from "../examples/retificacao-ficticia.json";
import { compareContest, parseContest } from "../src/contest-schema";
const validate = (doc: unknown) => parseContest(JSON.stringify(doc));
it("valida os exemplos e classifica inclusão, edição e arquivamento por ID", () => {
  const original = validate(base),
    revision = validate(update);
  expect(compareContest(original, revision)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "a01", status: "Alterado" }),
      expect.objectContaining({ id: "s01", status: "Arquivado" }),
      expect.objectContaining({ id: "s02", status: "Novo" }),
    ]),
  );
  expect(
    compareContest(original, validate(JSON.parse(JSON.stringify(base)))).every(
      (x) => x.status === "Sem alteração",
    ),
  ).toBe(true);
});
it("rejeita sintaxe, versão, duplicatas, referências e dados de usuário no contrato", () => {
  expect(() => parseContest("{")).toThrow(/sintaxe/);
  expect(() => validate({ ...base, schema_version: "1.1" })).toThrow(
    /schema_version/,
  );
  expect(() =>
    validate({ ...base, items: [...base.items, base.items[0]] }),
  ).toThrow(/duplicado/);
  expect(() =>
    validate({
      ...base,
      resources: [{ ...base.resources[0], item: "inexistente" }],
    }),
  ).toThrow(/item/);
  expect(() => validate({ ...base, user_id: "privado" })).toThrow(
    /desconhecido/,
  );
  expect(() =>
    compareContest(
      validate(base),
      validate({
        ...base,
        items: base.items.filter((x) => x.id !== "s01"),
        resources: base.resources.filter((x) => x.item !== "s01"),
      }),
    ),
  ).toThrow(/arquivar/);
});
