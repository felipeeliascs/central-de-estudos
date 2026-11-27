import { useContext, useId, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { FeedbackContext } from "./Forms";

export function ModulePage({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const heading = useId();
  const error = useContext(FeedbackContext);
  return (
    <section className="module-page" aria-labelledby={heading} aria-busy={busy}>
      <header className="module-page-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE ESTUDOS</div>
          <h1 id={heading}>{title}</h1>
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={close}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar
        </button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {children}
    </section>
  );
}
