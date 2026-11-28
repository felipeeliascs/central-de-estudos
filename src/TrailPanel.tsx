import { JsonImportWorkbench } from "./JsonImportWorkbench";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Settings2 } from "lucide-react";
import { ModulePage } from "./ModulePage";
import { plannerInputs, readPlan } from "./planner-data";
import { addDays, todayInBrazil, type PlannerInputs } from "./planner";
import { readHistoricalIncidence, type Incidence } from "./productivity-data";
import { readTrail, saveTrail, type SavedTrail } from "./trail-data";
import { buildTrailWeek, parseTrail, topicDone, validateTrailTopics, weekStart, type TrailTopic } from "./trails";
import { safeUrl, type Snapshot } from "./domain";
const sourceLink = (value?: string) => { try { return value ? safeUrl(value) : null; } catch { return null; } };
const weekdays = ["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
const dateLabel = (day: string) => new Date(day+"T12:00:00-03:00").toLocaleDateString("pt-BR",{day:"numeric",month:"long",timeZone:"America/Sao_Paulo"});
export function TrailPanel({ snapshot, user, demo, close, study, prompts }: { snapshot: Snapshot; user: string; demo: boolean; close: () => void; study: (id: string) => void; prompts: () => void }) {
  const [input,setInput] = useState<PlannerInputs | null>(null);
  const [incidence,setIncidence] = useState<Incidence[]>([]);
  const [contest,setContest] = useState("");
  const [saved,setSaved] = useState<SavedTrail | null>(null);
  const [week,setWeek] = useState(() => weekStart(todayInBrazil()));
  const [error,setError] = useState("");
  const [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  const [configuring,setConfiguring] = useState(false);
  const [raw,setRaw] = useState("");
  const [preview,setPreview] = useState<TrailTopic[] | null>(null);
  const [topic,setTopic] = useState("");
  const [requires,setRequires] = useState<string[]>([]);
  const [minutes,setMinutes] = useState(45);
  const [priority,setPriority] = useState<"low"|"medium"|"high">("medium");
  useEffect(() => {
    let active = true;
    Promise.all([plannerInputs(snapshot,user,demo),readHistoricalIncidence(user,demo)]).then(([source,records]) => {
      if (!active) return;
      setInput(source); setIncidence(records);
      setContest(current => source.contests.some(c => c.id === current) ? current : source.contests[0]?.id ?? "");
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  },[snapshot,user,demo]);
  useEffect(() => {
    if (!contest) return;
    let active = true;
    setSaved(null); setPreview(null); setStatus(""); setError("");
    readTrail(user,demo,contest).then(value => { if (active) setSaved(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  },[contest,user,demo]);
  const topics = input?.topics.filter(t => t.contest === contest) ?? [];
  const ids = new Set(topics.map(t => t.id));
  const title = (id: string) => topics.find(t => t.id === id)?.name ?? id;
  const implicit = (entries: TrailTopic[]) => entries.map(item => {
    const parent = snapshot.nodes.find(n => n.id === item.topic_id)?.parent_id;
    return { ...item, requires: [...new Set([...item.requires,...(parent && ids.has(parent) ? [parent] : [])])] };
  });
  const config = saved?.state.config;
  const current = saved?.state.weeks.find(w => w.week === week);
  const sessions = current?.sessions ?? [];
  const completed = sessions.filter(s => s.done).length;
  const percent = sessions.length ? Math.round(completed/sessions.length*100) : 0;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try { await action(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function store(next: SavedTrail["state"]) {
    if (!saved) return;
    setSaved(await saveTrail(user,demo,contest,saved,next));
    setStatus("Trilha salva.");
  }
  function editTopic(id: string) {
    setTopic(id);
    const item = config?.topics.find(t => t.topic_id === id);
    setRequires(item?.requires ?? []); setMinutes(item?.minutes ?? topics.find(t => t.id === id)?.minutes ?? 45); setPriority(item?.estimated_priority ?? "medium");
  }
  return <ModulePage title="Trilha da Semana" close={close} busy={busy}>
    <p className="page-description">Conteúdos em sequência revisável, com prioridade para a incidência histórica documentada. Frequência observada não é probabilidade da próxima prova.</p>
    <div className="trail-toolbar"><label>Concurso<select value={contest} onChange={e => setContest(e.target.value)}><option value="">Selecione</option>{input?.contests.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <button className="secondary" onClick={() => setConfiguring(v => !v)} aria-expanded={configuring}><Settings2 size={17} /> Configurações da Trilha</button>
      <button className="secondary" onClick={prompts}>Preparar prompt de Trilhas</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}{status && <p role="status">{status}</p>}
    {!input && <p role="status">Carregando conteúdos…</p>}
    {input && !input.contests.length && <p>Selecione um concurso em Meus concursos para criar uma trilha.</p>}
    {contest && !saved && !error && <p role="status">Carregando trilha…</p>}
    {saved && config && <>
      {configuring && <section className="trail-settings"><h2>Configurações da trilha</h2>
        <p>Pré-requisitos devem ser concluídos antes dos conteúdos dependentes. O subassunto depende do assunto pai. Outras relações podem ser revisadas aqui ou importadas pelo prompt.</p>
        <form key={config.minutes.join(",")+config.measure} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void run(async () => {
          const availability = weekdays.map((_,i) => Number(form.get("day-"+i)));
          const measure = String(form.get("measure")) as "questions"|"exams";
          await store({ ...saved.state, config: { ...config, minutes: availability, measure } });
        }); }}>
          <div className="availability-grid">{weekdays.map((d,i) => <label key={d}>{d} (min)<input name={"day-"+i} type="number" min={0} max={720} required defaultValue={config.minutes[i]} /></label>)}</div>
          <label>Comparar incidência de<select name="measure" defaultValue={config.measure}><option value="questions">Questões do assunto / questões analisadas</option><option value="exams">Provas com o assunto / provas analisadas</option></select></label>
          <button className="primary" disabled={busy}>Salvar disponibilidade</button>
          <button className="secondary" type="button" disabled={busy} onClick={() => void run(async () => { const plan = await readPlan(user,demo); await store({ ...saved.state, config: { ...config, minutes: plan.state.settings.minutes } }); })}>Usar disponibilidade do Planejamento</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); void run(async () => {
          if (!topic) throw new Error("Selecione um assunto.");
          const entries = implicit([...config.topics.filter(t => t.topic_id !== topic),{ topic_id:topic,requires,minutes,estimated_priority:priority }]);
          validateTrailTopics(entries,ids);
          await store({ ...saved.state,config:{...config,topics:entries} });
        }); }}>
          <h3>Sequência e estimativas</h3>
          <label>Assunto da trilha<select value={topic} onChange={e => editTopic(e.target.value)}><option value="">Selecione</option>{topics.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
          <label>Pré-requisitos (use Ctrl ou Command para selecionar vários)<select multiple value={requires} onChange={e => setRequires([...e.target.selectedOptions].map(o => o.value))}>{topics.filter(t => t.id !== topic).map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
          <label>Minutos estimados<input type="number" min={5} max={480} required value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
          <label>Prioridade estimada sem dados<select value={priority} onChange={e => setPriority(e.target.value as typeof priority)}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label>
          <button className="primary" disabled={busy || !topic}>Salvar sequência</button>
        </form>
        <h3>Importar sugestão do prompt</h3><p>A importação altera apenas a configuração. Sessões concluídas, materiais e progresso são preservados. Gere a semana novamente após conferir as mudanças.</p>
        <label>JSON de Trilhas<textarea rows={8} value={raw} onChange={e => { setRaw(e.target.value); setPreview(null); }} /></label>
        <JsonImportWorkbench raw={raw} onChange={value => {setRaw(value);setPreview(null);setError("");}} accepted={["study_trail"]} context={{contestUuid:contest,nodes:snapshot.nodes}} disabled={busy}/>
        <button className="secondary" onClick={() => { try { const entries=implicit(parseTrail(raw,contest,ids)); validateTrailTopics([...config.topics.filter(t => !entries.some(n => n.topic_id === t.topic_id)),...entries],ids); setPreview(entries); setError(""); } catch(e) { setPreview(null); setError((e as Error).message); } }}>Gerar prévia da trilha</button>
        {preview && <><h4>Prévia da sequência</h4><ul>{preview.map(t => <li key={t.topic_id}>{title(t.topic_id)} · {t.minutes} min · pré-requisitos: {t.requires.map(title).join(", ") || "nenhum"} · prioridade estimada {t.estimated_priority}</li>)}</ul><button className="primary" disabled={busy} onClick={() => void run(async () => { const entries=[...config.topics.filter(t => !preview.some(n => n.topic_id === t.topic_id)),...preview]; validateTrailTopics(entries,ids); await store({ ...saved.state,config:{...config,topics:entries} }); setPreview(null); })}>Confirmar configuração</button></>}
      </section>}
      <div className="trail-week-heading"><button className="secondary" onClick={() => setWeek(addDays(week,-7))}>← Semana anterior</button><span><CalendarDays size={17} /> {dateLabel(week)} – {dateLabel(addDays(week,6))}</span><button className="secondary" onClick={() => setWeek(addDays(week,7))}>Próxima semana →</button></div>
      <h2>Progresso da semana · {percent}%</h2><progress max={100} value={percent} /><p>{completed} {completed === 1 ? "estudo concluído" : "estudos concluídos"} de {sessions.length}</p>
      <p className="muted">A comparação usa a mesma unidade e banca. Sem evidência completa, a ordem usa prioridade estimada e sequência do edital. A amostra e a fonte aparecem em cada sugestão.</p>
      <button className="primary" disabled={busy || week < weekStart(todayInBrazil()) || !topics.length} onClick={() => void run(async () => {
        const allEntries = implicit(topics.map(t => config.topics.find(c => c.topic_id === t.id) ?? { topic_id:t.id,requires:[],minutes:Math.max(5,Math.min(480,t.minutes ?? 45)),estimated_priority:"medium" }));
        const nextConfig = { ...config,topics:allEntries };
        const board = snapshot.nodes.find(n => n.id === contest)?.board ?? "";
        const generated = buildTrailWeek(topics,nextConfig,incidence,board,week,saved.state.weeks,todayInBrazil(),input?.contests.find(c => c.id === contest)?.exam);
        await store({ ...saved.state,config:nextConfig,weeks:[...saved.state.weeks.filter(w => w.week !== week),generated] });
      })}>{current ? "Reorganizar pendências da semana" : "Gerar trilha da semana"}</button>
      {current?.warnings.map(w => <p className="trail-warning" key={w}>{w}</p>)}
      <ol className="trail-timeline">{weekdays.map((label,i) => {
        const day = addDays(week,i), rows = sessions.filter(s => s.day === day);
        return <li key={day} className={day === todayInBrazil() ? "today" : ""}><span className="trail-day-number">{day.slice(-2)}</span><details open={day === todayInBrazil()}><summary><strong>{day === todayInBrazil() ? "Hoje · " : ""}{label}</strong> · {dateLabel(day)}<small>{rows.filter(s => s.done).length} concluídos · {rows.length} estudos</small></summary>
          {rows.length ? rows.map(session => {
            const blocked = (config.topics.find(t => t.topic_id === session.topic_id)?.requires ?? []).some(id => !topicDone(id,topics,saved.state.weeks,config));
            return <article className="trail-session" key={session.id}><CheckCircle2 size={20} /><div><h3>{title(session.topic_id)}</h3><p>{session.minutes} min · {session.done ? "Concluído" : blocked ? "Aguardando pré-requisito" : "Disponível para estudar"}</p><small>{session.reason}</small>{sourceLink(session.source_url) && <a href={sourceLink(session.source_url)!} target="_blank" rel="noreferrer">Fonte da amostra</a>}</div><div className="catalog-actions"><button className="secondary" onClick={() => study(session.topic_id)}>Estudar conteúdo</button><button className="primary" disabled={busy || session.done || blocked || day > todayInBrazil()} onClick={() => void run(async () => {
              const weeks = saved.state.weeks.map(w => w.week !== week ? w : { ...w,sessions:w.sessions.map(s => s.id === session.id ? {...s,done:true,done_at:new Date().toISOString()} : s) });
              await store({...saved.state,weeks});
            })}>Concluir estudo</button></div></article>;
          }) : <p className="trail-free">Dia livre · nenhum estudo programado.</p>}
        </details></li>;
      })}</ol>
    </>}
  </ModulePage>;
}
