import { useEffect, useRef, type ReactNode } from "react";
import { EllipsisVertical } from "lucide-react";
export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside=(e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open=false; };
    const escape=(e: KeyboardEvent) => { if(e.key==="Escape" && ref.current?.open) { ref.current.open=false; ref.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown",outside); document.addEventListener("keydown",escape);
    return()=>{ document.removeEventListener("pointerdown",outside); document.removeEventListener("keydown",escape); };
  },[]);
  return <details className="action-menu" ref={ref}><summary aria-label={label} title={label}><EllipsisVertical size={18} aria-hidden="true" /><span className="sr-only">{label}</span></summary><div className="action-menu-options" onClick={e=>{ if((e.target as HTMLElement).closest("button,a") && ref.current) ref.current.open=false; }}>{children}</div></details>;
}
