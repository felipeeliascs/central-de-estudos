import { useEffect, useState } from "react";
import { supabase } from "./repository";
type Summary = { access: "free"; charging_enabled: false; integration: "not_configured"; subscriptions?: number; pending_events?: number; subscription?: { plan_name: string; status: string; current_period_end: string | null } | null };
export function BillingStatus({ admin = false, demo = false }: { admin?: boolean; demo?: boolean }) {
  const [value, setValue] = useState<Summary | null>(demo ? { access: "free", charging_enabled: false, integration: "not_configured" } : null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true; setValue(null); setError("");
    void (async () => {
      try {
        const result = await supabase!.rpc(admin ? "study_admin_billing_overview" : "study_my_billing_summary");
        if (result.error) throw result.error;
        if (result.data?.integration !== "not_configured" || result.data?.charging_enabled !== false) throw new Error();
        if (active) setValue(result.data);
      } catch (e) {
        if (active) setError(["PGRST202","42883"].includes((e as { code?: string }).code ?? "") ?
          "A consulta de assinatura exige a migração 017. O uso continua gratuito nesta versão." :
          "Não foi possível consultar a situação da integração. Tente novamente.");
      }
    })();
    return () => { active = false; };
  }, [admin, demo, retry]);
  return <div className="profile-feedback">
    <p><strong>Uso gratuito</strong> · Cobranças desativadas.</p>
    {!value && !error && <p role="status">Consultando integração…</p>}
    {error && <><p role="alert">{error}</p><button className="text-button" onClick={() => setRetry(n => n + 1)}>Consultar novamente</button></>}
    {value && <p>Mercado Pago: integração futura, ainda não configurada.</p>}
    {admin && value && <><dl className="admin-metrics"><div><dt>Registros de integração</dt><dd>{value.subscriptions ?? 0}</dd></div><div><dt>Eventos pendentes</dt><dd>{value.pending_events ?? 0}</dd></div></dl>
      <p>A estrutura está preparada para assinaturas e eventos. Checkout, confirmação de pagamentos e ativação de planos exigem uma etapa futura de integração e homologação.</p>
      <a href="https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview" target="_blank" rel="noopener noreferrer">Documentação do Mercado Pago ↗</a>
    </>}
    {!admin && value?.subscription && <p>Registro de integração: {value.subscription.plan_name} ({value.subscription.status}). Esse registro não ativa cobrança nem altera o acesso gratuito nesta versão.</p>}
    <p>Não são solicitados dados de cartão nesta página. O acesso a serviços externos segue as condições desses serviços.</p>
  </div>;
}
