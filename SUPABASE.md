# Configuração de banco e autenticação

> Para instalação e publicação, siga o [README](README.md). Aplique todas as versões pendentes até 010 em ordem. Os passos e resultados abaixo registram a primeira etapa de autenticação, quando existiam três migrações.

Esta etapa amplia a arquitetura existente React/TypeScript/Vite + Supabase. Não há novo servidor nem substituição de `study_nodes`, `study_materials`, `study_members`, `study_checks` ou `study_notes`. O trabalho é local: nenhum MCP Supabase, CLI instalada, projeto vinculado ou variável de conexão foi encontrado. Nenhuma migração remota foi aplicada.

## Configurações manuais necessárias

1. Escolha um **projeto de desenvolvimento/teste** Supabase. Antes de qualquer aplicação pelo agente, informe URL, project ref e se o ambiente é teste ou produção; o agente deverá listar as migrações pendentes e pedir sua confirmação para aquele destino. Não envie senha do banco ou chave administrativa no chat.
2. Faça backup se houver dados. No SQL Editor do projeto escolhido, execute, em ordem, as migrações em `supabase/migrations/`: `202611250001_study_library.sql`, `202611250002_relational_auth.sql`, `202611250003_integrity_admin.sql`. Se a 001 já foi aplicada, execute somente 002 e 003. Use uma transação por arquivo (`BEGIN;`/`COMMIT;`) e registre as versões no fluxo de migrações da sua equipe; não reaplique arquivos já executados. A 001 original foi preservada. As demais são aditivas e não apagam nem reiniciam progresso. Registros antigos recebem timestamps da execução da migração, pois a data original não estava armazenada.
3. Em **Authentication → Providers → Email**, habilite e-mail/senha, confirmação de e-mail e cadastro. Defina senha mínima de 12 caracteres. O frontend também exige 12 no cadastro e recuperação. O trigger `study_authorized_signup` em `auth.users` bloqueia novos cadastros que não estejam autorizados na tabela, mesmo se o cliente chamar Auth diretamente. Não é preciso configurar Auth Hook separado. Contas existentes são preservadas e recebem perfil na migração.
4. Configure SMTP de produção com seu provedor, remetente autorizado e limites adequados em Authentication. Para teste, observe as restrições de destinatários e envio do provedor padrão. Valide entrega dos e-mails de confirmação e recuperação antes de liberar uso.
5. Em **Authentication → URL Configuration**, configure Site URL com a origem/caminho real do app, incluindo subpasta quando houver. Adicione **exatamente** as URLs de confirmação e recuperação à lista Redirect URLs, por exemplo `http://127.0.0.1:5173/` e `http://127.0.0.1:5173/?flow=recovery` para o Vite local; em hospedagem com subpasta: `https://SEU-HOST/central-de-estudos/` e `https://SEU-HOST/central-de-estudos/?flow=recovery`. Use HTTPS em produção e evite curingas amplos.
6. Mantenha templates de confirmação e recuperação que apontem para `{{ .ConfirmationURL }}`. O SDK usa PKCE, troca o código de retorno e mantém renovação de sessão. Abra o e-mail no **mesmo navegador e dispositivo** da solicitação. A tela reage a `PASSWORD_RECOVERY`, solicita a nova senha, chama `updateUser` e encerra as sessões globais após sucesso. Tokens de acesso já emitidos podem valer até o vencimento; logout não revoga instantaneamente todos os JWTs. Configure o tempo de expiração da sessão conforme sua operação.
7. Copie `.env.example` para `.env.local` e preencha apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Reinicie Vite. Nunca use `service_role`, secret key ou senha do PostgreSQL em variáveis `VITE_*`, arquivos públicos, GitHub ou frontend. O SDK persiste a sessão e renova tokens automaticamente; a interface acompanha entrada, renovação, recuperação e saída, descartando o workspace ao trocar de conta.
8. Autorize o primeiro e-mail pelo SQL Editor confiável, adaptando somente o endereço:

```sql
insert into public.study_signup_allowlist(email, expires_at)
values (lower('EMAIL_AUTORIZADO'), now() + interval '7 days')
on conflict(email) do update
set expires_at=excluded.expires_at, consumed_at=null;
```

Depois do cadastro, confirmação e conferência do UUID em Authentication → Users, um operador confiável pode nomear o administrador:

```sql
insert into public.study_roles(user_id, role)
values ('UUID_CONFERIDO_DA_CONTA'::uuid, 'admin');
```

O cliente não pode gravar essa tabela nem alterar a identidade do perfil. `user_metadata` é ignorado para permissões. Um administrador autenticado pode chamar a RPC `study_authorize_email(address, valid_until)` para autorizar outro e-mail por até 30 dias; a função confere seu papel no banco. Não há tela de administração nesta etapa. Cada autorização é consumida na criação da conta; falhas na transação não consomem autorização. Para desautorizar um cadastro ainda não usado, remova o e-mail da allowlist no SQL Editor. Isso não desativa uma conta existente; para tanto use as operações de usuário do Supabase Auth.

9. Em Storage, confira o bucket `study-materials`: **Private**, limite de 20 MB, MIME PDF/PNG/JPEG/WebP. As políticas versionadas da 001 autorizam upload só no caminho do próprio dono e leitura conforme o material e o acesso ao concurso; não crie uma política pública adicional. O aplicativo gera links de 60 segundos. Revogação impede novos links, mas links previamente emitidos podem valer até expirar. Faça o teste com duas contas abaixo. Arquivos e metadados têm compensação de falhas, não uma transação distribuída.

