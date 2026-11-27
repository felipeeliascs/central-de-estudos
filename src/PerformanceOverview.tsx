import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { readPractice } from "./productivity-data";
import { localDay } from "./productivity";

export type PracticePoint = { day: string; answered: number; correct: number };
export function PracticeDashboard({ points, compact = false }: { points: PracticePoint[]; compact?: boolean }) {
  const answered = points.reduce((sum, p) => sum + p.answered, 0);
  const correct = points.reduce((sum, p) => sum + p.correct, 0);
  const errors = answered - correct;
  const rate = answered ? Math.round(correct / answered * 100) : null;
  const max = Math.max(1, ...points.map(p => p.answered));
  return <div className={compact ? "practice-summary compact" : "practice-summary"}>
    <div className="practice-metrics">
      {([
        ["Questões resolvidas", answered, CircleHelp, "neutral"],
        ["Taxa de acerto", rate === null ? "Sem dados" : rate + "%", BarChart3, "accent"],
        ["Acertos", correct, CheckCircle2, "success"],
        ["Erros", errors, XCircle, "error"],
      ] as const).map(([label, value, Icon, tone]) => <div className={"metric-card " + tone} key={label}>
        <span className="metric-icon"><Icon size={20} aria-hidden="true" /></span>
        <div><span>{label}</span><strong>{value}</strong></div>
      </div>)}
    </div>
    {!compact && <div className="practice-charts">
      <section className="chart-card"><h3>Questões resolvidas por dia</h3><p>Evolução da prática no período selecionado.</p>
        {answered ? <><div className="question-bars" aria-hidden="true">{points.map(p => <div key={p.day} title={p.day + ": " + p.answered}><span style={{ height: (p.answered / max * 100) + "%" }} /><small>{p.day.slice(5).split("-").reverse().join("/")}</small></div>)}</div>
          <details><summary>Consultar valores do gráfico</summary><ul>{points.map(p => <li key={p.day}>{p.day}: {p.answered} questões · {p.correct} acertos</li>)}</ul></details></> :
          <div className="chart-empty"><BarChart3 size={25} /><strong>Dados insuficientes</strong><p>Resolva questões para visualizar o histórico.</p></div>}
      </section>
      <section className="chart-card"><h3>Distribuição</h3><p>Acertos e erros no período selecionado.</p>
        <div className="distribution-ring" role="img" aria-label={answered + " questões, " + correct + " acertos e " + errors + " erros"} style={{ background: answered ? "conic-gradient(var(--success) 0 " + (correct / answered * 100) + "%, var(--danger-color) 0 100%)" : "var(--soft-surface)" }}><div><strong>{answered}</strong><small>Questões</small></div></div>
        <p className="distribution-legend"><span>{correct} certas</span><span>{errors} erradas</span></p>
      </section>
    </div>}
  </div>;
}

export function HomePerformance({ user, demo, open }: { user: string; demo: boolean; open: () => void }) {
  const [points, setPoints] = useState<PracticePoint[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    readPractice(user, demo).then(data => {
      if (!active) return;
      const today = localDay(new Date());
      const results = data.results.filter(r => localDay(new Date(r.recorded_at)) === today);
      const answers = data.answers.filter(a => localDay(new Date(a.created_at)) === today);
      setPoints([{ day: today, answered: results.reduce((sum, r) => sum + r.answered, 0) + answers.length, correct: results.reduce((sum, r) => sum + r.correct, 0) + answers.filter(a => a.correct).length }]);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user, demo]);
  return <section className="home-performance" aria-label="Resumo do desempenho de hoje">
    <div className="section-heading"><div><h2>Seu desempenho de hoje</h2><p>Um resumo da sua prática de questões.</p></div><button className="text-button" onClick={open}>Ver desempenho completo →</button></div>
    {error ? <p role="alert">Não foi possível carregar o desempenho.</p> : points ? <PracticeDashboard points={points} compact /> : <p role="status">Carregando desempenho…</p>}
  </section>;
}
