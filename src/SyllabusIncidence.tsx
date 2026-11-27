import { useEffect, useState } from "react";
import { descendants, type Node } from "./domain";
import { readHistoricalIncidence, type Incidence } from "./productivity-data";
import { incidenceSummary } from "./incidence";

export function SyllabusIncidence({ nodes, root, user, demo }: { nodes: Node[]; root: string; user: string; demo: boolean }) {
  const [rows, setRows] = useState<Incidence[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    readHistoricalIncidence(user, demo).then(value => { if (active) setRows(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user, demo]);
  const ids = new Set([root, ...descendants(nodes, root).map(node => node.id)]);
  const topics = nodes.filter(n => (n.kind === "topic" || n.kind === "subtopic") &&
    ids.has(n.id));
  if (!topics.length) return null;
  return <section aria-label="Incidência histórica por assunto">
    <h2>Incidência histórica</h2>
    <p>Frequência observada na amostra documentada. Não representa probabilidade da próxima prova. A prioridade estimada do planejamento é separada.</p>
    {error ? <p role="alert">Não foi possível consultar incidência. Tente recarregar os dados.</p> : rows === null ?
      <p role="status">Consultando incidência…</p> : <ul>{topics.map(topic => {
        const evidence = rows.filter(r => r.topic_id === topic.id && incidenceSummary(r));
        return <li key={topic.id}><strong>{topic.name}</strong> · {evidence.length ? <ul>{evidence.map(r =>
          <li key={r.board}>{incidenceSummary(r)} · <a href={r.source_url} target="_blank" rel="noreferrer">Fonte da amostra</a></li>)}</ul> : "Sem dados de incidência"}</li>;
      })}</ul>}
  </section>;
}
