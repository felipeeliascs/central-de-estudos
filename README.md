# Central de Estudos

Aplicação pessoal para organizar editais, estudar, planejar, resolver questões e revisar com FSRS. O modo demonstração usa conteúdo fictício salvo no navegador. Consulte a [auditoria da primeira versão](AUDITORIA.md) antes de conectar contas reais ou publicar.

## Instalação local

Instale Node.js 24 LTS com npm e execute na raiz do projeto:

```powershell
npm ci
npm run dev
```

Abra o endereço exibido no terminal. Sem variáveis Supabase, a aplicação abre em demonstração. Nesse modo não há conta compartilhada entre dispositivos nem upload para o Storage.

```powershell
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Para repetir a inspeção automatizada em um Chrome isolado, rode `node scripts/test-browser-local.mjs` depois do build. Use `CENTRAL_CHROME` para informar um executável Chromium em outro caminho. O teste serve a demonstração em subpasta, checa os três tamanhos de tela e simula indisponibilidade do servidor local.

O build fica em `dist/`. Use HTTP(S) para servi-lo. O Vite usa base relativa `./`, e a navegação interna usa estado React na URL raiz do aplicativo, sem rotas que precisem de reescrita no servidor. Os links de Auth usam a mesma página, com o parâmetro `flow=recovery` para redefinição de senha.

## Configurar Supabase

1. Use primeiro um projeto de homologação, de preferência sem dados reais. Confira o project ref e o ambiente. Com a CLI do Supabase instalada, execute `supabase init` se ainda não houver `supabase/config.toml`, depois `supabase link --project-ref REF_DE_HOMOLOGACAO`, `supabase migration list` e `supabase db push --dry-run`. Confira as versões pendentes antes de `supabase db push`. Em banco vazio, aplique todas as migrações disponíveis nesta branch, em ordem. Esta publicação reúne as migrações 001–018. As funções de incidência (016) e Biblioteca/administração (017–018) foram verificadas juntas. Num banco existente, faça backup e aplique apenas as pendentes. Se migrações anteriores foram rodadas pelo SQL Editor, confira o histórico real antes de usar a CLI. Nunca marque uma versão como aplicada sem verificar o esquema correspondente.
2. Copie `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` com a URL base do projeto e `VITE_SUPABASE_PUBLISHABLE_KEY` com a chave `sb_publishable_` de **Connect / API Keys**. Reinicie o Vite após salvar. O build aceita apenas essas duas variáveis públicas e rejeita chaves secretas e JWT legados. Desative o modo demonstração somente com um par de valores reais correspondente ao mesmo projeto.
3. Em **Authentication → Providers → Email**, habilite cadastro por e-mail/senha e confirmação de e-mail. Defina senha mínima de 12 caracteres. Configure SMTP com um remetente autorizado e confirme antes a cota e o custo do provedor. O serviço padrão do Supabase restringe destinatários e taxa de envio, então valide confirmação e recuperação com as duas contas de teste. Preserve `{{ .ConfirmationURL }}` nos templates.
4. Em **Authentication → URL Configuration**, configure **Site URL** com o endereço canônico do aplicativo e acrescente os redirects exatos abaixo, incluindo a barra final. Em produção, deixe apenas os destinos autorizados para aquele projeto. Se mudar repositório, host ou subpasta, atualize Site URL e redirects juntos. O PKCE precisa que o link de confirmação ou recuperação seja aberto no navegador e dispositivo que iniciou o fluxo.
5. Confirme o bucket `study-materials` como privado, limite de 20 MB por arquivo e MIME PDF/PNG/JPEG/WebP. Mantenha as políticas das migrações sem permissões públicas adicionais. URLs assinadas duram 60 segundos. A revogação impede emitir novos links. Links já emitidos podem valer até expirar.
6. Mantenha senha do banco, tokens de acesso e chaves administrativas em armazenamento confiável. O GitHub, a pasta pública do Vite e o build recebem somente a URL e a chave publicável. Consulte detalhes de RLS e o teste de duas contas em [SUPABASE.md](SUPABASE.md).

| Ambiente | Site URL e redirect de confirmação | Redirect de recuperação |
| --- | --- | --- |
| Vite local | `http://127.0.0.1:5173/` | `http://127.0.0.1:5173/?flow=recovery` |
| GitHub Pages de projeto | `https://DONO.github.io/REPOSITORIO/` | `https://DONO.github.io/REPOSITORIO/?flow=recovery` |
| GitHub Pages de usuário na raiz | `https://DONO.github.io/` | `https://DONO.github.io/?flow=recovery` |

