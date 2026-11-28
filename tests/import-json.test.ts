import { expect, it } from "vitest";
import { parseImportJson, jsonSyntaxMessage } from "../src/import-json";
import { parseContest } from "../src/contest-schema";
import { previewVideoBatch } from "../src/video-batch";
import { videoBase, validVideoBatch } from "./video-fixture";

it.each(['texto {"type":"contest"}', '{"type":"contest"} texto', '{"x":1} {"x":2}', '```json\n{}\n```', '{"x":}', '{"x":1,}', '{\n"x":1'])("recusa entrada malformada sem extração silenciosa: %s", raw => {
 expect(()=>parseImportJson(raw)).toThrow(/\$: sintaxe JSON inválida/);
 expect(()=>parseContest(raw)).toThrow(/\$: sintaxe JSON inválida/);
 expect(()=>previewVideoBatch(raw,videoBase)).toThrow(/\$: sintaxe JSON inválida/);
});
it("traduz posições conhecidas, inclusive conteúdo extra depois de um número",()=>{
 expect(jsonSyntaxMessage(new SyntaxError("Unexpected non-whitespace character after JSON at position 5 (line 1 column 6)"),"12345x")).toContain("linha 1, coluna 6");
 expect(jsonSyntaxMessage(new SyntaxError("Unexpected non-whitespace character after JSON at position 2 (line 2 column 1)"),"1\nx")).toContain("linha 2, coluna 1");
 expect(jsonSyntaxMessage(new SyntaxError("Unexpected end of JSON input"),'{\n')).toContain("linha 2, coluna 1");
 expect(()=>parseImportJson("1\nx")).toThrow(/conteúdo extra/);
});
it("aceita BOM e espaços e mantém limite de tamanho",()=>{
 expect(parseImportJson("\uFEFF \n"+JSON.stringify(validVideoBatch))).toEqual(validVideoBatch);
 expect(()=>parseImportJson(" ".repeat(512*1024+1))).toThrow(/512 KiB/);
});
it("preserva 180 caracteres e aponta o índice original da aula com título longo",()=>{
 const long={...validVideoBatch,resources:validVideoBatch.resources.map((r,i)=>({...r,title:i===29?"a".repeat(181):"a".repeat(180)}))};
 const result=previewVideoBatch(JSON.stringify(long),videoBase);
 expect(result.valid).toBe(false);
 expect(result.rows[29].status).toContain("$.resources[29].title: esperado texto de 1 a 180 caracteres");
 expect(result.rows.filter(r=>r.error)).toHaveLength(1);
 expect(()=>parseContest(JSON.stringify({...videoBase,resources:long.resources}))).toThrow(/resources\[29\]\.title/);
});
