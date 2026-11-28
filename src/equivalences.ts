export type ReviewedEquivalence = { first_topic: string; second_topic: string; coverage?: string; review_notes?: string };
export function fullEquivalencePairs(rows: ReviewedEquivalence[]): [string,string][] {
  return rows.filter(r=>r.coverage==="full" && !!r.review_notes?.trim() && r.first_topic!==r.second_topic).map(r=>[r.first_topic,r.second_topic]);
}
// Only a directly reviewed pair applies. A→B and B→C do not silently establish A→C.
export function equivalentEvidenceIds(id: string,pairs: [string,string][]) {
  return new Set([id,...pairs.filter(pair=>pair.includes(id)).flatMap(pair=>pair)]);
}
