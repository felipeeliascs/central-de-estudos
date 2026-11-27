import { parseImportJson } from "./import-json";
import { parseContest, type ContestDocument, type Resource } from "./contest-schema";
import { youtubeId } from "./domain";

export const videoBatchContract = 'video_batch 1.0: objeto com exatamente schema_version:"1.0", type:"video_batch", contest_id (ID externo do concurso exportado), resources[]. Cada recurso exige id estável, item (ID externo exato do assunto/subassunto no edital), kind:"video", title e url HTTPS de vídeo do YouTube; opcionais author, edition, text, sources. Não use UUID de sessão, nomes de assunto ou IDs inventados. Não envie items nem o edital inteiro. title deve ter de 1 a 180 caracteres; author, edition e sources[].title também têm limite de 180. Preserve o ID do recurso ao reaproveitar o mesmo vídeo e vínculo. Se trocar o vídeo ou o vínculo, use um novo ID único, sem sobrescrever IDs existentes.';
export type VideoBatch = { schema_version: "1.0"; type: "video_batch"; contest_id: string; resources: Resource[] };
export type VideoRow = { id: string; title: string; item: string; status: string; error: boolean };
export function previewVideoBatch(raw: string, base: ContestDocument) {
  const batch = parseImportJson(raw) as VideoBatch;
  if (!batch || batch.schema_version !== "1.0" || batch.type !== "video_batch" ||
      batch.contest_id !== base.id || Object.keys(batch).some(k => !["schema_version", "type", "contest_id", "resources"].includes(k)) ||
      !Array.isArray(batch.resources) || !batch.resources.length || batch.resources.length > 2000)
    throw new Error("Lote inválido ou ID do concurso diferente do destino.");
  if (base.archived) throw new Error("Reative o concurso antes de importar aulas.");
  const resources = [...base.resources];
  const seen = new Set<string>();
  const rows: VideoRow[] = batch.resources.map((r, index) => {
    try {
      if (!r || r.kind !== "video" || r.archived !== undefined) throw new Error("Use apenas videoaulas sem arquivamento no lote.");
      parseContest(JSON.stringify({ ...base, resources: [r] }));
      if (seen.has(r.id)) throw new Error("ID repetido no lote.");
      seen.add(r.id);
      let item = base.items.find(x => x.id === r.item);
      const label = item?.name ?? r.item;
      while (item) {
        if (item.archived) throw new Error("Assunto ou disciplina arquivado.");
        item = base.items.find(x => x.id === item?.parent);
      }
      const prior = resources.find(x => x.id === r.id);
      if (prior && (prior.kind !== "video" || prior.item !== r.item || youtubeId(prior.url ?? "") !== youtubeId(r.url ?? "")))
        throw new Error(`$.resources[${index}].id: ID já usado com outro vínculo ou vídeo. Use outro ID.`);
      const duplicate = resources.find(x => x.kind === "video" && x.item === r.item && youtubeId(x.url ?? "") === youtubeId(r.url ?? ""));
      if (duplicate?.archived) throw new Error("Aula arquivada; revise no editor do catálogo.");
      if (!duplicate) resources.push(r);
      return { id: r.id, title: r.title, item: label + " (" + r.item + ")", status: duplicate ? "Duplicata · preservada" : "Nova · vinculada", error: false };
    } catch (error) {
      return { id: typeof r?.id === "string" ? r.id : String(index), title: typeof r?.title === "string" ? r.title : "Recurso inválido", item: typeof r?.item === "string" ? r.item : "", status: (error as Error).message.replace(/\$\.resources\[0\]/g, `$.resources[${index}]`), error: true };
    }
  });
  if (resources.length > 2000) throw new Error("O catálogo aceita até 2.000 recursos.");
  return { batch, rows, valid: rows.every(r => !r.error), doc: { ...base, resources } };
}
