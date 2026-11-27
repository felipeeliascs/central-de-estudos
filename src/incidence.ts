import { safeUrl } from "./domain";
import type { Incidence } from "./productivity-data";
export function incidenceSummary(value: Incidence): string | null {
  if (!["exams", "questions"].includes(value.measure ?? "") || !value.board.trim() ||
      !Number.isInteger(value.sample) || value.sample < 1 || !Number.isInteger(value.occurrences) ||
      value.occurrences < 0 || value.occurrences > value.sample ||
      !value.period_start || !value.period_end || value.period_end < value.period_start) return null;
  for (const day of [value.period_start, value.period_end]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
        new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) return null;
  }
  try { safeUrl(value.source_url); } catch { return null; }
  const unit = value.measure === "exams" ? "provas" : "questões";
  return ((value.occurrences / value.sample) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) +
    "% das " + unit + " (" + value.occurrences + "/" + value.sample + " " + unit + ") · " +
    value.board + " · " + value.period_start + " a " + value.period_end;
}