## Modelo relacional

| Grupo                   | Tabelas                                                                                                                                                                  | Acesso                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade              | `study_profiles`, `study_roles`, `study_signup_allowlist`                                                                                                                | Perfil próprio; papéis consultáveis pela própria conta; atribuição somente por operador confiável. Allowlist fechada ao cliente, exceto RPC administrativa restrita. |
| Concurso e edital       | `study_nodes`, `study_contest_versions`, `study_version_items`, `study_members`                                                                                          | Estrutura mantida com os mesmos UUIDs; dono e membros autorizados. Versões preservam nomes e posições dos nós em registros separados.                                |
| Participação            | `study_enrollments`                                                                                                                                                      | Vínculo e status de interesse individuais; não concede acesso ao catálogo sozinho.                                                                                   |
| Conteúdo compartilhável | `study_materials`, `study_bibliographies`, `study_questions`, `study_question_options`, `study_exams`, `study_exam_items`, `study_decks`, `study_cards`, `study_prompts` | Dono administra; destinatários explícitos leem quando também possuem acesso à estrutura. Opções, itens e cartões herdam acesso de questão, simulado e baralho.       |
| Estudo individual       | `study_progress`, `study_checks`, `study_notes`, `study_sessions`, `study_external_results`                                                                              | Somente a própria conta, inclusive contra administrador de catálogo.                                                                                                 |
| Prática individual      | `study_exam_attempts`, `study_answers`, `study_errors`                                                                                                                   | Tentativas, respostas e erros individuais. Respostas guardam snapshots e não podem ser editadas/removidas pela API após registro.                                    |
| Revisão individual      | `study_fsrs_states`, `study_review_logs`                                                                                                                                 | Estado por usuário/cartão e histórico append-only. Campos de estabilidade, dificuldade, estado, repetições, lapsos, vencimento, versão e parâmetros do algoritmo.    |
| Planejamento/importação | `study_daily_plans`, `study_plan_items`, `study_imports`                                                                                                                 | Dados individuais; chaves de idempotência por usuário para importações, sessões e revisões.                                                                          |

Todas as tabelas têm RLS, chaves estrangeiras e timestamps. UUIDs estáveis e donos são imutáveis. Os novos registros históricos têm vínculos imutáveis. FKs compostas `(id,user_id)` impedem ligar respostas, erros, planos e revisões ao pai privado de outra pessoa. Índices cobrem FKs, vencimento FSRS e consultas cronológicas. CHECKs validam contagens, enums, durações e snapshots. A participação não substitui `study_members`, que define permissão de leitura/edição do catálogo. Compartilhamento continua compatível com o contrato `shared_with` já usado pela biblioteca.

Esta etapa fornece o banco dos módulos futuros, sem implementar importador, planejador, simulados ou algoritmo FSRS. O schema não calcula notas nem agenda revisões por conta própria. Antes dessas etapas, defina transações de revisão, formatos de questão, contratos JSON e parâmetros do algoritmo. Os cartões antigos da biblioteca permanecem materiais; não foram convertidos ou duplicados automaticamente.

## Teste direto da API com duas contas

Crie duas contas **descartáveis, autorizadas e confirmadas**, distintas, em projeto de teste após aplicar as migrações. A conta B não deve ser administradora. Em um terminal local, defina estas seis variáveis de ambiente sem gravar valores em arquivos versionados:

```text
TEST_SUPABASE_URL
TEST_SUPABASE_PUBLISHABLE_KEY
TEST_USER_A_EMAIL
TEST_USER_A_PASSWORD
TEST_USER_B_EMAIL
TEST_USER_B_PASSWORD
```

Execute `node scripts/test-api-isolation.mjs`. O script chama diretamente Supabase Auth, PostgREST e Storage: autentica A/B, verifica bloqueio de leitura/edição/exclusão/inserção dos dados de A por B, tentativa de autoatribuição de administrador, perfil privado, arquivo privado, compartilhamento e revogação de novos links assinados. Ele cria somente fixtures identificadas de teste, não usuários. Tenta remover sessão, nota, material, arquivo e participação ao terminar; a estrutura do edital fica retida porque a API não tem permissão para excluí-la. O script imprime seus três UUIDs para limpeza manual no SQL Editor, dos filhos para o pai, depois de conferir dependências. Em caso de falha de rede, confira as fixtures antes da remoção. Não use produção.

Na sessão atual, o comando retornou **SKIP** por falta das seis variáveis; nenhuma API foi chamada. O teste local aplica as três migrações à engine PostgreSQL PGlite e usa duas identidades para testar as políticas reais, perfis, cadastro autorizado, admin, FKs, entidades privadas e Storage simulado. Testes de React verificam cadastro, recuperação e sessão usando SDK mockado. Isso não comprova envio de e-mail, renovação de token, upload HTTP nem isolamento real do projeto remoto. Valide esses pontos e recarregue dados em dois dispositivos antes de marcar a etapa remota concluída.

Referências oficiais: [Auth por senha](https://supabase.com/docs/guides/auth/passwords), [recuperação](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
