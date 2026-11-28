import { expect, it } from "vitest";
import sample from "../examples/concurso-ficticio.json";
import batch from "../examples/videoaulas-ficticias.json";
import { parseContest } from "../src/contest-schema";
import { previewVideoBatch } from "../src/video-batch";
const base = parseContest(JSON.stringify(sample));
it("vincula aos IDs externos e preserva recursos na reimportação e em URLs equivalentes", () => {
  const first = previewVideoBatch(JSON.stringify(batch), base);
  expect(first.valid).toBe(true);
  expect(first.doc.resources).toHaveLength(base.resources.length + 1);
  const second = previewVideoBatch(JSON.stringify(batch), first.doc);
  expect(second.doc).toEqual(first.doc);
  expect(second.rows[0].status).toContain("Duplicata");
  const alternate = { ...batch, resources: [{ ...batch.resources[0], id: "outro-id", url: "https://youtu.be/abcdefghijl?t=10" }] };
  expect(previewVideoBatch(JSON.stringify(alternate), first.doc).doc).toEqual(first.doc);
});
it("mostra referências inválidas, conflitos de ID e duplicatas sem permitir gravação", () => {
  const invalid = { ...batch, resources: [...batch.resources, { ...batch.resources[0], id: "invalido", item: "uuid-da-biblioteca" }, { ...batch.resources[0], id: "v01" }] };
  const result = previewVideoBatch(JSON.stringify(invalid), base);
  expect(result.valid).toBe(false);
  expect(result.rows.filter(r => r.error)).toHaveLength(2);
  expect(base.resources).toHaveLength(sample.resources.length);
});
it("rejeita destino diferente, recurso que não é vídeo e vínculo arquivado", () => {
  expect(() => previewVideoBatch(JSON.stringify({ ...batch, contest_id: "outro" }), base)).toThrow(/destino/);
  expect(previewVideoBatch(JSON.stringify({ ...batch, resources: [{ ...batch.resources[0], kind: "material" }] }), base).valid).toBe(false);
  const archived = { ...base, items: base.items.map(x => ({ ...x, archived: x.id === "d01" })) };
  expect(previewVideoBatch(JSON.stringify(batch), archived).valid).toBe(false);
});

import { videoBase, validVideoBatch, conflictingVideoBatch, oldVideoId } from "./video-fixture";
it("reproduz o conflito de Planejamento Reverso e aceita 31 vínculos com novo ID",()=>{
 const before=structuredClone(videoBase);
 const bad=previewVideoBatch(JSON.stringify(conflictingVideoBatch),videoBase);
 expect(bad.valid).toBe(false);
 expect(bad.rows.filter(r=>r.error)).toHaveLength(1);
 expect(bad.rows[9].id).toBe(oldVideoId);
 expect(bad.rows[9].status).toContain("outro vínculo ou vídeo");
 const good=previewVideoBatch(JSON.stringify(validVideoBatch),videoBase);
 expect(good.valid).toBe(true);
 expect(good.rows).toHaveLength(31);
 expect(good.doc.resources).toHaveLength(32);
 expect(good.doc.resources.find(r=>r.id===oldVideoId)?.url).toContain("plL98oaMLsU");
 expect(previewVideoBatch(JSON.stringify(validVideoBatch),good.doc).doc).toEqual(good.doc);
 expect(videoBase).toEqual(before);
});
