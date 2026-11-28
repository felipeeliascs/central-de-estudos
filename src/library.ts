import { safeUrl, youtubeId, type Material, type MaterialLink, type Node } from "./domain";
export function linkedNodes(m: Material, links: MaterialLink[] = [], user: string): string[] {
  const ids = new Set(m.topic_id ? [m.topic_id] : []);
  for (const link of links.filter(l => l.user_id === user && l.material_id === m.id)) {
    if (link.active) ids.add(link.node_id); else ids.delete(link.node_id);
  }
  return [...ids];
}
export function appliesTo(m: Material, selected: string, nodes: Node[], links: MaterialLink[] = [], user: string): boolean {
  const ancestors = new Set<string>(); let n = nodes.find(n => n.id === selected);
  while (n && !ancestors.has(n.id)) { ancestors.add(n.id); n = nodes.find(p => p.id === n!.parent_id); }
  return linkedNodes(m, links, user).some(id => ancestors.has(id));
}
const normalize = (value = "") => value.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");
export function normalizedUrl(value: string) {
  if (!value) return "";
  const video = youtubeId(value); if (video) return "youtube:" + video;
  try { const url = new URL(safeUrl(value)); url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/.test(key)) url.searchParams.delete(key); url.searchParams.sort(); return url.href.replace(/\/$/,""); } catch { return ""; }
}
export function possibleDuplicates(candidate: Material, materials: Material[]) {
  return materials.filter(m => m.id !== candidate.id && (
    (!!candidate.library_key && m.library_key === candidate.library_key) ||
    (!!candidate.url && normalizedUrl(candidate.url) === normalizedUrl(m.url)) ||
    (!!candidate.body.trim() && candidate.kind === m.kind && normalize(candidate.body) === normalize(m.body) && normalize(candidate.back) === normalize(m.back)) ||
    (normalize(candidate.title) === normalize(m.title) && candidate.kind === m.kind &&
      normalize(candidate.author) === normalize(m.author) && normalize(candidate.work) === normalize(m.work) &&
      normalize(candidate.edition) === normalize(m.edition))
  ));
}
export function officialPortal(doc: { sources?: { title: string; url: string }[] }) {
  const source = doc.sources?.find(s => normalize(s.title) === "página oficial do concurso");
  if (!source) return "";
  try { return safeUrl(source.url); } catch { return ""; }
}