## Primeiros usuários e primeiro concurso

1. Pelo SQL Editor do projeto de teste, autorize separadamente os dois e-mails com o SQL abaixo. A autorização expira e é consumida na criação da conta. Cada pessoa usa **Cadastrar conta autorizada** com sua própria senha, confirma o e-mail e entra no aplicativo. Depois teste **Esqueci minha senha** e valide o envio no ambiente real.

```sql
insert into public.study_signup_allowlist(email, expires_at)
values (lower('EMAIL_AUTORIZADO'), now() + interval '7 days')
on conflict (email) do update
set expires_at=excluded.expires_at, consumed_at=null;
```

2. Confira o UUID da conta administradora em **Authentication → Users**. Um operador com acesso ao SQL Editor pode atribuir o papel abaixo. As contas comuns não conseguem atribuir papéis. O papel administra catálogo e modelos, sem acesso geral aos dados de estudo.

```sql
insert into public.study_roles(user_id, role)
values ('UUID_CONFERIDO_DA_CONTA'::uuid, 'admin')
on conflict do nothing;
```

3. Entre como administrador e abra **Meus concursos → Importação JSON**. Carregue `examples/concurso-ficticio.json` na homologação e confira a prévia antes de confirmar. A conta estudante deve ativar o concurso em **Meus concursos**. Cadastre estudo e tente a retificação em `examples/retificacao-ficticia.json`, mantendo IDs. Verifique que o progresso permanece e que reenviar o mesmo arquivo não duplica registros. Para cadastro manual, use o mesmo painel e informe a fonte do edital. Consulte [CONCURSOS-JSON.md](CONCURSOS-JSON.md).
4. Para uso diário, **Início** mostra o resumo. **Estudar** e **Biblioteca** abrem os assuntos. **Planejamento**, **Questões**, **Revisões** e **Desempenho** registram atividades individuais. A **Central de Prompts** prepara conteúdo para copiar e usar em ferramentas externas. Gran Questões usa links e lançamento manual de resultados.

## Administração e perfil

O administrador acessa os mesmos módulos de estudo do estudante com a própria conta. O menu **Administração** mostra as contas cadastradas, seus papéis e o estado de confirmação do e-mail. O painel também permite autorizar ou revogar futuros cadastros e reúne acessos a editais, modelos de prompts e Raio-X do edital. O banco valida o papel a cada operação administrativa e mantém privados os registros de estudo de outras contas.

Autorizar o cadastro não envia convite e não cria usuário. A pessoa define a própria senha. Revogar uma autorização pendente não bloqueia contas já criadas. Atribuição de papéis e administração de contas existentes permanecem no painel confiável do Supabase.

Em **Meu perfil**, cada pessoa pode editar o nome de exibição ou trocar a própria senha informando a anterior. A troca autenticada não exige SMTP. A recuperação de senha por e-mail usa o serviço de e-mails do Supabase.

## GitHub e publicação

