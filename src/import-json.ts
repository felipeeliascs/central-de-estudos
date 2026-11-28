/** Strict JSON shared by file and pasted catalog imports. Never extracts JSON from prose. */
export const maxImportBytes = 512 * 1024;

export function jsonSyntaxMessage(error: unknown, source: string): string {
  const detail = error instanceof Error ? error.message : "";
  const at = /position\s+(\d+)/i.exec(detail);
  const location = /line\s+(\d+)\s+column\s+(\d+)/i.exec(detail);
  const end = /end of (?:JSON|data)|unexpected end|unterminated/i.test(detail);
  const offset = at ? Math.min(Number(at[1]), source.length) : end ? source.length : undefined;
  let line = location ? Number(location[1]) : undefined;
  let column = location ? Number(location[2]) : undefined;
  if (offset !== undefined) {
    const prefix = source.slice(0, offset).split(/\r\n|\r|\n/);
    line = prefix.length;
    column = prefix[prefix.length - 1].length + 1;
  }
  let reason = "Confira aspas duplas, vírgulas, chaves e valores.";
  if (/non-whitespace|after JSON|after the JSON/i.test(detail))
    reason = "Há conteúdo extra após o valor JSON. Envie somente um objeto, sem texto ou outro JSON.";
  else if (/property name|property names|double-quoted/i.test(detail))
    reason = "Use aspas duplas nos nomes dos campos e remova vírgulas finais.";
  else if (/escape|control character/i.test(detail))
    reason = "Há um caractere ou escape inválido dentro de um texto.";
  else if (end)
    reason = "O JSON está incompleto. Confira as aspas, chaves e colchetes de fechamento.";
  else if (/expected.*:|expected.*colon/i.test(detail))
    reason = "Falta dois-pontos entre o nome do campo e seu valor.";
  else if (/expected.*[,}\]]/i.test(detail))
    reason = "Falta uma vírgula ou um fechamento entre os campos ou elementos.";
  else if (/unexpected token|unexpected character|not valid JSON/i.test(detail))
    reason = "Há texto ou caractere inválido. Envie somente JSON, sem introdução ou cercas de código.";
  const position = line !== undefined && column !== undefined ? ` (linha ${line}, coluna ${column})` : "";
  return `$: sintaxe JSON inválida${position}. ${reason}`;
}

export function parseImportJson(raw: string): unknown {
  if (new TextEncoder().encode(raw).length > maxImportBytes)
    throw new Error("$: limite de 512 KiB");
  // A UTF-8 BOM is a file encoding marker, not arbitrary content to extract.
  const source = raw.replace(/^\uFEFF/, "");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(jsonSyntaxMessage(error, source));
  }
}
