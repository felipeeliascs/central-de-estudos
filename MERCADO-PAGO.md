# Preparação para Mercado Pago

A integração não está ativa. O acesso permanece gratuito; não há checkout, coleta de cartão, chamada de pagamento, endpoint de webhook ou ativação automática de plano nesta versão.

## Fundação implementada

A migração 017 prepara:
- `study_billing_subscriptions`: vínculo único por conta, identificador externo, nome do plano, estado e fim do período.
- `study_billing_events`: identificador único de evento, recepção e processamento, para futura deduplicação.
- `study_my_billing_summary`: a pessoa consulta somente o próprio resumo, sem identificador externo.
- `study_admin_billing_overview`: contadores administrativos, sem detalhes de cartão, chaves ou payloads.

As tabelas têm RLS e nenhum acesso direto de anon/authenticated, inclusive administradores do aplicativo. Escritas ficam no ambiente confiável do servidor (service_role). Mesmo um registro de assinatura autorizada de teste não muda o acesso gratuito: as RPCs mantêm `charging_enabled=false` e `integration=not_configured`.

Meu Perfil e Administração consultam esses resumos. Não existem campos para colar credenciais no navegador.

## Próxima etapa de implementação

1. Definir plano, preço, periodicidade, cancelamento e regras de acesso antes de cobrar. Não há valores fictícios pré-ativados.
2. Implementar backend separado do GitHub Pages, por exemplo Supabase Edge Functions. Validar JWT, resolver auth.uid no servidor, gerar external_reference próprio e impedir preços/plano/usuário arbitrários enviados pelo cliente.
3. Usar contas e credenciais de **teste** separadas. A seleção de ambiente no painel é a referência; não presumir ambiente pelo prefixo do token.
4. Guardar Access Token e segredo de webhook em secrets do backend, nunca VITE_*, GitHub público, código, PR, query string, localStorage ou build. O exemplo contém somente nomes vazios.
5. Implementar assinatura conforme API de subscriptions/preapproval e credenciais oficiais. Nenhum segredo deve chegar ao frontend.
6. Implementar webhook conforme documentação vigente: validar assinatura, consultar o recurso na API do provedor, conferir conta/moeda/valor/plano/usuário e persistir o estado confirmado em transação. Não confiar na URL de retorno do checkout como confirmação de pagamento.
7. Deduplicar/reprocessar eventos e impedir regressões de estado por eventos fora de ordem. O ID de entrega e o ID do recurso não devem ser tratados como equivalentes sem conferir o contrato do evento. A tabela preparada deve ser adaptada ao identificador efetivo validado.
8. Homologar duplicatas, renovação, pausa, cancelamento, reembolso, atraso, falha de rede e reconciliação com dados fictícios. Só então implementar e autorizar a mudança das RPCs de acesso e a cobrança real.

Referências oficiais consultadas:
- [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/credentials): Access Token é privado e deve ficar no backend.
- [Webhooks](https://www.mercadopago.com.br/developers/en/docs/checkout-pro-orders/resources/notifications/webhooks): notificações para atualização no backend e validação da origem.
- [Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview).

Esta preparação não confirma configuração da conta Mercado Pago do usuário e não cria cobranças.