1. Escolha o repositório e confirme que o código e a documentação podem ser públicos antes de escolher o GitHub Free com Pages. A pasta local ainda não está vinculada a um remoto. Versione o código, o lockfile, exemplos fictícios, `supabase/migrations/` e `.github/workflows/ci-pages.yml`. Exclua `.env.local`, dumps, anexos privados, logs e `dist/`.
2. No repositório, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. Em **Settings → Secrets and variables → Actions → Variables**, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Mantenha a origem em HTTPS no deploy. Os runners públicos podem ler os arquivos do repositório público, e todos podem baixar o JavaScript publicado.
3. Envie a alteração revisada depois de autorizado o destino. O CI instala com `npm ci`, executa lint, testes e build em pushes e pull requests. A publicação está condicionada a um disparo manual na branch padrão. Depois de aprovar **a publicação pública** e completar a homologação, abra **Actions → CI e GitHub Pages → Run workflow**, selecione a branch padrão e digite `PUBLICAR`. O pipeline publica somente `dist/` e não executa migrações.
4. Verifique o endereço informado pelo workflow. Faça login, recuperação, importação, upload privado e recarga em dois dispositivos no host real antes de liberar contas reais. O navegador indica ausência de conexão e usa uma página informativa em recarga offline. Não há escrita offline com sincronização posterior.
5. Antes de escolher Pages para contas reais, considere que a documentação do GitHub Pages desaconselha o uso para transações sensíveis, incluindo senhas. A interface estática envia credenciais diretamente ao endpoint HTTPS do Supabase Auth, não ao servidor de Pages. Se essa arquitetura não for adequada para a operação, avalie outro host antes de publicar o app conectado. Consulte [limites e política de uso do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) e [workflow oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Serviços gratuitos

- GitHub Free oferece Pages em repositórios públicos. Actions com runners padrão hospedados pelo GitHub é gratuita em repositórios públicos. Pages informa limite de 1 GB por site e franquia indicativa de 100 GB mensais de tráfego. Confira [Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) e [cobrança de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- Supabase Free informa até dois projetos ativos, 500 MB de banco por projeto, 1 GB de arquivos, 5 GB de saída de dados, 5 GB de saída em cache e 50 mil usuários ativos mensais. Há pausa após uma semana de inatividade, sem backup automático ou recuperação para um instante anterior no plano gratuito. SMTP tem condições próprias. Confira [preços do Supabase](https://supabase.com/pricing) e [SMTP do Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp).
- A Central de Prompts não exige chave de IA. A disponibilidade gratuita do serviço de IA externo depende dos limites da conta do estudante.

## Atualizações, backup e recuperação

- Antes de atualizar código ou banco, registre a versão implantada e as migrações aplicadas. Rode testes, lint e build. Ensaie as migrações com `supabase db push --dry-run` e dados descartáveis em homologação. Publique após validar compatibilidade entre o build anterior, o esquema atualizado e o novo build. Se o erro estiver limitado à interface, republique o commit estável pelo mesmo fluxo aprovado. A reversão do frontend não reverte dados nem migrações.
- Exporte periodicamente o banco pelo [procedimento oficial da CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Faça dump de papéis, esquema e dados em arquivos separados, preservando usuários e UUIDs. Exporte à parte os objetos de `study-materials` com seus caminhos originais. Dumps de banco incluem metadados de Storage, mas não o conteúdo dos arquivos. Guarde dumps e objetos criptografados fora do GitHub, com acesso restrito. Registre também versões das migrações, configuração de Auth, redirects e templates sem copiar credenciais para a documentação.
- Valide a recuperação em projeto separado. Restaure papéis, esquema e dados conforme o guia, reconstitua as personalizações de Auth/Storage a partir das migrações, restaure objetos pelo Storage e reconfira bucket privado, RLS e permissões. Reconfigure URL, chave publicável e SMTP do destino. Compare contagens de registros e arquivos e execute o teste com duas contas antes de encaminhar tráfego. A exportação JSON de concurso, questões ou flashcards cobre conteúdo específico, não substitui backup do sistema.
- No Supabase Free, a perda potencial de dados vai até o último backup manual válido. Registre a data e ensaie a recuperação antes do uso contínuo. Consulte [backups do Supabase](https://supabase.com/docs/guides/platform/backups).

Veja as regras em [PLANEJAMENTO.md](PLANEJAMENTO.md), [FLASHCARDS.md](FLASHCARDS.md), [QUESTOES.md](QUESTOES.md) e [PRODUTIVIDADE.md](PRODUTIVIDADE.md).

## Perfil e caminhos de navegação

O perfil reúne nome, usuário opcional, telefone, descrição, foto privada, senha e informações de privacidade. O usuário informado no perfil é uma identificação opcional: o login continua usando e-mail. A Central é de uso gratuito e não possui cobrança integrada.

A migração 202611270013_profile_requests.sql acrescenta esses campos e o bucket privado profile-photos, limitado a 2 MB e PNG/JPEG/WebP. Links de foto são assinados por 60 segundos. Perfis e fotos só podem ser acessados pela própria conta. Ensaiar no Supabase de homologação após as migrações anteriores.

“Excluir minha conta” envia uma solicitação ao administrador e exige confirmação. A pessoa pode cancelar enquanto estiver pendente. A Administração lista os pedidos; a interface não exclui contas nem dados de estudo automaticamente. O operador responsável deve conferir os vínculos e combinar o procedimento no ambiente confiável do Supabase. A migração não altera contas existentes nem apaga dados.

As páginas usam URLs com ?page=home, ?page=profile, ?page=catalog, ?page=planner, ?page=prompts e ?page=productivity. O estudo usa ?page=study&item=ID. Os caminhos e o histórico do navegador permitem voltar entre páginas sem depender de rotas de servidor. Não inclua credenciais nos links.

## Trilhas e ofensiva de estudo

Planejamento, Trilhas e Central de Prompts são páginas dentro da main. Se o Pages ainda mostra os diálogos antigos, confira o commit publicado: a incorporação e a publicação do PR são operações separadas.

**Trilhas** organiza uma semana por concurso selecionado, com disponibilidade por dia, pré-requisitos revisáveis, minutos estimados e progresso. A base de um conteúdo prioritário é antecipada para permitir o estudo na ordem lógica; a frequência do conteúdo dependente nunca é atribuída à sua base. O subassunto depende do assunto pai. Não há transmissões ou eventos fictícios.

A ordenação histórica usa apenas evidências completas do Raio-X para a banca do concurso e a unidade escolhida (provas ou questões), exibindo amostra, período e fonte. Sem evidência, a interface identifica prioridade estimada e sequência do edital. Frequência passada não representa probabilidade da próxima prova. São recomendações revisáveis, não uma garantia de distribuição futura.

Na Central de Prompts, **Organizar trilha lógica de estudos** gera study_trail 1.0 com os UUIDs do concurso e assuntos do contexto. Em Configurações da Trilha, cole o JSON, gere a prévia e confirme. Referências inválidas, dependências cíclicas e destinos diferentes são recusados. A importação atualiza apenas as configurações correspondentes, preservando materiais, progresso e sessões concluídas. Reorganizar a semana mantém o histórico concluído e respeita a disponibilidade e a data da prova.

A migração 202611270014_trails_streak.sql cria a persistência privada de trilhas, controle de revisão e a RPC de ofensiva. Requer 001–013 e validação em homologação antes de produção. Cada pessoa só acessa a própria trilha; escritas concorrentes exigem recarga.

O menu da conta abre pelo profile-trigger e oferece identidade, navegação, modo noturno, ajuda e saída. A ofensiva conta dias distintos em America/Sao_Paulo com tempo de estudo finalizado, resultado de questões com quantidade positiva, respostas ou revisões registradas. Várias atividades no mesmo dia contam uma vez. A sequência de ontem continua enquanto hoje ainda está aberto; se ontem e hoje não têm atividade, a sequência atual é zero e o recorde permanece. Registros futuros são ignorados. Abrir páginas, gerar planejamento ou marcar estimativas da trilha não cria tempo estudado nem ofensiva.

## Diagnóstico de importação e estado publicado

O [diagnóstico de importação](IMPORTACAO-DIAGNOSTICO.md) documenta análise estrita por arquivo/colagem, destaque de conflitos, cobertura completa do prompt e limites da investigação do aviso de CSP. A correção não exige migração nova.

A publicação do PR #2 corresponde à [execução 43](https://github.com/felipeeliascs/central-de-estudos/actions/runs/46073219115), commit b0a225f. A consulta atual somente de leitura confirmou componentes das migrações 012–014 instalados; não presuma que continuam pendentes com base nas notas históricas. O histórico da CLI permanece sujeito à reconciliação documentada. Alterações desta investigação aguardam revisão e autorização específica antes de merge ou publicação.

## Biblioteca central e administração

Consulte [BIBLIOTECA.md](BIBLIOTECA.md) para a separação Abrir Edital / Estudar / Biblioteca, vínculos reutilizáveis, importação e permissões. As migrações 017–018 são aditivas e independentes da 016; exigem 001–015 e homologação antes de produção. O painel administrativo inclui disponibilidade de concursos e atalhos de perfil. A [preparação Mercado Pago](MERCADO-PAGO.md) mantém uso gratuito e cobranças desativadas.


## Incidência por JSON

A Central de Prompts inclui **Calcular incidência por assunto · JSON**, para copiar e analisar fontes em uma IA externa. O administrador importa o resultado em **Desempenho → Raio-X do edital → Importar incidência JSON**, com prévia e confirmação da revisão das fontes. Percentuais são calculados a partir de ocorrências/amostra, com unidade, banca e período explícitos. Lacunas não viram zeros inventados. Veja [INCIDENCIA-JSON.md](INCIDENCIA-JSON.md).

A migração 202611270016_incidence_import.sql depende de 001–015 e exige ensaio e autorização específica antes de produção. O cadastro manual continua disponível. O importador valida limites, IDs e concorrência; não verifica automaticamente a veracidade das fontes.
\n

## Revisão assistida de importação JSON

Use a revisão por campo junto ao JSON colado ou enviado. Corrija os registros, gere uma nova prévia e confirme conforme as regras do módulo. O download revisado não grava no banco. Tipos incorretos apontam o destino adequado.

Consulte [decisões, simulação do edital e limitações](JSON-IMPORTACAO-ASSISTIDA.md). Nenhuma nova migração é necessária.
