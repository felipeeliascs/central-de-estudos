import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, Flame, GraduationCap, HelpCircle, LogOut, Moon, Route, Settings, UserRound } from "lucide-react";
import { supabase } from "./repository";
import { readStreak } from "./streak-data";
import type { Streak } from "./streak";
import { todayInBrazil, addDays } from "./planner";
type Destination = "library"|"profile"|"catalog"|"planner"|"trails"|"questions"|"study";
export function AccountMenu({ user, demo, theme, toggleTheme, navigate, logout, refreshKey }: {
  user: string; demo: boolean; theme: string; toggleTheme: () => void;
  navigate: (target: Destination) => void; logout: () => Promise<void>; refreshKey: string;
}) {
  const [open,setOpen]=useState(false);
  const [name,setName]=useState(demo ? "Estudante fictício" : "Minha conta");
  const [email,setEmail]=useState("");
  const [streak,setStreak]=useState<Streak | null>(null);
  const [streakError,setStreakError]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toLocaleUpperCase("pt-BR");
  useEffect(() => {
    let active=true;
    setStreakError(false);
    readStreak(user,demo).then(s=>{ if(active)setStreak(s); }).catch(()=>{ if(active){setStreak(null);setStreakError(true);} });
    return ()=>{active=false;};
  },[user,demo,refreshKey,open]);
  useEffect(() => {
    if(demo || !supabase) return;
    let active=true;
    void (async()=>{
      try {
        const [identity,profile]=await Promise.all([supabase.auth.getUser(),supabase.from("study_profiles").select("display_name").eq("user_id",user).single()]);
        if(active && !identity.error && identity.data.user?.id===user) {
          setEmail(identity.data.user.email??""); if(!profile.error && profile.data?.display_name)setName(profile.data.display_name);
        }
      } catch { /* Account actions remain available if identity details cannot be loaded. */ }
    })();
    return ()=>{active=false;};
  },[user,demo,open]);
  useEffect(()=>{
    if(!open)return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  function go(target:Destination){setOpen(false);navigate(target);}
  return <div className="account-menu-root" ref={root}>
    <span className="streak-indicator" title="Dias com tempo registrado, questões resolvidas ou revisão. Planejar não conta."><Flame size={18} aria-hidden="true" /><span>{streak ? streak.current+" "+(streak.current===1?"dia":"dias") : streakError ? "—" : "…"}</span></span>
    <button ref={trigger} className="icon profile-trigger" aria-label="Abrir menu da conta" title="Menu da conta" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={()=>setOpen(value=>!value)}><span className="account-avatar">{initials || <UserRound size={19}/>}</span></button>
    {open && <div className="account-dropdown" id="account-menu" role="menu" aria-label="Menu da conta" ref={menu} onKeyDown={event=>{
      if(event.key==="ArrowDown" || event.key==="ArrowUp" || event.key==="Home" || event.key==="End"){
        event.preventDefault();
        const items=[...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemcheckbox"]')].filter(x=>!x.hasAttribute("disabled"));
        const index=items.indexOf(document.activeElement as HTMLElement);
        const next=event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length;
        items[next]?.focus();
      }
      if(event.key==="Tab")setOpen(false);
    }}>
      <div className="account-menu-identity"><span className="account-avatar large">{initials}</span><div><span className="catalog-badge">Uso gratuito</span><strong>{name}</strong>{email && <small>{email}</small>}</div></div>
      <div className="account-streak"><strong>{streak ? streak.current+" dias seguidos estudados" : "Ofensiva indisponível"}</strong>{streak && <small>Recorde: {streak.best} dias · {streak.studied_today?"Atividade registrada hoje":"Registre seu estudo de hoje"}</small>}
        <div className="streak-days" aria-label="Atividade nos últimos sete dias">{Array.from({length:7},(_,i)=>addDays(todayInBrazil(),i-6)).map(day=><span key={day} className={streak?.active_days.includes(day)?"active":""} title={day}>{day.slice(-2)}</span>)}</div>
        <small>Conta tempo de estudo, questões ou revisões registrados. Abrir a página e marcar planejamento não conta.</small>
      </div>
      <span className="account-menu-label">SEUS ESTUDOS</span>
      <button role="menuitem" onClick={()=>go("catalog")}><BookOpen size={18}/>Meus concursos</button>
      <button role="menuitem" onClick={()=>go("trails")}><Route size={18}/>Minhas trilhas</button>
      <button role="menuitem" onClick={()=>go("planner")}><CalendarDays size={18}/>Plano de Estudos</button>
      <button role="menuitem" onClick={()=>go("questions")}><GraduationCap size={18}/>Questões e simulados</button>
      <button role="menuitem" onClick={()=>go("library")}><BookOpen size={18}/>Biblioteca</button>
      <span className="account-menu-label">SUAS PREFERÊNCIAS</span>
      <button role="menuitemcheckbox" aria-checked={theme==="dark"} onClick={toggleTheme}><Moon size={18}/>Modo noturno<span className={"account-toggle "+(theme==="dark"?"on":"")} aria-hidden="true"/></button>
      <button role="menuitem" onClick={()=>go("profile")}><Settings size={18}/>Configurações do perfil</button>
      <span className="account-menu-label">CONTA E SUPORTE</span>
      <a role="menuitem" href="https://github.com/felipeeliascs/central-de-estudos/blob/main/README.md" target="_blank" rel="noreferrer"><HelpCircle size={18}/>Central de Ajuda</a>
      <button role="menuitem" onClick={()=>go("profile")}><UserRound size={18}/>Minha conta · uso gratuito</button>
      {error && <p role="alert" className="error">{error}</p>}
      <button role="menuitem" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await logout();setOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><LogOut size={18}/>{busy?"Saindo…":"Sair"}</button>
    </div>}
  </div>;
}
