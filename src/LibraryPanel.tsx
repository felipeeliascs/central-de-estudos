import { useMemo, useState, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { ModulePage } from "./ModulePage";
import { LibraryImporter } from "./LibraryImporter";
import { linkedNodes, appliesTo } from "./library";
import { progress, type Material, type Node, type Snapshot } from "./domain";
import type { Repository } from "./repository";

export function LibraryPanel({ snapshot, repo, close, add, edit, renderMaterial, link, study, prompts, refresh }: {
  snapshot: Snapshot; repo: Repository; close: () => void; add: () => void; edit: (m: Material) => void;
  renderMaterial: (m: Material) => ReactNode; link: (m: Material, node: string, active: boolean) => Promise<boolean>;
  study: (id: string) => void; prompts: () => void; refresh: () => Promise<void>;
}) {
  const [search,setSearch] = useState("");
  const [contest,setContest] = useState("");
  const [discipline,setDiscipline] = useState("");
  const [topic,setTopic] = useState("");
  const [author,setAuthor] = useState("");
  const [kind,setKind] = useState("");
  const [importing,setImporting] = useState(false);
  const roots = snapshot.nodes.filter(n => n.kind === "contest");
  const ancestors = (id: string) => { const result: string[] = []; let n = snapshot.nodes.find(n => n.id === id); while(n && !result.includes(n.id)) { result.push(n.id); n = snapshot.nodes.find(p => p.id === n!.parent_id); } return result; };
  const materials = useMemo(() => snapshot.materials.filter(m => !m.catalog_archived), [snapshot.materials]);
  const filtered = materials.filter(m => {
    const bindings = linkedNodes(m,snapshot.materialLinks,repo.user);
    const lineage = bindings.flatMap(ancestors);
    return (!contest || lineage.includes(contest)) && (!discipline || lineage.includes(discipline)) &&
      (!topic || lineage.includes(topic)) && (!author || m.author === author) && (!kind || m.kind === kind) &&
      [m.title,m.body,m.author,m.work,m.edition,m.source,m.section,...bindings.map(id => snapshot.nodes.find(n => n.id === id)?.name)]
        .join(" ").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
  });
  return <ModulePage title="Biblioteca" close={close}>
    <p className="page-description">Seu acervo central. Um material pode apoiar vários concursos e assuntos, com atualização única em todos os vínculos.</p>
    {snapshot.libraryReady === false && <p role="status">O acervo atual está disponível. Novos vínculos e materiais sem concurso exigem a migração 018.</p>}
    <div className="library-toolbar"><label>Buscar no acervo<input type="search" value={search} maxLength={180} onChange={e => setSearch(e.target.value)} placeholder="Título, assunto, autor ou conteúdo" /></label>
      <button className="primary" onClick={add} disabled={snapshot.libraryReady === false}>Adicionar material ao acervo</button>
      <details className="action-menu"><summary>Mais opções</summary><div><button onClick={() => setImporting(v => !v)}>Importar materiais JSON</button><button onClick={prompts}>Gerar conteúdo com prompts</button></div></details>
    </div>
    <details className="library-filters"><summary>Filtros do acervo</summary><div className="catalog-fields">
      <label>Concurso vinculado<select value={contest} onChange={e => setContest(e.target.value)}><option value="">Todos, inclusive sem concurso</option>{roots.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
      <label>Disciplina<select value={discipline} onChange={e => { setDiscipline(e.target.value); setTopic(""); }}><option value="">Todas</option>{snapshot.nodes.filter(n => n.kind === "discipline" && (!contest || ancestors(n.id).includes(contest))).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
      <label>Assunto ou subassunto<select value={topic} onChange={e => setTopic(e.target.value)}><option value="">Todos</option>{snapshot.nodes.filter(n => ["topic","subtopic"].includes(n.kind) && (!discipline || ancestors(n.id).includes(discipline)) && (!contest || ancestors(n.id).includes(contest))).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
      <label>Autor<select value={author} onChange={e => setAuthor(e.target.value)}><option value="">Todos</option>{[...new Set(materials.map(m => m.author).filter(Boolean))].map(a => <option key={a}>{a}</option>)}</select></label>
      <label>Tipo de material<select value={kind} onChange={e => setKind(e.target.value)}><option value="">Todos</option><option value="text">Texto / resumo / anotações</option><option value="youtube">Videoaula</option><option value="pdf">PDF</option><option value="image">Imagem / mapa mental</option><option value="link">Link externo / obra</option></select></label>
    </div></details>
    {importing && <LibraryImporter snapshot={snapshot} repo={repo} refresh={refresh} />}
    <p className="muted">{filtered.length} materiais · apenas conteúdos próprios, do catálogo ou compartilhados com você.</p>
    <ul className="library-list">{filtered.map(m => <LibraryRow key={m.id} m={m} snapshot={snapshot} user={repo.user} edit={edit} renderMaterial={renderMaterial} link={link} study={study} />)}</ul>
    {!filtered.length && <div className="chart-empty"><BookOpen aria-hidden="true" /><p>Nenhum material encontrado. Ajuste os filtros ou adicione uma referência ao acervo.</p></div>}
  </ModulePage>;
}
function LibraryRow({ m, snapshot, user, edit, renderMaterial, link, study }: {
  m: Material; snapshot: Snapshot; user: string; edit: (m: Material) => void;
  renderMaterial: (m: Material) => ReactNode; link: (m: Material, node: string, active: boolean) => Promise<boolean>; study: (id: string) => void;
}) {
  const [target,setTarget] = useState(""); const [busy,setBusy] = useState(false);
  const ids = linkedNodes(m,snapshot.materialLinks,user);
  const path = (node: Node) => { const names = [node.name]; let p = snapshot.nodes.find(n => n.id === node.parent_id); while(p && names.length < 5) { names.unshift(p.name); p=snapshot.nodes.find(n => n.id === p!.parent_id); } return names.join(" / "); };
  return <li><details className="library-row"><summary><span><strong>{m.title}</strong><small>{m.section} · {m.author || "Autor não informado"}{m.edition ? " · " + m.edition : ""}</small></span><span className="catalog-badge">{ids.length} vínculos</span></summary>
    <div className="library-row-content">
      {renderMaterial(m)}
      {m.owner_id === user && !m.catalog_managed && <button className="text-button" onClick={() => edit(m)}>Editar material do acervo</button>}
      <h3>Onde utilizar este material</h3>
      <p className="muted">Vincular não copia o conteúdo. Desvincular não exclui o original. Alterações no material aparecem em todos os vínculos.</p>
      <ul>{ids.map(id => { const n = snapshot.nodes.find(n => n.id === id); return <li key={id}><span>{n ? path(n) : "Conteúdo indisponível"}</span>{n && <button className="text-button" onClick={() => study(id)}>Estudar conteúdo</button>}<button className="text-button" disabled={busy || snapshot.libraryReady === false} onClick={async () => { setBusy(true); await link(m,id,false); setBusy(false); }}>Desvincular material</button></li>; })}</ul>
      <label>Vincular a concurso, disciplina ou assunto<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Selecione um conteúdo</option>{snapshot.nodes.filter(n => !n.catalog_archived && !ids.includes(n.id)).map(n => <option key={n.id} value={n.id}>{path(n)}</option>)}</select></label>
      <button className="secondary" disabled={!target || busy || snapshot.libraryReady === false} onClick={async () => { setBusy(true); if (await link(m,target,true)) setTarget(""); setBusy(false); }}>Vincular material existente</button>
      <details><summary>Conteúdos atendidos e progresso individual</summary><ul>{snapshot.nodes.filter(n => ["topic","subtopic"].includes(n.kind) && appliesTo(m,n.id,snapshot.nodes,snapshot.materialLinks,user)).map(n => <li key={n.id}>{path(n)} · {progress(snapshot.nodes,snapshot.checks,n.id,user).percent}%</li>)}</ul></details>
    </div>
  </details></li>;
}
