import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "./repository";

export function AccountDeletion({ demo }: { demo: boolean }) {
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (demo || !supabase) return;
    let active = true;
    void (async () => {
      try {
        const result = await supabase.rpc("study_my_deletion_request");
        if (result.error) throw result.error;
        if (active) setPending(result.data?.status === "pending");
      } catch { if (active) setError("Não foi possível consultar solicitações. Abra novamente o perfil para tentar."); }
    })();
    return () => { active = false; };
  }, [demo]);
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("confirmed") !== "on") return;
    setBusy(true); setError(""); setStatus("");
    try {
      if (!demo) {
        const result = await supabase!.rpc("study_request_account_deletion", { request_reason: String(data.get("reason") ?? "").trim() });
        if (result.error) throw result.error;
      }
      setPending(true);
      setStatus(demo ? "Demonstração: solicitação simulada; nenhuma conta será excluída." : "Solicitação enviada ao administrador. Sua conta e seus dados continuam ativos até a análise.");
    } catch { setError("Não foi possível enviar a solicitação. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <details className="deletion-section"><summary><span className="profile-section-icon"><Trash2 size={19} /></span><span><strong>Excluir minha conta</strong><small>Solicite a análise do administrador</small></span></summary>
    <div className="profile-feedback"><p>A solicitação não exclui dados automaticamente. O administrador deve conferir os dados vinculados e combinar a exclusão com você.</p>
      {pending ? <><p>Existe uma solicitação pendente.</p><button className="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try {
          if (!demo) { const result = await supabase!.rpc("study_cancel_account_deletion"); if (result.error) throw result.error; }
          setPending(false); setStatus("Solicitação cancelada.");
        } catch { setError("Não foi possível cancelar a solicitação."); } finally { setBusy(false); }
      }}>Cancelar solicitação</button></> : <form onSubmit={request}><fieldset disabled={busy}>
        <label>Motivo (opcional)<textarea name="reason" maxLength={1000} rows={3} /></label>
        <label className="check-label"><input type="checkbox" name="confirmed" required /> Confirmo que desejo solicitar a exclusão da minha conta.</label>
        <button className="danger">Solicitar exclusão ao administrador</button>
      </fieldset></form>}
      {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    </div>
  </details>;
}

type Request = { user_id: string; display_name: string; email: string; reason: string; requested_at: string };
export function AdminDeletionRequests() {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const result = await supabase!.rpc("study_admin_deletion_requests");
      if (result.error) throw result.error;
      setRows(Array.isArray(result.data) ? result.data : []);
    } catch { setError("Não foi possível consultar solicitações de exclusão."); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="admin-card"><h2>Solicitações de exclusão de conta</h2><p>A análise e a exclusão definitiva são feitas no ambiente confiável do Supabase, após conferir os vínculos e confirmar com a pessoa solicitante.</p>
    <button className="secondary" onClick={() => void load()}>Atualizar solicitações</button>
    {error && <p role="alert">{error}</p>}
    {rows && (rows.length ? <ul>{rows.map(r => <li key={r.user_id}><strong>{r.display_name || r.email}</strong> · {r.email} · {new Date(r.requested_at).toLocaleString("pt-BR")}<p>{r.reason || "Sem motivo informado."}</p><small>ID: {r.user_id}</small></li>)}</ul> : <p>Nenhuma solicitação pendente.</p>)}
  </section>;
}
