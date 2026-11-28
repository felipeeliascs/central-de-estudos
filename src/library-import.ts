import { parseImportJson } from "./import-json";
import { validateMaterial, type Material } from "./domain";
export type LibraryEntry = { id: string; title: string; section: Material["section"]; kind: "text" | "link" | "youtube"; body?: string; back?: string; url?: string; author?: string; work?: string; edition?: string; source?: string; content_version?: string };
export const libraryContract = '{"schema_version":"1.0","type":"library_batch","materials":[{"id":"resumo-id-estavel","title":"Título","section":"Teoria e resumos","kind":"text","body":"Conteúdo","author":"Autor quando documentado","content_version":"1"}]}';
export function materialFromEntry(entry: LibraryEntry, user: string): Material {
  return { id: crypto.randomUUID(), library_key: entry.id, topic_id: "", owner_id: user,
    title: entry.title, section: entry.section, kind: entry.kind, body: entry.body ?? "", back: entry.back ?? "",
    url: entry.url ?? "", author: entry.author ?? "", work: entry.work ?? "", edition: entry.edition ?? "", source: entry.source ?? "",
    content_version: entry.content_version ?? "", file_path: "", visibility: "private", shared_with: [], position: 0, embed: true, verified: false };
}
export function parseLibraryBatch(raw: string): LibraryEntry[] {
  const value = parseImportJson(raw);
  function object(v: unknown, keys: string[], path: string): Record<string,unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(path + ": esperado objeto.");
    for (const key of Object.keys(v)) if (!keys.includes(key)) throw new Error(path+"."+key+": campo desconhecido.");
    return v as Record<string,unknown>;
  }
  const doc = object(value,["schema_version","type","materials"],"$");
  if (doc.schema_version !== "1.0" || doc.type !== "library_batch" || !Array.isArray(doc.materials) || !doc.materials.length || doc.materials.length>300) throw new Error("$: use library_batch 1.0 com 1 a 300 materiais.");
  const ids = new Set<string>();
  return doc.materials.map((row,index) => {
    const path = "$.materials["+index+"]";
    const item = object(row,["id","title","section","kind","body","back","url","author","work","edition","source","content_version"],path);
    for (const key of ["id","title","section","kind"]) if (typeof item[key] !== "string" || !item[key]) throw new Error(path+"."+key+": texto obrigatório.");
    for (const [key,v] of Object.entries(item)) if (typeof v !== "string" || v.length > (["body","back"].includes(key)?100000:["url","source"].includes(key)?2000:key==="content_version"?80:180)) throw new Error(path+"."+key+": texto inválido ou acima do limite.");
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(String(item.id)) || ids.has(String(item.id))) throw new Error(path+".id: ID inválido ou repetido.");
    ids.add(String(item.id));
    if (!["text","link","youtube"].includes(String(item.kind)) || ["Anotações","Progresso e checklist"].includes(String(item.section))) throw new Error(path+": seção ou formato inválido.");
    try { validateMaterial(materialFromEntry(item as LibraryEntry,"")); }
    catch (e) { throw new Error(path+": "+(e as Error).message); }
    return item as LibraryEntry;
  });
}
