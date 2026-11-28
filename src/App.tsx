import { ActionMenu } from "./ActionMenu";
import { LibraryPanel } from "./LibraryPanel";
import { NoticePage } from "./NoticePage";
import { StudyLibraryLinks } from "./StudyLibraryLinks";
import { appliesTo, linkedNodes } from "./library";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Video,
  Home,
  CalendarDays,
  CircleHelp,
  Layers,
  Library,
  BarChart3,
  UserRound,
  Route as RouteIcon,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  WifiOff,
} from "lucide-react";
import {
  sections,
  steps,
  progress,
  descendants,
  empty,
  granUrl,
  safeUrl,
  youtubeId,
  type Material,
  type Node,
  type Section,
  type Snapshot,
} from "./domain";
import { supabase, type Repository, type Member } from "./repository";
import {
  FeedbackContext,
  MaterialForm,
  Modal,
  NodeForm,
  ShareForm,
} from "./Forms";
import { AuthGate } from "./AuthGate";
import { SyllabusIncidence } from "./SyllabusIncidence";
import { AccountMenu } from "./AccountMenu";
import { HomePerformance } from "./PerformanceOverview";
import { pageHref, readRoute, type Page, type Route } from "./page-navigation";
import { ModulePage } from "./ModulePage";
import { ProfilePage } from "./ProfilePage";
import { AdminDashboard } from "./AdminDashboard";
import { YouTube } from "./YouTube";
import { readPlan } from "./planner-data";
import { todayInBrazil, type Block } from "./planner";
import { countDueReviews } from "./flashcard-data";
const TrailPanel = lazy(() => import("./TrailPanel").then(module => ({ default: module.TrailPanel })));
const ContestPanel = lazy(() =>
  import("./ContestPanel").then((module) => ({ default: module.ContestPanel })),
);
const PlannerPanel = lazy(() =>
  import("./PlannerPanel").then((module) => ({ default: module.PlannerPanel })),
);
const FlashcardPanel = lazy(() =>
  import("./FlashcardPanel").then((module) => ({
    default: module.FlashcardPanel,
  })),
);
const ProductivityPanel = lazy(() =>
  import("./ProductivityPanel").then((module) => ({
    default: module.ProductivityPanel,
  })),
);
const QuestionsPanel = lazy(() =>
  import("./QuestionsPanel").then((module) => ({
    default: module.QuestionsPanel,
  })),
);
const PromptPanel = lazy(() =>
  import("./PromptPanel").then((module) => ({ default: module.PromptPanel })),
);
export default function App() {
  return (
    <AuthGate>
      {(repo, logout) => (
        <Workspace
          key={String(repo.demo) + repo.user}
          repo={repo}
          logout={logout}
        />
      )}
    </AuthGate>
  );
}
function Workspace({
  repo,
  logout,
}: {
  repo: Repository;
  logout: () => Promise<void>;
}) {
  const [home, setHome] = useState(() => readRoute().page === "home");
  const [accountPage, setAccountPage] = useState<"profile" | "admin" | null>(
    readRoute().page === "profile" ? "profile" : readRoute().page === "admin" ? "admin" : null,
  );
  const [incidenceOpen, setIncidenceOpen] = useState(false);
  const [studySession,setStudySession] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("central-theme") || "light",
  );
  const [online, setOnline] = useState(navigator.onLine);
  type Module = "catalog" | "planner" | "prompts" | "productivity" | "trails" | "library" | "notice";
  const [modulePage, setModulePage] = useState<Module | null>(() => {
    const page = readRoute().page;
    return ["catalog", "planner", "prompts", "productivity", "trails", "library", "notice"].includes(page) ? page as Module : null;
  });
  const trailsOpen = modulePage === "trails";
  const plannerOpen = modulePage === "planner";
  const catalogOpen = modulePage === "catalog";
  const promptsOpen = modulePage === "prompts";
  const productivityOpen = modulePage === "productivity";
  function openModule(page: Module | null) {
    setModulePage(page);
    if (page !== "productivity") {
      setStudySession("");
      setExternalMock(false);
      setIncidenceOpen(false);
    }
    if (page) setMobile(false);
  }
  const setPlannerOpen = (open: boolean) => openModule(open ? "planner" : null);
  const setCatalogOpen = (open: boolean) => openModule(open ? "catalog" : null);
  const setPromptsOpen = (open: boolean) => openModule(open ? "prompts" : null);
  const setProductivityOpen = (open: boolean) => {
    openModule(open ? "productivity" : null);
  };
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [todayBlocks, setTodayBlocks] = useState<Block[]>([]);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [homeError, setHomeError] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [reloadOverview, setReloadOverview] = useState(0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("central-theme", theme);
  }, [theme]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!home || modulePage || flashcardsOpen || (!online && !repo.demo))
      return;
    let active = true;
    setOverviewLoading(true);
    setHomeError(false);
    const now = new Date();
    Promise.allSettled([
      readPlan(repo.user, repo.demo),
      countDueReviews(repo.user, repo.demo, now),
    ]).then(([plan, reviews]) => {
      if (!active) return;
      setTodayBlocks(
        plan.status === "fulfilled"
          ? plan.value.state.blocks.filter(
              (block) => block.day === todayInBrazil(now),
            )
          : [],
      );
      setDueCount(reviews.status === "fulfilled" ? reviews.value : null);
      setHomeError(plan.status === "rejected" || reviews.status === "rejected");
      setOverviewLoading(false);
    });
    return () => {
      active = false;
    };
  }, [
    home,
    modulePage,
    flashcardsOpen,
    online,
    repo.user,
    repo.demo,
    reloadOverview,
  ]);
  const [snapshot, setData] = useState<Snapshot>(empty);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<
    "contest" | "cards" | "questions" | null
  >(null);
  const [externalMock, setExternalMock] = useState(false);
  const [trailPrompt, setTrailPrompt] = useState(false);
  const [catalogAdmin, setCatalogAdmin] = useState(false);
  useEffect(() => {
    if (!supabase || repo.demo) return;
    let active = true;
    Promise.resolve(supabase.rpc("study_catalog_admin"))
      .then(({ data, error }) => {
        if (active) setCatalogAdmin(!error && data === true);
      })
      .catch(() => {
        if (active) setCatalogAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [repo.demo, repo.user]);
  const hidden = new Set(
    snapshot.nodes
      .filter((n) => n.catalog_archived || (!repo.demo && n.kind === "contest" && n.catalog_key && !enrolled.has(n.id)))
      .flatMap((n) => [
        n.id,
        ...descendants(snapshot.nodes, n.id).map((child) => child.id),
      ]),
  );
  const data = {
    ...snapshot,
    nodes: snapshot.nodes.filter((n) => !hidden.has(n.id)),
    materials: snapshot.materials.filter(
      (m) => !m.catalog_archived,
    ),
  };
  async function openCatalog(confirmed = false) {
    if (!confirmed && dirty && !window.confirm("Sair sem salvar as anotações?")) return;
    setDirty(false);
    if (!supabase || repo.demo) {
      setCatalogOpen(true);
      return;
    }
    const result = await supabase.rpc("study_catalog_admin");
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCatalogAdmin(result.data === true);
    setCatalogOpen(true);
    setMobile(false);
  }
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState(() => readRoute().item);
  const [section, setSection] = useState<Section>("Videoaulas");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [mobile, setMobile] = useState(false);
  const [materialForm, setMaterialForm] = useState<Material | "new" | null>(
    null,
  );
  const [nodeForm, setNodeForm] = useState<{
    parent?: Node;
    initial?: Node;
  } | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [share, setShare] = useState(false);
  const [fileView, setFileView] = useState<{
    url: string;
    material: Material;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  async function enrollmentIds() {
    if (repo.demo || !supabase) return new Set<string>();
    const result = await supabase.from("study_enrollments").select("contest_id").eq("user_id", repo.user).eq("status", "active");
    if (result.error) throw new Error(result.error.message);
    return new Set<string>((result.data ?? []).map(row => row.contest_id));
  }
  async function refresh() {
    const [next, nextMembers, activeEnrollments] = await Promise.all([
      repo.load(),
      repo.members(),
      enrollmentIds(),
    ]);
    setData(next);
    setMembers(nextMembers);
    setEnrolled(activeEnrollments);
  }
  useEffect(() => {
    let active = true;
    Promise.all([repo.load(), repo.members(), enrollmentIds()])
      .then(([next, ms, activeEnrollments]) => {
        if (active) {
          setData(next);
          setMembers(ms);
          setEnrolled(activeEnrollments);
          setSelected(
            (next.nodes.some(n => n.id === readRoute().item) ? readRoute().item : "") ||
            next.nodes.find((n) => n.kind === "topic")?.id ||
              next.nodes.find((n) => n.kind === "contest")?.id ||
              "",
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Repository identity changes on account switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function run(
    action: () => Promise<void>,
    message = "Alterações salvas.",
  ) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      await refresh();
      setStatus(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const node = data.nodes.find((n) => n.id === selected);
  const chain: Node[] = [];
  let ancestor = node;
  while (ancestor) {
    chain.unshift(ancestor);
    ancestor = data.nodes.find((n) => n.id === ancestor!.parent_id);
  }
  const contest = chain[0];
  const isTopic = node?.kind === "topic" || node?.kind === "subtopic";
  const canEdit = (n: Node) =>
    !contest?.catalog_key &&
    (n.owner_id === repo.user ||
      members.some(
        (m) =>
          m.user_id === repo.user &&
          m.role === "editor" &&
          m.contest_id === (n.kind === "contest" ? n.id : chain[0]?.id),
      ));
  async function linkLibraryMaterial(m: Material, target: string, active: boolean) {
    return run(async () => { if (!repo.linkMaterial || snapshot.libraryReady === false) throw new Error("Vínculos exigem a migração 018."); await repo.linkMaterial(m.id,target,active); }, active ? "Material vinculado, sem cópia." : "Vínculo removido. O material continua no acervo.");
  }
  function openProfile() {
    if (dirty && !window.confirm("Sair sem salvar as anotações?")) return false;
    setDirty(false);
    setMobile(false);
    openModule(null);
    setAccountPage("profile");
  }

  async function navigate(id: string) {
    if (dirty && !window.confirm("Há anotações não salvas. Sair sem salvar?"))
      return;
    setDirty(false);
    try {
      let targetNode = snapshot.nodes.find(n => n.id === id);
      const visited = new Set<string>();
      while(targetNode?.parent_id && !visited.has(targetNode.id)) { visited.add(targetNode.id); targetNode = snapshot.nodes.find(n => n.id === targetNode!.parent_id); }
      if (!repo.demo && supabase && targetNode?.catalog_key && !enrolled.has(targetNode.id) && !targetNode.catalog_archived) {
        const result = await supabase.from("study_enrollments").upsert({ user_id: repo.user,contest_id: targetNode.id,status: "active" },{ onConflict:"user_id,contest_id" });
        if (result.error) throw result.error;
        await refresh();
      }
    } catch(e) { setError((e as Error).message || "Não foi possível selecionar este concurso."); return; }
    setSelected(id);
    openModule(null);
    setAccountPage(null);
    setHome(false);
    setMobile(false);
    setError("");
  }
  useEffect(() => {
    document.getElementById("conteudo")?.focus();
  }, [modulePage, accountPage, home, selected]);

  const currentPage: Page = modulePage ?? accountPage ?? (home ? "home" : "study");
  const [previousHref, setPreviousHref] = useState("");
  const displayedHref = useRef(pageHref(currentPage, selected));
  function followRoute(route: Route) {
    if (route.page === currentPage && (!["study","notice"].includes(route.page) || !route.item || route.item === selected)) return true;
    if (dirty && !window.confirm("Sair sem salvar as anotações?")) return;
    setDirty(false);
    setMobile(false);
    openModule(null);
    setAccountPage(null);
    setHome(route.page === "home");
    if (route.page === "profile" || route.page === "admin") setAccountPage(route.page);
    if (["catalog", "planner", "prompts", "productivity", "trails", "library", "notice"].includes(route.page)) openModule(route.page as Module);
    if (["study","notice"].includes(route.page) && route.item) setSelected(route.item);
    return true;
  }
  useEffect(() => {
    const target = pageHref(currentPage, selected);
    if (displayedHref.current !== target) {
      setPreviousHref(displayedHref.current);
      displayedHref.current = target;
    }
    if (location.pathname + location.search !== target) history.pushState(null, "", target);
  }, [currentPage, selected]);
  useEffect(() => {
    const pop = () => {
      if (!followRoute(readRoute())) history.pushState(null, "", pageHref(currentPage, selected));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
    // The current unsaved-note guard is needed when browser history changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, currentPage, selected]);
  function routeLink(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    followRoute(readRoute(new URL(event.currentTarget.href).search));
  }
  function openStudyResource(page: Module) {
    if (dirty && !window.confirm("Sair sem salvar as anotações?")) return;
    setDirty(false); openModule(page);
  }
  function changeSection(s: Section) {
    if (dirty && !window.confirm("Há anotações não salvas. Sair sem salvar?"))
      return;
    setDirty(false);
    setSection(s);
  }
  const p = node
    ? progress(data.nodes, data.checks, node.id, repo.user)
    : { done: 0, total: 0, percent: 0 };
  const materialScope = new Set([selected, ...descendants(data.nodes, selected).map(n => n.id)]);
  const availableMaterialCount = data.materials.filter(m =>
    appliesTo(m, selected, snapshot.nodes, snapshot.materialLinks, repo.user) ||
    linkedNodes(m, snapshot.materialLinks, repo.user).some(id => materialScope.has(id)),
  ).length;
  const list = data.materials
    .filter((m) => appliesTo(m,selected,snapshot.nodes,snapshot.materialLinks,repo.user) && m.section === section)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  async function openFile(m: Material) {
    setError("");
    try {
      setFileView({ url: await repo.fileUrl(m), material: m });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return data.nodes
      .filter((n) => n.parent_id === parent)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((n) => {
        const matches =
          !search ||
          [n, ...descendants(data.nodes, n.id)].some((x) =>
            x.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          );
        if (!matches) return null;
        return (
          <li key={n.id}>
            <button
              className={`tree-node ${selected === n.id ? "selected" : ""}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => navigate(n.id)}
            >
              {n.kind === "contest" ? (
                <FolderOpen size={17} />
              ) : n.kind === "discipline" ? (
                <BookOpen size={16} />
              ) : (
                <span className="tree-dot" />
              )}
              <span>{n.name}</span>
              {n.kind === "topic" && (
                <small>
                  {progress(data.nodes, data.checks, n.id, repo.user).percent}%
                </small>
              )}
            </button>
            <ul>{tree(n.id, depth + 1)}</ul>
          </li>
        );
      });
  }
  return (
    <FeedbackContext.Provider value={error}>
      <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {mobile && (
          <button
            className="scrim"
            aria-label="Fechar navegação"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          id="navegacao-principal"
          className={`sidebar ${mobile ? "mobile-open" : ""}`}
        >
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (!dirty || window.confirm("Sair sem salvar as anotações?")) {
                setDirty(false);
                setHome(true);
                openModule(null);
                setAccountPage(null);
                setMobile(false);
              }
            }}
          >
            <span className="brand-icon">
              <BookOpen size={23} />
            </span>
            <span>
              Central<span className="brand-sub">DE ESTUDOS</span>
            </span>
          </a>
          <button
            className="collapse-control icon"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
          <div className="sidebar-label">SEU ESPAÇO</div>
          <nav className="module-nav" aria-label="Módulos principais">
            {(
              [
                ["Início", Home, () => setHome(true)],
                [
                  "Meus concursos",
                  FolderOpen,
                  () => void openCatalog(true),
                ],
                ["Estudar", BookOpen, () => setHome(false)],
                ["Plano de Estudos", CalendarDays, () => setPlannerOpen(true)],
                ["Trilhas", RouteIcon, () => openModule("trails")],
                ["Questões", CircleHelp, () => setQuestionsOpen(true)],
                ["Revisões", Layers, () => setFlashcardsOpen(true)],
                ["Biblioteca", Library, () => openModule("library")],
                ["Desempenho", BarChart3, () => setProductivityOpen(true)],
                [
                  "Central de Prompts",
                  GraduationCap,
                  () => { setTrailPrompt(false); setPromptsOpen(true); },
                ],
                ["Meu perfil", UserRound, () => setAccountPage("profile")],
                ...(catalogAdmin
                  ? ([
                      [
                        "Administração",
                        ShieldCheck,
                        () => setAccountPage("admin"),
                      ],
                    ] as const)
                  : []),
              ] as const
            ).map(([label, Icon, action]) => {
              const current =
                (label === "Início" && home && !accountPage && !modulePage) ||
                (label === "Meus concursos" && catalogOpen) ||
                (label === "Plano de Estudos" && plannerOpen) ||
                (label === "Biblioteca" && modulePage === "library") ||
                (label === "Trilhas" && trailsOpen) ||
                (label === "Central de Prompts" && promptsOpen) ||
                (label === "Desempenho" && productivityOpen) ||
                (label === "Meu perfil" && accountPage === "profile" && !modulePage) ||
                (label === "Administração" && accountPage === "admin" && !modulePage);
              return (
                <button
                  key={label}
                  className={`module-link ${current ? "current" : ""}`}
                  title={label}
                  aria-current={current ? "page" : undefined}
                  onClick={() => {
                    if (
                      dirty &&
                      !window.confirm("Sair sem salvar as anotações?")
                    )
                      return;
                    setDirty(false);
                    setAccountPage(null);
                    openModule(null);
                    setImportTarget(null);
                    action();
                    setMobile(false);
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-label syllabus-label">
            MEUS CONCURSOS
            {repo.demo ? (
              <button
                className="icon"
                onClick={() => setNodeForm({})}
                aria-label="Adicionar concurso"
              >
                <Plus size={17} />
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() => void openCatalog()}
              >
                Ver catálogo
              </button>
            )}
          </div>
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Buscar na hierarquia"
              placeholder="Buscar no edital"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <nav aria-label="Concursos, disciplinas e assuntos">
            <ul className="tree">{tree(null)}</ul>
            {!loading && !data.nodes.length && (
              <p className="muted">Adicione seu primeiro concurso.</p>
            )}
          </nav>
          <div className="sidebar-footer">
            <div className="avatar">{repo.demo ? "D" : "E"}</div>
            <div>
              <strong>{repo.demo ? "Modo demonstração" : "Minha conta"}</strong>
              <small>
                {repo.demo
                  ? "Dados fictícios · neste navegador"
                  : "Sessão individual"}
              </small>
            </div>
            {supabase && (
              <button
                className="icon"
                onClick={() => {
                  if (!dirty || window.confirm("Sair sem salvar as anotações?"))
                    void logout().catch((e: Error) => setError(e.message));
                }}
                aria-label="Sair"
              >
                <LogOut size={18} /><span>Sair</span>
              </button>
            )}
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div>
              <button
                className="icon menu"
                aria-label={mobile ? "Fechar navegação" : "Abrir navegação"}
                aria-controls="navegacao-principal"
                aria-expanded={mobile}
                onClick={() => setMobile((value) => !value)}
              >
                <Menu />
              </button>
              <span>
                {modulePage
                  ? { catalog: "Meus concursos", planner: "Plano de Estudos", prompts: "Central de Prompts", productivity: "Desempenho", trails: "Trilhas", library: "Biblioteca", notice: "Abrir Edital" }[modulePage]
                  : accountPage === "admin"
                  ? "Administração"
                  : accountPage === "profile"
                    ? "Conta"
                    : home
                      ? "Início"
                      : "Estudar"}
              </span>
            </div>
            <button
              className="icon theme-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={
                theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"
              }
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <span className="private-indicator">
              <LockKeyhole size={14} /> Seu progresso é só seu
            </span>
            <AccountMenu user={repo.user} demo={repo.demo} theme={theme}
              refreshKey={String(modulePage) + String(accountPage) + questionsOpen + flashcardsOpen}
              toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
              logout={async () => {
                if (dirty && !window.confirm("Sair sem salvar as anotações?")) return;
                await logout();
              }}
              navigate={target => {
                if (target === "profile") { openProfile(); return; }
                if (target === "catalog") { void openCatalog(); return; }
                if (dirty && !window.confirm("Sair sem salvar as anotações?")) return;
                setDirty(false);
                if (target === "questions") { openModule(null); setQuestionsOpen(true); return; }
                if (target === "study") { openModule(null); setAccountPage(null); setHome(false); return; }
                setAccountPage(null); openModule(target);
              }}
            />
          </header>
          <main id="conteudo" tabIndex={-1} className="workspace">
            {!online && (
              <div className="offline-notice" role="status">
                <WifiOff size={18} /> Você está offline. A sincronização offline
                não está disponível; alterações podem não ser salvas.
              </div>
            )}
            <nav className="page-breadcrumbs" aria-label="Caminho da página">
              <a href={pageHref("home")} onClick={routeLink}>Início</a>
              {currentPage !== "home" && <><ChevronRight size={14} aria-hidden="true" /><a href={pageHref(currentPage, selected)} onClick={routeLink} aria-current="page">{{ study: "Estudar", profile: "Meu perfil", admin: "Administração", catalog: "Meus concursos", planner: "Plano de Estudos", library: "Biblioteca", notice: "Abrir Edital", prompts: "Central de Prompts", productivity: "Meu desempenho", trails: "Trilha da Semana", home: "Início" }[currentPage]}</a></>}
              {previousHref && <a className="previous-page" href={previousHref} onClick={routeLink}>← Página anterior</a>}
            </nav>
            {modulePage && error && <p className="error" role="alert">{error}</p>}
            {modulePage && status && <p className="success" role="status">{status}</p>}
            {modulePage ? (
              <>
        {modulePage === "notice" && <NoticePage id={selected} snapshot={snapshot} demo={repo.demo} close={() => openModule("catalog")} study={navigate} />}
        {modulePage === "library" && <LibraryPanel snapshot={snapshot} repo={repo} close={() => openModule(null)} add={() => setMaterialForm("new")} refresh={refresh}
          study={navigate} prompts={() => setPromptsOpen(true)} link={linkLibraryMaterial}
          renderMaterial={m => <MaterialCard m={m} reorder={false} own={m.owner_id === repo.user && !m.catalog_managed} disabled={busy} edit={() => setMaterialForm(m)} remove={() => setDeleting(m)} move={() => {}} open={() => openFile(m)} />} />}
        {trailsOpen && (
          <Suspense fallback={<p role="status">Carregando trilhas…</p>}>
            <TrailPanel snapshot={snapshot} user={repo.user} demo={repo.demo}
              close={() => openModule(null)} study={navigate}
              prompts={() => { setTrailPrompt(true); setPromptsOpen(true); }} />
          </Suspense>
        )}
        {promptsOpen && (
          <Suspense fallback={<p role="status">Carregando prompts…</p>}>
            <PromptPanel
              openIncidence={() => { setPromptsOpen(false); setExternalMock(false); setIncidenceOpen(true); setProductivityOpen(true); }}
              openLibrary={() => openModule("library")}
              startTrail={trailPrompt}
              openTrails={() => { setTrailPrompt(false); openModule("trails"); }}
              nodes={data.nodes}
              user={repo.user}
              demo={repo.demo}
              close={() => { setTrailPrompt(false); setPromptsOpen(false); }}
              openImporter={(target) => {
                setPromptsOpen(false);
                setImportTarget(target);
                if (target === "contest") void openCatalog();
                if (target === "questions") setQuestionsOpen(true);
                if (target === "cards") setFlashcardsOpen(true);
              }}
            />
          </Suspense>
        )}
        {productivityOpen && (
          <Suspense fallback={<p role="status">Carregando estatísticas…</p>}>
            <ProductivityPanel
              initialTopic={studySession}
              startDashboard={!externalMock && !incidenceOpen && !studySession}
              externalMock={externalMock}
              startIncidence={incidenceOpen}
              snapshot={snapshot}
              user={repo.user}
              demo={repo.demo}
              close={() => {
                setProductivityOpen(false);
                setStudySession("");
                setExternalMock(false);
                setIncidenceOpen(false);
              }}
            />
          </Suspense>
        )}
        {plannerOpen && (
          <Suspense fallback={<p role="status">Carregando planejamento…</p>}>
            <PlannerPanel
              snapshot={snapshot}
              user={repo.user}
              demo={repo.demo}
              close={() => setPlannerOpen(false)}
              study={navigate}
              openReviews={() => {
                setPlannerOpen(false);
                setFlashcardsOpen(true);
              }}
            />
          </Suspense>
        )}
        {catalogOpen && (
          <Suspense fallback={<p role="status">Carregando catálogo…</p>}>
            {repo.demo ? (
              <ModulePage title="Meus concursos" close={() => setCatalogOpen(false)}>
                <p>Dados fictícios salvos neste navegador. O catálogo compartilhado exige conexão com Supabase.</p>
                <button className="secondary" onClick={() => setNodeForm({})}>Adicionar concurso</button>
                <div className="overview-grid">
                  {snapshot.nodes.filter(n => n.kind === "contest").map(n => (
                    <article className="catalog-entry" key={n.id}>
                      <h2>{n.name}</h2>
                      <button className="primary" onClick={() => navigate(n.id)}>Estudar {n.name}</button><button className="secondary" onClick={() => { setSelected(n.id); openModule("notice"); }}>Abrir Edital</button>
                    </article>
                  ))}
                </div>
              </ModulePage>
            ) : <ContestPanel
              startImport={importTarget === "contest" && catalogAdmin}
              nodes={snapshot.nodes}
              editable={
                new Set([
                  ...snapshot.nodes
                    .filter(
                      (n) => n.kind === "contest" && n.owner_id === repo.user,
                    )
                    .map((n) => n.id),
                  ...members
                    .filter(
                      (m) => m.user_id === repo.user && m.role === "editor",
                    )
                    .map((m) => m.contest_id),
                ])
              }
              user={repo.user}
              admin={catalogAdmin}
              close={() => {
                setCatalogOpen(false);
                setImportTarget(null);
              }}
              refresh={refresh}
              notice={(id) => { setSelected(id); openModule("notice"); }}
              open={(id) => { void navigate(id); }}
            />}
          </Suspense>
        )}
              </>
            ) : accountPage === "admin" && catalogAdmin ? (
              <AdminDashboard
                onBack={() => setAccountPage(null)}
                onProfile={() => setAccountPage("profile")}
                onCatalog={() => void openCatalog()}
                onPrompts={() => setPromptsOpen(true)}
                onIncidence={() => {
                  setIncidenceOpen(true);
                  setProductivityOpen(true);
                }}
              />
            ) : accountPage === "profile" ? (
              <ProfilePage
                userId={repo.user}
                demo={repo.demo}
                onLogout={logout}
                onBack={() => setAccountPage(null)}
              />
            ) : home ? (
              <div className="home-page">
                <div className="home-intro">
                  <div>
                    <div className="eyebrow">SEU ESPAÇO DE ESTUDOS</div>
                    <h1>Um passo de cada vez.</h1>
                    <p>Organize seu dia e continue de onde parou.</p>
                  </div>
                  <button className="primary" onClick={() => setHome(false)}>
                    Continuar estudando <ChevronRight size={18} />
                  </button>
                </div>
                {repo.demo && (
                  <div className="demo-banner">
                    <strong>Demonstração fictícia.</strong> Dados salvos neste
                    navegador.
                  </div>
                )}
                {overviewLoading && (online || repo.demo) && (
                  <p role="status">Carregando plano e revisões…</p>
                )}
                {error && !catalogOpen && (
                  <div className="error" role="alert">
                    {error}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => run(refresh, "Dados recarregados.")}
                    >
                      Tentar recarregar dados
                    </button>
                  </div>
                )}
                {homeError && (
                  <div className="error">
                    <p role="alert">Parte do resumo não pôde ser carregada.</p>
                    <button
                      className="secondary"
                      onClick={() => setReloadOverview((value) => value + 1)}
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
                <section className="home-trail-link"><div><h2>Sua trilha da semana</h2><p>Sequência de estudo com pré-requisitos e incidência documentada.</p></div><button className="secondary" onClick={() => openModule("trails")}>Abrir Trilhas →</button></section>
                <HomePerformance key={String(questionsOpen) + String(flashcardsOpen) + reloadOverview} user={repo.user} demo={repo.demo} open={() => setProductivityOpen(true)} />
                <div className="home-grid">
                  <section className="home-card home-plan">
                    <div className="home-card-head">
                      <div>
                        <div className="eyebrow">SEU RITMO</div>
                        <h2>Plano de hoje</h2>
                      </div>
                      <CalendarDays size={22} />
                    </div>
                    {todayBlocks.length ? (
                      <ul className="today-list">
                        {todayBlocks.map((b) => (
                          <li key={b.id}>
                            <span>
                              {b.completed ? "✓ " : ""}
                              {b.name}
                            </span>
                            <small>
                              {b.minutes} min{b.completed ? " · concluído" : ""}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        {overviewLoading
                          ? "Consultando o planejamento…"
                          : homeError
                            ? "Consulte seu plano no planejamento."
                            : "Nenhuma atividade planejada para hoje. Crie ou atualize seu plano."}
                      </p>
                    )}
                    <button
                      className="text-button home-action"
                      onClick={() => setPlannerOpen(true)}
                    >
                      Abrir planejamento →
                    </button>
                  </section>
                  <section className="home-card">
                    <div className="home-card-head">
                      <div>
                        <div className="eyebrow">MEMÓRIA EM DIA</div>
                        <h2>Revisões pendentes</h2>
                      </div>
                      <Layers size={22} />
                    </div>
                    <strong className="home-number">
                      {dueCount === null ? "—" : dueCount}
                    </strong>
                    <p className="muted">Cartões com revisão vencida</p>
                    <button
                      className="text-button home-action"
                      onClick={() => setFlashcardsOpen(true)}
                    >
                      Abrir revisões →
                    </button>
                  </section>
                  <section className="home-card">
                    <div className="home-card-head">
                      <div>
                        <div className="eyebrow">SUA CAMINHADA</div>
                        <h2>Progresso</h2>
                      </div>
                      <CheckCheck size={22} />
                    </div>
                    {contest ? (
                      <>
                        <strong className="home-number">
                          {
                            progress(
                              data.nodes,
                              data.checks,
                              contest.id,
                              repo.user,
                            ).percent
                          }
                          %
                        </strong>
                        <p className="muted">Checklist de {contest.name}</p>
                      </>
                    ) : (
                      <p className="muted">
                        Selecione um concurso para acompanhar seu progresso.
                      </p>
                    )}
                    <button
                      className="text-button home-action"
                      onClick={() => setHome(false)}
                    >
                      Ver conteúdo →
                    </button>
                  </section>
                </div>
              </div>
            ) : (
              <>
                <nav className="breadcrumb" aria-label="Caminho do edital">
                  <a href={pageHref("catalog")} onClick={routeLink}>Meus concursos</a>
                  {chain.map((n) => (
                    <span key={n.id}>
                      <ChevronRight size={13} />
                      <a href={pageHref("study", n.id)} onClick={routeLink} aria-current={n.id === selected ? "page" : undefined}>{n.name}</a>
                    </span>
                  ))}
                </nav>
                {repo.demo && (
                  <div className="demo-banner">
                    <span>
                      <strong>Demonstração fictícia.</strong> Dados salvos
                      apenas neste navegador. Arquivos e compartilhamento
                      precisam do Supabase.
                    </span>
                  </div>
                )}
                <div aria-live="polite">
                  {loading && <p>Carregando seu ambiente…</p>}
                  {busy && <p className="muted">Salvando…</p>}
                  {status && (
                    <p className="success" role="status">
                      {status}
                    </p>
                  )}
                </div>
                {error && (
                  <div className="error" role="alert">
                    {error}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => run(refresh, "Dados recarregados.")}
                    >
                      Tentar recarregar
                    </button>
                  </div>
                )}
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">UM ASSUNTO DE CADA VEZ</div>
                    <h1>{node?.name || "Seu ambiente de estudos"}</h1>
                    <p>
                      {isTopic
                        ? "Reúna o que importa. Estude no seu ritmo."
                        : "Organize seu edital e transforme cada etapa em progresso."}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {node && canEdit(node) && (
                      <>
                        <button
                          className="icon"
                          title="Editar nome"
                          aria-label="Editar item"
                          onClick={() => setNodeForm({ initial: node })}
                        >
                          <Pencil size={17} />
                        </button>
                        {node.kind !== "subtopic" && (
                          <button
                            className="secondary"
                            onClick={() => setNodeForm({ parent: node })}
                          >
                            <Plus size={17} />
                            {node.kind === "contest"
                              ? "Disciplina"
                              : node.kind === "discipline"
                                ? "Assunto"
                                : "Subassunto"}
                          </button>
                        )}
                      </>
                    )}
                    {!node && (
                      <button
                        className="primary"
                        onClick={() =>
                          repo.demo ? setNodeForm({}) : void openCatalog()
                        }
                      >
                        <Plus size={18} />
                        {repo.demo ? "Adicionar concurso" : "Ver concursos"}
                      </button>
                    )}
                    {contest?.owner_id === repo.user && !repo.demo && (
                      <button
                        className="icon"
                        aria-label="Gerenciar acesso ao concurso"
                        title="Acesso ao concurso"
                        onClick={() => setShare(true)}
                      >
                        <Share2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
                {node && <SyllabusIncidence key={node.id + String(productivityOpen)} nodes={data.nodes} root={node.id} user={repo.user} demo={repo.demo} />}
                {node && (
                  <div className="summary-grid">
                    <section className="summary-card">
                      <div className="summary-icon">
                        <CheckCheck size={22} />
                      </div>
                      <div>
                        <span>
                          Seu progresso{" "}
                          {isTopic
                            ? "neste assunto"
                            : node.kind === "contest"
                              ? "no concurso"
                              : "na disciplina"}
                        </span>
                        <strong>
                          {p.total ? `${p.percent}%` : "Sem dados"}
                        </strong>
                        <small>
                          {p.done} de {p.total} etapas concluídas
                          {node.kind === "topic" ? " · inclui subassuntos" : ""}
                        </small>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${p.percent}%` }} />
                      </div>
                    </section>
                    <section className="summary-card">
                      <div className="summary-icon sand">
                        <FolderOpen size={22} />
                      </div>
                      <div>
                        <span>Materiais disponíveis</span>
                        <strong>
                          {
                            availableMaterialCount
                          }
                        </strong>
                        <small>Seu acervo e materiais autorizados</small>
                      </div>
                    </section>
                    <section className="summary-card quote">
                      <span className="mini-label">FOCO NO PROCESSO</span>
                      <p>
                        O próximo passo
                        <br />
                        também conta.
                      </p>
                      <GraduationCap size={39} />
                    </section>
                  </div>
                )}
                {isTopic && node ? (
                  <>
                    <StudyLibraryLinks snapshot={snapshot} repo={repo} selected={selected} link={linkLibraryMaterial} refresh={refresh} prompts={() => openStudyResource("prompts")} library={() => openStudyResource("library")} />
                    <div className="study-tools"><button className="text-button" onClick={() => setQuestionsOpen(true)}>Resolver questões</button><button className="text-button" onClick={() => setFlashcardsOpen(true)}>Estudar flashcards e revisões</button><button className="text-button" onClick={() => { if (dirty && !window.confirm("Sair sem salvar as anotações?")) return; setDirty(false); setStudySession(selected); setProductivityOpen(true); }}>Registrar sessão de estudo</button></div>
                    <div
                      className="tabs"
                      role="tablist"
                      aria-label="Seções do assunto"
                    >
                      {sections.map((s, i) => (
                        <button
                          key={s}
                          id={`tab-${i}`}
                          role="tab"
                          aria-selected={section === s}
                          aria-controls="study-panel"
                          tabIndex={section === s ? 0 : -1}
                          onKeyDown={(e) => {
                            if (
                              [
                                "ArrowRight",
                                "ArrowLeft",
                                "Home",
                                "End",
                              ].includes(e.key)
                            ) {
                              e.preventDefault();
                              const next =
                                e.key === "Home"
                                  ? 0
                                  : e.key === "End"
                                    ? sections.length - 1
                                    : (i +
                                        (e.key === "ArrowRight" ? 1 : -1) +
                                        sections.length) %
                                      sections.length;
                              changeSection(sections[next]);
                              document.getElementById(`tab-${next}`)?.focus();
                            }
                          }}
                          onClick={() => changeSection(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <section
                      className="study-panel"
                      id="study-panel"
                      role="tabpanel"
                      aria-labelledby={`tab-${sections.indexOf(section)}`}
                      tabIndex={0}
                    >
                      <div className="section-heading">
                        <div>
                          <h2>{section}</h2>
                          <p>
                            {section === "Videoaulas"
                              ? "Suas aulas, organizadas para continuar de onde parou."
                              : section === "Anotações"
                                ? "Um espaço privado para conectar suas ideias."
                                : section === "Progresso e checklist"
                                  ? "Pequenas etapas para um estudo completo."
                                  : section === "Flashcards"
                                    ? "Registre perguntas e pratique a recuperação da memória."
                                    : "Suas referências, sempre perto do estudo."}
                          </p>
                        </div>
                        {!["Anotações", "Progresso e checklist"].includes(
                          section,
                        ) && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => setMaterialForm("new")}
                          >
                            <Plus size={17} />
                            Adicionar material
                          </button>
                        )}
                      </div>
                      {section === "Questões externas" && (
                        <div className="gran-card">
                          <div>
                            <span className="mini-label">PRÁTICA EXTERNA</span>
                            <h3>Encontre questões no Gran</h3>
                            <p>
                              Na plataforma, selecione a disciplina{" "}
                              <strong>
                                {
                                  chain.find((n) => n.kind === "discipline")
                                    ?.name
                                }
                              </strong>
                              , o assunto <strong>{node.name}</strong>
                              {contest?.board && (
                                <>
                                  {" "}
                                  e a banca <strong>{contest.board}</strong>
                                </>
                              )}
                              . Se houver subassunto, refine o filtro por ele.
                            </p>
                            <small>
                              Sem URL específica confirmada? Use os filtros
                              acima. Disponibilidade dos filtros e acesso
                              dependem da plataforma. Nenhum resultado é
                              sincronizado.
                            </small>
                          </div>
                          <a
                            className="secondary"
                            href={granUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir Gran Questões
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      )}
                      {section === "Progresso e checklist" ? (
                        <Checklist
                          node={node}
                          data={data}
                          user={repo.user}
                          disabled={busy}
                          toggle={(step, done) =>
                            run(() =>
                              repo.check({
                                topic_id: node.id,
                                user_id: repo.user,
                                step,
                                done,
                              }),
                            )
                          }
                        />
                      ) : section === "Anotações" ? (
                        <Notes
                          key={selected}
                          body={
                            data.notes.find(
                              (n) =>
                                n.topic_id === selected &&
                                n.user_id === repo.user,
                            )?.body || ""
                          }
                          busy={busy}
                          dirty={setDirty}
                          save={(body) =>
                            run(() =>
                              repo.note({
                                user_id: repo.user,
                                topic_id: selected,
                                body,
                              }),
                            )
                          }
                        />
                      ) : (
                        <>
                          {section === "Flashcards" && (
                            <p className="muted">
                              Consulte os cartões do assunto ou abra Revisões para praticar com agendamento FSRS.
                            </p>
                          )}
                          {list.length ? (
                            <div className="materials">
                              {list.map((m) => (
                                <MaterialCard
                                  key={`${m.id}:${m.url}:${m.embed}`}
                                  m={m}
                                  own={
                                    m.owner_id === repo.user &&
                                    !m.catalog_managed
                                  }
                                  disabled={busy}
                                  edit={() => setMaterialForm(m)}
                                  remove={() => setDeleting(m)}
                                  move={(direction) =>
                                    run(
                                      () => repo.move(m, direction),
                                      "Ordem atualizada.",
                                    )
                                  }
                                  open={() => openFile(m)}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state">
                              {section === "Videoaulas" ? (
                                <Video size={35} />
                              ) : (
                                <FolderOpen size={35} />
                              )}
                              <h3>
                                {section === "Videoaulas"
                                  ? "Sua próxima aula começa aqui"
                                  : "Espaço para novas referências"}
                              </h3>
                              <p>
                                {section === "Videoaulas"
                                  ? "Adicione um link do YouTube ou uma referência externa."
                                  : "Adicione um material para consultar durante o estudo."}
                              </p>
                              <button
                                className="secondary"
                                onClick={() => setMaterialForm("new")}
                              >
                                <Plus size={17} />
                                Adicionar primeiro material
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                    <div className="bottom-checklist">
                      <div>
                        <CheckCheck size={20} />
                        <strong>Meu checklist</strong>
                        <span>
                          {
                            data.checks.filter(
                              (c) =>
                                c.topic_id === selected &&
                                c.user_id === repo.user &&
                                c.done,
                            ).length
                          }
                          /5
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => changeSection("Progresso e checklist")}
                      >
                        Acompanhar etapas <ChevronRight size={15} />
                      </button>
                    </div>
                  </>
                ) : node ? (
                  <section className="overview">
                    <div className="section-heading">
                      <div>
                        <h2>
                          {node.kind === "contest"
                            ? "Disciplinas do concurso"
                            : "Assuntos para estudar"}
                        </h2>
                        <p>
                          Escolha um item para abrir seus materiais e seu
                          checklist.
                        </p>
                      </div>
                    </div>
                    <div className="overview-grid">
                      {data.nodes
                        .filter((n) => n.parent_id === selected)
                        .sort((a, b) => a.position - b.position)
                        .map((n) => {
                          const np = progress(
                            data.nodes,
                            data.checks,
                            n.id,
                            repo.user,
                          );
                          return (
                            <button
                              className="overview-card"
                              key={n.id}
                              onClick={() => navigate(n.id)}
                            >
                              <BookOpen size={23} />
                              <strong>{n.name}</strong>
                              <small>
                                {np.total
                                  ? `${np.percent}% concluído`
                                  : "Sem assuntos cadastrados"}
                              </small>
                              <progress value={np.percent} max={100} />
                              <span>
                                Continuar estudo <ChevronRight size={15} />
                              </span>
                            </button>
                          );
                        })}
                    </div>
                    {!data.nodes.some((n) => n.parent_id === selected) && (
                      <p className="muted">
                        Nenhum item cadastrado. Use o botão acima para
                        adicionar.
                      </p>
                    )}
                  </section>
                ) : (
                  !loading && (
                    <div className="empty-state">
                      <BookOpen size={40} />
                      <h2>Seu próximo objetivo começa aqui</h2>
                      <p>
                        Cadastre um concurso, adicione disciplinas e organize os
                        assuntos.
                      </p>
                    </div>
                  )
                )}
              </>
            )}
            <footer className="workspace-footer">
              <span>Central de Estudos · cada passo conta</span>
              {!repo.demo && (
                <span className="user-id">ID da conta: {repo.user}</span>
              )}
            </footer>
          </main>
        </div>

        {questionsOpen && (
          <Suspense fallback={<p role="status">Carregando questões…</p>}>
            <QuestionsPanel
              initialTopic={isTopic ? selected : ""}
              startImport={importTarget === "questions"}
              nodes={data.nodes}
              user={repo.user}
              demo={repo.demo}
              close={() => {
                setQuestionsOpen(false);
                setImportTarget(null);
              }}
              openExternal={() => {
                setQuestionsOpen(false);
                setExternalMock(true);
                setProductivityOpen(true);
              }}
            />
          </Suspense>
        )}

        {flashcardsOpen && (
          <Suspense fallback={<p role="status">Carregando flashcards…</p>}>
            <FlashcardPanel
              initialTopic={isTopic ? selected : ""}
              startImport={importTarget === "cards"}
              nodes={data.nodes}
              user={repo.user}
              demo={repo.demo}
              close={() => {
                setFlashcardsOpen(false);
                setImportTarget(null);
              }}
            />
          </Suspense>
        )}


        {materialForm && (isTopic || modulePage === "library") && (
          <MaterialForm
            initial={materialForm === "new" ? undefined : materialForm}
            topic={modulePage === "library" ? "" : selected}
            materials={snapshot.materials}
            onUseExisting={async m => modulePage === "library" ? (setMaterialForm(null), true) : linkLibraryMaterial(m, selected, true)}
            user={repo.user}
            section={modulePage === "library" ? "Teoria e resumos" : section}
            demo={repo.demo}
            busy={busy}
            close={() => setMaterialForm(null)}
            onSave={(m, file) =>
              run(() =>
                repo.saveMaterial(
                  materialForm === "new"
                    ? {
                        ...m,
                        position:
                          Math.max(
                            -1,
                            ...data.materials
                              .filter(
                                (x) =>
                                  x.topic_id === selected &&
                                  x.section === m.section,
                              )
                              .map((x) => x.position),
                          ) + 1,
                      }
                    : m,
                  file,
                ),
              )
            }
          />
        )}
        {nodeForm && (
          <NodeForm
            {...nodeForm}
            user={repo.user}
            count={
              data.nodes.filter(
                (n) => n.parent_id === (nodeForm.parent?.id || null),
              ).length
            }
            busy={busy}
            close={() => setNodeForm(null)}
            save={(n) => run(() => repo.saveNode(n))}
          />
        )}
        {deleting && (
          <Modal
            title="Remover material?"
            busy={busy}
            close={() => setDeleting(null)}
          >
            <p>
              “{deleting.title}” será removido para você e os destinatários. O
              arquivo associado e todos os vínculos deste material também serão excluídos. Seu checklist será
              preservado.
            </p>
            <div className="form-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      () => repo.deleteMaterial(deleting),
                      "Material removido.",
                    )
                  )
                    setDeleting(null);
                }}
              >
                Remover material
              </button>
            </div>
          </Modal>
        )}
        {share && contest && (
          <ShareForm
            contest={contest}
            members={members}
            busy={busy}
            close={() => setShare(false)}
            save={(m, remove) => run(() => repo.member(m, remove))}
          />
        )}
        {fileView && (
          <Modal
            title={fileView.material.title}
            close={() => setFileView(null)}
          >
            <p>
              Link temporário, válido por 60 segundos. Reabra o material para
              renová-lo.
            </p>
            {fileView.material.kind === "image" ? (
              <img
                className="file-image"
                src={fileView.url}
                alt={fileView.material.title}
              />
            ) : (
              <iframe
                className="pdf-preview"
                src={fileView.url}
                title={fileView.material.title}
              />
            )}
            <a
              className="secondary"
              href={fileView.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir arquivo <ExternalLink size={15} />
            </a>
          </Modal>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
function MaterialCard({
  m,
  reorder = true,
  own,
  disabled,
  edit,
  remove,
  move,
  open,
}: {
  m: Material;
  reorder?: boolean;
  own: boolean;
  disabled: boolean;
  edit: () => void;
  remove: () => void;
  move: (d: number) => void;
  open: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [playing, setPlaying] = useState(false);
  let url = "";
  try {
    url = m.url ? safeUrl(m.url) : "";
  } catch {
    /* Invalid stored URLs are never linked. */
  }
  const videoId = youtubeId(url);
  return (
    <article className="material-card">
      <div className="material-top">
        <span className="format-tag">
          {m.kind === "youtube" ? <Video size={14} /> : <FileText size={14} />}
          {
            {
              youtube: "YOUTUBE",
              text: "TEXTO",
              pdf: "PDF",
              image: "IMAGEM",
              link: "LINK",
            }[m.kind]
          }
        </span>
        <span className="visibility">
          {m.catalog_managed ? <BookOpen size={12} /> : m.visibility === "private" ? (
            <LockKeyhole size={12} />
          ) : (
            <Share2 size={12} />
          )}{" "}
          {m.catalog_managed ? "Catálogo" : m.visibility === "private" ? "Privado" : "Compartilhado"}
          {!own ? " · somente leitura" : ""}
        </span>
      </div>
      <h3>{m.title}</h3>
      {url && (
        <span className="verification">
          {m.verified ? "Conferido pelo autor" : "Link não verificado"}
        </span>
      )}
      {m.section === "Flashcards" ? (
        <div className="flashcard">
          <p>{m.body}</p>
          <button className="secondary" onClick={() => setReveal(!reveal)}>
            {reveal ? "Ocultar resposta" : "Mostrar resposta"}
          </button>
          {reveal && <p className="answer">{m.back}</p>}
        </div>
      ) : (
        m.body && <p className="material-body">{m.body}</p>
      )}
      {m.kind === "youtube" &&
        m.embed &&
        videoId &&
        (playing ? (
          <YouTube id={videoId} />
        ) : (
          <button
            className="video-placeholder"
            onClick={() => setPlaying(true)}
          >
            <Video size={28} />
            <span>Carregar player do YouTube</span>
            <small>O player será conectado ao YouTube.</small>
          </button>
        ))}
      <div className="material-actions">
        <div>
          {url && (
            <a
              className="text-button"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {m.kind === "youtube" ? "Abrir no YouTube" : "Abrir referência"}
              <ExternalLink size={15} />
            </a>
          )}
          {m.file_path && (
            <button className="text-button" onClick={open}>
              Abrir arquivo
              <ExternalLink size={15} />
            </button>
          )}
        </div>
        {own && (
          <ActionMenu label={`Ações do material ${m.title}`}>
            {reorder && <><button
              className="icon"
              aria-label={`Mover ${m.title} para cima`}
              disabled={disabled}
              onClick={() => move(-1)}
            >
              <ArrowUp size={16} /> Mover para cima
            </button>
            <button
              className="icon"
              aria-label={`Mover ${m.title} para baixo`}
              disabled={disabled}
              onClick={() => move(1)}
            >
              <ArrowDown size={16} /> Mover para baixo
            </button></>}
            <button
              className="icon"
              aria-label={`Editar ${m.title}`}
              disabled={disabled}
              onClick={edit}
            >
              <Pencil size={16} /> Editar material
            </button>
            <button
              className="icon"
              aria-label={`Remover ${m.title}`}
              disabled={disabled}
              onClick={remove}
            >
              <Trash2 size={16} /> Excluir material
            </button>
          </ActionMenu>
        )}
      </div>
    </article>
  );
}
function Checklist({
  node,
  data,
  user,
  disabled,
  toggle,
}: {
  node: Node;
  data: Snapshot;
  user: string;
  disabled: boolean;
  toggle: (step: number, done: boolean) => void;
}) {
  return (
    <div className="checklist">
      <p className="muted">
        Etapas individuais deste{" "}
        {node.kind === "subtopic" ? "subassunto" : "assunto"}. Marcar uma etapa
        não altera seus subassuntos.
      </p>
      {steps.map((label, i) => (
        <label
          key={label}
          className={
            data.checks.some(
              (c) =>
                c.topic_id === node.id &&
                c.user_id === user &&
                c.step === i &&
                c.done,
            )
              ? "completed"
              : ""
          }
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={data.checks.some(
              (c) =>
                c.topic_id === node.id &&
                c.user_id === user &&
                c.step === i &&
                c.done,
            )}
            onChange={(e) => toggle(i, e.target.checked)}
          />
          <span>{label}</span>
          <small>{i + 1}/5</small>
        </label>
      ))}
    </div>
  );
}
function Notes({
  body,
  busy,
  dirty,
  save,
}: {
  body: string;
  busy: boolean;
  dirty: (v: boolean) => void;
  save: (v: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(body);
  const [saved, setSaved] = useState(body);
  return (
    <div className="notes">
      <label htmlFor="personal-notes">
        <LockKeyhole size={14} />
        Anotações pessoais · somente você
      </label>
      <textarea
        id="personal-notes"
        rows={12}
        maxLength={100000}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          dirty(e.target.value !== saved);
        }}
        placeholder="O que você quer lembrar na próxima revisão?"
      />
      <div className="notes-footer">
        <small>
          {draft === saved
            ? "Todas as anotações salvas."
            : "Alterações ainda não salvas."}{" "}
          · {draft.length}/100000
        </small>
        <button
          className="primary"
          disabled={busy || draft === saved}
          onClick={async () => {
            if (await save(draft)) {
              setSaved(draft);
              dirty(false);
            }
          }}
        >
          Salvar anotações
        </button>
      </div>
    </div>
  );
}
