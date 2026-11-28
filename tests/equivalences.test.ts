import {expect,it} from "vitest";
import {fullEquivalencePairs,equivalentEvidenceIds} from "../src/equivalences";
it("exige comparação integral documentada; títulos parecidos e vínculos parciais não consolidam domínio",()=>{
 expect(fullEquivalencePairs([{first_topic:"a",second_topic:"b",coverage:"partial",review_notes:"Diferença de profundidade"},{first_topic:"a",second_topic:"c",coverage:"full",review_notes:" "},{first_topic:"a",second_topic:"d",coverage:"full",review_notes:"Conteúdo e profundidade integralmente comparados"}])).toEqual([["a","d"]]);
});
it("deduplica os assuntos, sem presumir equivalências transitivas não revisadas",()=>{
 expect([...equivalentEvidenceIds("a",[["a","b"],["b","a"],["b","c"]])]).toEqual(["a","b"]);
 expect([...equivalentEvidenceIds("x",[["a","b"]])]).toEqual(["x"]);
});
