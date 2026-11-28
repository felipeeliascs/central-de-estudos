import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ title, description, meta, icon, children, storageKey }: {
  title: string; description: string; meta?: string; icon: ReactNode; children: ReactNode; storageKey?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(() => { try { return !!storageKey && localStorage.getItem(storageKey) === "open"; } catch { return false; } });
  return <section className="collapsible-section" aria-label={title}>
    <h2 className="collapsible-heading">
      <button type="button" className="collapsible-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => { const next=!value; try { if(storageKey) localStorage.setItem(storageKey,next?"open":"closed"); } catch { /* Access remains usable when storage is unavailable. */ } return next; })}>
        <span className="collapsible-icon" aria-hidden="true">{icon}</span>
        <span className="collapsible-copy"><span className="collapsible-title">{title}</span><span className="collapsible-description">{description}</span></span>
        {meta && <span className="collapsible-meta">{meta}</span>}
        <span className="collapsible-action">{open ? "Esconder" : "Exibir"}</span>
        <ChevronDown className={open ? "expanded" : ""} size={18} aria-hidden="true" />
      </button>
    </h2>
    <div id={id} className="collapsible-content" hidden={!open}>{children}</div>
  </section>;
}
