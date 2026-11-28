# Central de Estudos — roteiro em onze etapas

> Status vigente: auditoria local da primeira versão em [AUDITORIA.md](AUDITORIA.md). Resultados de cada etapa abaixo são históricos. Consulte também a seção de continuidade em nuvem ao final; as pendências históricas não comprovam o estado atual da publicação.

Reconstruído em 25/11/2026. A conversa recuperada menciona um roteiro de onze etapas, mas não devolveu sua lista original. **A sequência abaixo é uma proposta nova**, organizada para cobrir os requisitos confirmados em `SPEC.md`.

Fonte: conversa **Compensa Assinar Qconcursos**, ID `6b07451e-3d1c-83e9-b70b-1a3a2ec0820f`. O acesso devolveu cinco blocos recentes, sem mensagens anteriores e sem anexos; os arquivos originais não foram recuperados. Não há comprovação de cobertura de toda a conversa.

**Histórico:** a recuperação inicial autorizava somente documentação. A implementação e a auditoria local foram autorizadas em pedidos posteriores. Migração em produção e publicação pública requerem confirmação específica.

## Entrega documental desta recuperação

- [x] Conferir a procedência e registrar os limites do histórico acessível.
- [x] Gerar `AGENTS.md`, `SPEC.md`, `TASKS.md` e `INICIAR_CODEX.md` em UTF-8.
- [x] Ler os quatro arquivos e conferir coerência de requisitos, nomes e escopo.
- [x] Criar ZIP com exatamente os quatro nomes na raiz.
- [x] Reabrir o ZIP e comparar cada entrada com seu arquivo separado.
- [x] Preparar links individuais para a resposta e alternativa por prompt sem download.

As caixas desta seção só devem ser marcadas após as verificações locais. Entrega no chat não comprova sucesso de download no computador do usuário.

Verificação local realizada nesta recuperação: leitura dos quatro documentos, conferência de requisitos, ZIP reaberto sem erro de integridade e conteúdo de cada entrada comparado byte a byte com o respectivo arquivo separado. As etapas abaixo incluem verificações posteriores.

## Etapa 1 — Conferência e desenho de implementação

Requisitos: R01–R12. Dependência: autorização futura para planejar a implementação, mantendo ações externas fora do escopo até serem autorizadas.

- [x] Ler os quatro documentos, inspecionar a pasta/repositório existente e proteger alterações do usuário.
- [x] Confirmar os requisitos recuperados e registrar lacunas realmente bloqueadoras.
- [x] Decidir stack, rotas estáticas, organização do código e ferramentas de validação.
- [ ] Definir fronteira entre catálogo, dados privados e administração, além dos contratos de importação iniciais.
- [x] Preparar plano concreto da primeira entrega de software e critérios verificáveis.

**Aceite:** decisões documentadas, hipóteses separadas de requisitos e alvos remotos identificados apenas se necessários. Não criar banco remoto ou deploy como efeito implícito desta etapa.

## Etapa 2 — Base da interface e navegação

Requisitos: suporte a R01–R11. Dependência: etapa 1 e autorização para implementar.

- [x] Criar a base local escolhida com navegação responsiva em português.
- [ ] Incluir estrutura para painel, concursos, edital, biblioteca, planejamento, questões, revisões, prompts e administração.
- [x] Implementar estados de carregamento, vazio, erro e confirmação.
- [x] Preparar configuração por ambiente sem segredos administrativos e compatibilidade com hospedagem estática.
- [x] Usar dados fictícios identificados somente quando necessários para demonstração.

**Aceite:** aplicação local abre, navega no celular e computador e passa nas verificações apropriadas; não apresenta funcionalidades futuras como prontas.

## Etapa 3 — Autenticação, modelo de dados e isolamento

Requisitos: R01 e base de R11–R12. Dependência: etapas 1–2; conexão e alterações em Supabase expressamente autorizadas.

- [x] Preparar migrações versionadas e revisáveis para o modelo inicial.
- [x] Implementar login, sessão, saída e fluxo de recuperação conforme modalidade escolhida.
- [ ] Aplicar políticas de acesso por usuário e administração no ambiente autorizado.
- [ ] Testar duas contas, tentativas de acesso direto e impossibilidade de autoatribuir papel administrativo.
- [ ] Verificar persistência e sincronização de um registro entre dispositivos, incluindo falha de gravação.

**Aceite:** contas isoladas no backend e privilégios controlados; nenhuma chave administrativa no cliente. A administração de catálogo não expõe histórico privado.

## Etapa 4 — Concursos, editais e importador

Requisitos: R02–R03, base de R10. Dependência: etapa 3.

- [x] Implementar cadastro manual, disciplinas, assuntos, vínculos e fonte do edital.
- [x] Definir e validar o contrato versionado de concurso e atualização.
- [x] Implementar prévia de diferenças, erros por campo, confirmação e cancelamento sem efeitos.
- [x] Garantir reimportação idempotente e preservação de progresso em retificações.
- [x] Implementar vínculos revisáveis para conteúdos comuns entre editais.

**Aceite:** cadastrar/importar um concurso, reimportar sem duplicar e atualizar mantendo histórico; correspondências não são aprovadas apenas por nomes semelhantes.

## Etapa 5 — Central de Prompts desde a primeira versão

Requisitos: R10. Dependência: etapa 4 para contratos de concurso; ampliar templates conforme contratos das etapas seguintes existirem.

- [x] Criar biblioteca com os 12 modelos solicitados e instruções de uso.
- [x] Adicionar copiar, instruções e contexto dinâmico de concurso, banca, cargo, disciplina, assunto, autor, obra, quantidade e dificuldade.
- [x] Vincular templates estruturados aos contratos e exemplos dos importadores de concurso, questões e flashcards.
- [x] Distinguir saídas textuais e importadores disponíveis.
- [x] Gerar dados agregados de desempenho para revisão e edição antes da cópia.
- [ ] Validar o fluxo completo de edital → IA externa → JSON → prévia de importação.
- [x] Validar exemplos com os três importadores, executar 36 testes locais, lint e build.
- [ ] Aplicar a migração 009 no Supabase autorizado e validar administração no ambiente conectado.

**Aceite:** Central funcional antes da primeira versão de uso completo, sem API paga obrigatória; contratos futuros não são anunciados como importadores disponíveis.

## Etapa 6 — Biblioteca, videoaulas e Gran Questões

Requisitos: R04 e R06. Dependência: etapas 3–5.

- [x] Salvar recursos e links por assunto, com metadados e estado de verificação.
- [x] Implementar biblioteca pessoal e registro de estudo de aulas.
- [x] Tratar vídeos que não permitem incorporação e links indisponíveis.
- [ ] Salvar/abrir links do Gran e registrar resultados manuais identificados.
- [ ] Definir importação de recursos e atualizar os templates correspondentes.

**Aceite:** recurso salvo é reencontrado na mesma conta em outro dispositivo; uso do Gran funciona por links sem presumir API ou acesso à conta externa.

## Etapa 7 — Planejamento adaptativo, Pomodoro e reta final

Requisitos: R05. Dependência: etapas 4 e 6; dados de questões/revisões serão incorporados quando disponíveis.

- [x] Configurar disponibilidade e critérios de priorização explicáveis.
- [x] Gerar e ajustar plano, preservando prioridades manuais e atividades concluídas.
- [x] Implementar Pomodoro e registro sem duplicação após suspensão/recarregamento.
- [x] Implementar reta final com data conhecida e comportamento explícito sem data.
- [x] Reavaliar recomendações com os dados disponíveis sem inventar desempenho.
- [x] Exibir planos diário e semanal, calendário, ciclo, contagem regressiva e histórico.
- [x] Reagendar pendências e exibir falta de disponibilidade.
- [x] Documentar as regras em PLANEJAMENTO.md. Validação local da etapa: 22 testes em 8 arquivos, lint e build aprovados. Os testes incluem a migração 005 e o isolamento do plano no PostgreSQL local.
- [ ] Aplicar a migração 005 e validar planejamento em Supabase conectado após confirmação do ambiente.

**Aceite:** plano cabe na disponibilidade, atraso pode ser remanejado e relógio não cria tempo fictício ou sessões repetidas.

## Etapa 8 — Questões, simulados e caderno de erros

Requisitos: R07; alimenta R05, R08–R10. Dependência: etapas 4–5 e 7.

- [x] Definir contrato JSON, validação, duplicatas e correção ponderada.
- [x] Implementar prática, simulados e diagnóstico com tempo, distribuição validada, retomada e resultados por disciplina.
- [x] Implementar caderno de erros com vínculos e conversão para flashcards.
- [x] Identificar origem, autorização e revisão editorial.
- [x] Preservar a correção das tentativas quando o gabarito muda.
- [x] Incorporar respostas e registros externos ao dashboard, domínio e planejamento.
- [x] Validar a importação, as cotas, a nota ponderada, o prazo, a retomada, o caderno e o isolamento da migração 008 em PostgreSQL local. A suíte completa passou com 34 testes em 13 arquivos, lint sem avisos e build aprovado.
- [ ] Atualizar os templates na Central de Prompts.
- [ ] Aplicar a migração 008 e validar fluxo conectado no Supabase autorizado.

**Aceite:** uma jornada de simulado gera resultado reproduzível e erros revisáveis, respeitando separação de usuários.

## Etapa 9 — Flashcards e revisão FSRS

Requisitos: R08; integra R05, R07 e R10. Dependência: etapas 5 e 8.

- [x] Verificar documentação, licença MIT e manutenção do ts-fsrs e fixar a versão 5.4.2.
- [x] Implementar baralhos, cartões, filtros, arquivo, compartilhamento, fila, metas, quatro notas e histórico individual.
- [x] Converter entradas do caderno de erros com vínculo à questão original e importar/exportar JSON versionado.
- [x] Preservar o estado ao editar ou arquivar e garantir a gravação atômica e idempotente das avaliações.
- [x] Integrar pendências FSRS ao planejamento, com atalho para abrir a fila.
- [x] Validar localmente o agendamento, a sessão na interface, importação, reenvio idempotente e isolamento de duas contas no PostgreSQL. A suíte completa passou com 27 testes em 10 arquivos, lint sem avisos e build de produção aprovado.
- [x] Completar o template de flashcards na Central de Prompts.
- [ ] Aplicar a migração 006 e validar o fluxo conectado no projeto Supabase autorizado.

**Aceite:** agendamento confere com a implementação FSRS, persiste após novo login e permanece independente entre contas.

## Etapa 10 — Dashboard, estatísticas e Raio-X

Requisitos: R09 e exportação de R10. Dependência: etapas 7–9.

- [ ] Definir fontes e fórmulas dos indicadores e regras para ausência de dados.
- [ ] Implementar filtros de período/concurso e visão por disciplina/assunto.
- [ ] Mostrar cobertura, acurácia e prioridade como indicadores distintos.
- [ ] Evitar duplicação de tempo ao reaproveitar assunto em vários editais.
- [ ] Disponibilizar exportação revisável para análise externa de desempenho.

**Aceite:** totais conferem com registros de origem; conta vazia não tem números fictícios e nenhuma exportação inclui dados da outra conta.

## Etapa 11 — Administração, validação integrada e publicação

Requisitos: R11–R12 e validação de R01–R10. Dependência: etapas 1–10; operações remotas e publicação precisam estar autorizadas para os alvos definidos.

- [ ] Completar manutenção de catálogo e templates com verificação de privilégios no backend.
- [ ] Verificar jornadas completas com duas contas e sincronização em dispositivos.
- [ ] Revisar políticas de acesso, importação idempotente, retificações, FSRS e métricas.
- [ ] Completar a revisão de acessibilidade de todos os fluxos. A navegação principal e o estudo passaram no teste de navegador dos três tamanhos.
- [ ] Documentar configuração, recuperação, exportação/backup e limitações reais.
- [x] Preparar workflow local de CI e publicação por GitHub Actions/Pages. YAML validado e build relativo exercitado localmente. A execução remota continua pendente.
- [ ] Após autorização aplicável, publicar no destino definido e observar o resultado; não confundir build local com deploy verificado.

**Aceite:** primeira versão de uso completo inclui Central de Prompts, isolamento e jornadas essenciais verificadas; pendências materiais estão declaradas. Recursos comerciais e ampliações não definidos não entram por inferência.

## Regra de acompanhamento

Marcar uma tarefa concluída somente com evidência. Ao terminar uma etapa futura, registrar resultado, validação e limitações. Não executar as onze etapas automaticamente a partir da entrega destes documentos.

## Continuação — registro de estudos e estatísticas

- [x] Cronômetro por timestamps, pausas, retomada, finalização idempotente e Pomodoro configurável.
- [x] Registro manual e correção de sessões, resultados externos e integração com fontes individuais existentes.
- [x] Dashboard com metas, horas líquidas, cobertura, questões, revisões, desempenho por disciplina, evolução e provas.
- [x] Mapa de domínio por evidências, recência e desempenho, com critérios documentados.
- [x] Raio-X com banca, período, fonte e amostra, cadastro administrativo e filtros.
- [x] Regras, fontes e limites documentados em PRODUTIVIDADE.md.
- [x] Validação local: 31 testes em 12 arquivos, lint sem avisos e build de produção aprovados. A migração 007 e a proteção entre duas contas foram testadas em PostgreSQL local.
- [ ] Aplicar a migração 007 no ambiente Supabase confirmado e verificar autenticação, RLS e dados reais em duas contas.

## Entrega atual — ambiente de estudos e biblioteca (25/11/2026)

Autorização: pedido explícito atual do usuário. O ZIP fornecido tinha somente documentação; nenhuma aplicação ou módulo anterior foi encontrado. A implementação está nesta pasta, sem modificação de sistemas remotos. As onze etapas acima não estão concluídas em conjunto.

Decisões desta entrega: React 19, TypeScript, Vite, Supabase JS, CSS responsivo, Vitest/Testing Library, PostgreSQL local via PGlite e ESLint. Catálogo por concurso com dono, leitores e editores; materiais com dono e compartilhamento de leitura para UUIDs autorizados; notas e checklist estritamente individuais. Rotas internas por estado, build estático com base relativa. Nenhuma importação nova foi anunciada.

- [x] Hierarquia Concurso → Disciplina → Assunto → Subassunto, cadastro e edição de nomes.
- [x] Nove seções por assunto/subassunto conforme o pedido.
- [x] Adicionar, editar, ordenar e remover materiais próprios; leitura de materiais compartilhados. Ordenação remota em transação SQL.
- [x] Políticas SQL locais para Storage privado com isolamento, leitura compartilhada e revogação.
- [ ] Verificar upload e links temporários de PDFs e imagens no Storage conectado.
- [x] Privacidade privada/compartilhada, destinatários explícitos e gestão de acesso ao concurso.
- [x] Player oficial YouTube por consentimento de carregamento, opção de não incorporar, erro de bloqueio e abertura externa permanente.
- [x] Gran por links, fallback geral e instruções por assunto/banca, sem scraping ou sincronização.
- [x] Notas pessoais com salvamento explícito e proteção de alterações pendentes.
- [x] Cinco etapas individuais de checklist e progresso agregado por disciplina/concurso.
- [x] Flashcards de frente e verso por assunto, sem anunciar FSRS.
- [x] Modo demonstrativo fictício separado dos dados Supabase.
- [x] Oito testes locais aprovados, incluindo migração SQL executada com duas contas e tentativas de acesso indevido.
- [x] Lint sem avisos e build de produção aprovados.
- [x] Revisão no navegador em computador e viewport 390 × 844; menu móvel e atualização de progresso observados.
- [x] Instruções de execução, permissões, configuração, referências e limitações em README.md.
- [ ] Configurar projeto Supabase e aplicar migração no alvo escolhido.
- [ ] Exercitar login, uploads, compartilhamento, revogação, URLs temporárias e recarga em dois dispositivos no Supabase real.

Limitações: sem aplicação de migração remota ou deploy; sem recuperação/cadastro público de contas; sem importador, planejamento, simulados, FSRS ou demais módulos fora do pedido. Sincronização por gravação e recarga, sem realtime ou fusão automática de conflitos. Testes de Storage usam as políticas reais com infraestrutura simulada localmente, não o serviço HTTP remoto. Exclusão de arquivos e banco usa compensação, não transação distribuída.

## Continuação — banco relacional e autenticação (25/11/2026)

Escopo: somente esta etapa; arquitetura existente e migração 001 preservadas. MCP Supabase, CLI, conexão e projeto remoto não disponíveis. Não houve alteração remota. As observações de limitações da entrega anterior acima são históricas; as atualizações abaixo prevalecem.

- [x] Ler AGENTS.md, SPEC.md e TASKS.md e continuar a implementação existente.
- [x] Migrações 002/003 aditivas: perfis, papéis protegidos, cadastro autorizado, versões do concurso, participação, bibliografias, estudo, prática, erros, revisão, planejamento, prompts e importações.
- [x] Preservar hierarquia, materiais, compartilhamento, checklist e notas existentes.
- [x] Chaves estrangeiras, vínculos compostos por dono, índices de FKs e consultas, restrições, UUIDs estáveis e timestamps.
- [x] RLS em todas as tabelas, sem privilégio administrativo derivado de user_metadata.
- [x] Autorização de cadastro no banco, consumo único e prazo; administração atribuída somente em ambiente confiável.
- [x] Login/logout global, cadastro autorizado, confirmação por e-mail, solicitação de recuperação, nova senha, sessão persistida, eventos e renovação SDK via PKCE.
- [x] Manter Storage privado com leitura por autorização e links temporários.
- [x] Aplicar todas as migrações em PostgreSQL local/PGlite e testar duas identidades, leitura/escrita privada, referências entre usuários, RLS de conteúdo e Storage simulado, perfis, allowlist e tentativa de autoelevação.
- [x] Testar fluxos Auth em React com SDK mockado; preservar testes da biblioteca. Total: 12 testes em 5 arquivos.
- [x] Lint sem erros/avisos e build TypeScript/Vite aprovados.
- [x] Script direto de Auth/PostgREST/Storage com duas contas pronto; execução atual SKIP, sem chamadas de API.
- [x] Configurações manuais, modelo, proteção de credenciais e limitações em SUPABASE.md.
- [ ] Informar o projeto de teste (URL/ref e ambiente) e confirmar previamente a aplicação remota.
- [ ] Aplicar migrações e configurar Auth/SMTP/URLs no ambiente confirmado.
- [ ] Executar scripts/test-api-isolation.mjs com duas contas descartáveis e verificar entregas de e-mail, retorno PKCE, renovação, arquivos e recarga em dispositivos distintos.

Limites: não foi comprovado isolamento por chamadas HTTP no serviço remoto, pois faltam destino e credenciais de teste. Testes locais executam SQL real com infraestrutura Auth/Storage simulada; testes de autenticação usam SDK mockado. FSRS tem estrutura de estado/histórico, sem algoritmo ou scheduler nesta etapa. Planejador, simulados, importador e Central de Prompts têm modelo de dados, sem novas interfaces. Não houve deploy ou publicação no GitHub.

## Continuação — concursos e importação JSON

- [x] Painel administrativo para cadastro, edição, duplicação, arquivamento, estrutura do edital e bibliografias. Seleção individual de concursos pelo estudante.
- [x] JSON 1.0 por upload ou texto, validação de campos, IDs e referências, prévia de diferenças e confirmação, exportação e dois exemplos fictícios.
- [x] Migração 004 com gravação transacional, controle de edição concorrente, reimportação idempotente, snapshots de versão e recibos.
- [x] Atualizações mantêm os IDs vinculados ao estudo, incluindo adoção de concursos anteriores. Arquivar mantém os registros.
- [x] Equivalência explícita, confirmada por administrador, entre assuntos de concursos distintos.
- [x] Testes do contrato, da confirmação na interface e da transação no PostgreSQL local com dois papéis. 15 testes, lint e build aprovados.
- [ ] Aplicar a migração 004 no Supabase após confirmação do ambiente e validar o fluxo conectado.

O contrato vigente, exemplos, fluxo de retificação e ativação do painel estão em CONCURSOS-JSON.md. A equivalência registra a associação. A consolidação de evidências de estudo entre concursos dependerá da etapa que usar esses vínculos.

## Revalidação — ambiente de estudos e biblioteca

O pedido atual retoma a biblioteca já implementada. Foram conferidos a hierarquia e as nove seções, a gestão de materiais, o checklist individual, as anotações e o progresso agregado. O código mantém o player oficial com abertura externa, links do Gran com orientações de filtro e Storage privado com compartilhamento por usuários autorizados.

- [x] Executar os testes disponíveis: 15 testes aprovados em 7 arquivos, incluindo interface e políticas SQL locais.
- [x] Executar lint sem erros ou avisos.
- [x] Executar build de produção com TypeScript e Vite.
- [ ] Validar autenticação, upload, compartilhamento e sincronização no projeto Supabase real quando houver ambiente configurado e autorização para aplicar as migrações.

Os cartões têm frente e verso para consulta. A revisão espaçada FSRS permanece pendente de sua etapa específica. O modo demonstrativo usa dados fictícios armazenados no navegador e não envia arquivos ao Storage.

## Continuação — interface e PWA

- [x] Página inicial com plano diário salvo, revisões vencidas, progresso do concurso selecionado e acesso ao estudo.
- [x] Navegação por módulos, menu lateral recolhível no computador, menu móvel e preferência de tema claro/escuro.
- [x] Manifesto, ícones e service worker com página informativa de ausência de conexão. O cache não guarda respostas de autenticação, API ou arquivos privados; não há sincronização offline.
- [x] Testes de interface e regressão atualizados; lint e build locais executados.
- [ ] Validar visualmente celular, tablet e computador, teclado e contraste de todas as telas e formulários: o navegador de inspeção encerrou a tentativa de abertura nesta sessão.
- [ ] Validar instalação PWA e atualização do service worker em navegadores reais e os fluxos conectados ao Supabase configurado.

A revisão preserva os painéis anteriores; a cobertura visual e de acessibilidade de todos os módulos não foi comprovada. Nenhum algoritmo, banco ou ambiente remoto foi alterado.


## Auditoria da primeira versão

- [x] Comparar R01–R12 com o código e testes usando a especificação do ZIP como referência.
- [x] Executar instalação limpa, 38 testes locais em 14 arquivos, lint e build. As migrações versionadas 001–010 foram executadas em PostgreSQL/PGlite para os cenários testados.
- [x] Exercitar em Chrome a navegação e o estudo em 1440×900, 768×1024 e 390×844, o build em subpasta, aviso offline, fallback e conteúdo do cache.
- [x] Verificar a rejeição de chave privilegiada no build, a preparação do workflow, a busca local por padrões de credenciais e os alertas do npm.
- [x] Atualizar instruções de instalação, implantação, usuários, importação, atualização, backup e recuperação. Revisar as condições gratuitas dos serviços.
- [ ] Configurar o Supabase homologado e confirmar redirects PKCE, envio de e-mails, upload, links assinados, permissões, RLS pela API e sincronização em dois dispositivos. O script direto de API retornou SKIP por ausência da configuração.
- [ ] Validar recuperação de um backup em ambiente separado e concluir a revisão de acessibilidade e instalação PWA em dispositivos reais.
- [ ] Confirmar repositório, executar o workflow remoto e verificar o endereço e o build resultantes.
- [ ] Após confirmação explícita dos alvos, aplicar migrações em produção e publicar.

## Implantação inicial do Supabase

- [x] Com confirmação explícita, aplicar as migrações versionadas 001–010 no projeto Supabase de destino pelo SQL Editor, em transação. O banco confirmou 39 tabelas da Central com RLS e o bucket privado.
- [x] Autorizar os dois primeiros e-mails por sete dias. A verificação logo após a operação registrou duas autorizações e zero contas criadas. Os e-mails não integram o código.
- [ ] Registrar e reconciliar o histórico de migrações da CLI antes de executar um futuro push de migrações nesse projeto. A instalação inicial ocorreu pelo SQL Editor.
- [ ] Configurar envio de e-mails e redirects, concluir os cadastros, atribuir o papel de administrador depois da confirmação do e-mail e testar duas contas na API real.
- [ ] Confirmar e executar o envio de código ao repositório público e a publicação no GitHub Pages.
- [x] Enviar os 83 arquivos da primeira versão, conferidos por SHA de cada blob, para a branch principal do repositório público autorizado. Commit 31a3dcc.
- [x] Configurar GitHub Pages com origem GitHub Actions, URL e chave publicável no repositório e destinos exatos de confirmação e recuperação no Supabase.
- [ ] Configurar SMTP de autenticação, verificar os logins com duas contas e disparar manualmente a publicação autorizada.

## Meu perfil e troca de senha

- [x] Adicionar a página Meu perfil ao menu e ao cabeçalho. Exibir iniciais, e-mail da sessão e nome de exibição editável.
- [x] Reutilizar o perfil individual e o Supabase Auth. A troca autenticada solicita a senha atual e confirma a nova senha no formulário. A recuperação de senha continua sendo um fluxo separado.
- [x] Verificar 40 testes em 15 arquivos, lint, build e acesso à página em três tamanhos de tela. Os cenários de troca de senha usam Supabase simulado.
- [ ] Publicar a atualização após aprovação para o GitHub Pages.

## Painel de administração

- [x] Adicionar Administração ao menu de contas com papel administrativo, preservando todos os módulos de estudo e Meu perfil.
- [x] Listar contas e estado de confirmação, filtrar por nome/e-mail, autorizar novos cadastros e revogar autorizações pendentes.
- [x] Reunir atalhos para gestão de concursos, editais, modelos de prompts e Raio-X. Os dados pessoais de estudo continuam protegidos pelas regras existentes.
- [x] Verificar 42 testes em 16 arquivos, lint e build. PostgreSQL local verifica privilégios, isolamento, autorização e revogação.
- [ ] Aplicar a migração 011 no Supabase e publicar após aprovação. Administração de contas já criadas e atribuição de papéis seguem no painel do Supabase.

## Continuidade em nuvem — 27/11/2026

- [x] Partir da main 7db85717bb425e79285079c926ba6c7d52eaed9a e ler os contratos e a implementação.
- [x] Oferecer saída textual no menu e no perfil; impedir restauração tardia da sessão encerrada. Cobertura simulada de saída de estudante/administrador e entrada de outra conta.
- [x] Diferenciar remoção da seleção pessoal de arquivamento administrativo. A navegação respeita a seleção; materiais e progresso são preservados. Exclusão definitiva não é oferecida e DELETE de nós é revogado para authenticated.
- [x] Adicionar lote video_batch para edital existente com prévia, referências inválidas, duplicatas por vídeo/assunto e confirmação. RPC valida papel e edição, IDs, URLs, concorrência e preserva a projeção transacional existente.
- [x] Atualizar prompt de videoaulas para o contrato importável e exigir o JSON existente com IDs externos.
- [x] Reutilizar Raio-X no edital com unidade de amostra explícita (provas/questões), banca, período, fonte e denominador. Legados sem unidade não recebem percentuais.
- [x] Executar lint, testes e build no GitHub Actions. Resultado e link da execução do commit final registrados no PR #1; as verificações são repetidas automaticamente a cada correção.
- [ ] Homologar Supabase Auth real (saída, entrada de outra conta e duas abas), API/PostgREST/RLS, upload/Storage e dispositivos reais. Os testes deste PR usam Auth simulado e PostgreSQL/PGlite descartável no runner, sem credenciais de produção.
- [ ] Após revisão e aprovação: reconciliar histórico do banco, ensaiar e aplicar 202611270012_video_incidence.sql (001–011 são pré-requisitos), incorporar o PR e disparar Pages manualmente.

Diagnóstico de Aparecida: o prompt original de videoaulas tinha target none e saída textual, incompatível com o importador contest 1.0. O caminho válido do importador grava recursos video como materiais youtube/Videoaulas e converte item (ID externo) no UUID do assunto via item_map. Não foram fornecidos JSONs originais nem recibos/snapshot do caso “Concurso Público 01/2026 - Prefeitura Municipal de Aparecida”, banca AVANÇASP. Não foi consultado o banco de produção. Não é possível confirmar se houve gravação, falha de importação ou ID incorreto naquele caso. A validação usa exclusivamente exemplos fictícios. Ver CONCURSOS-JSON.md.


## Módulos na área principal — 27/11/2026

- [x] Renderizar Meus concursos, Planejamento, Central de Prompts e Desempenho dentro de main#conteudo.workspace, sem dialog, sobreposição ou bloqueio do restante da interface.
- [x] Centralizar a seleção do módulo, preservar o menu lateral, marcar a página ativa e direcionar o foco para a main após navegar.
- [x] Adaptar atalhos do Início, Administração, importadores e resultados externos à navegação por página. Desempenho abre no dashboard.
- [x] Exibir Meus concursos também na demonstração, com acesso aos editais fictícios.
- [x] Preservar os diálogos de formulários e confirmações específicas.
- [x] Aprovar lint, 58 testes em 20 arquivos e build no GitHub Actions do PR #2. A falha inicial de tipagem nos seletores dos testes foi corrigida. Execução aprovada: https://github.com/felipeeliascs/central-de-estudos/actions/runs/46062660302.
- [ ] Incorporar e publicar após confirmação. Não há migração nova de banco nesta mudança.


## Perfil e páginas de referência — 27/11/2026

- [x] Adaptar perfil, cartões de concursos e painel de desempenho às referências fornecidas, preservando a identidade real da conta e sem inventar plano pago, vagas, cursos ou assinatura.
- [x] Adicionar nome, usuário, telefone, descrição e foto privada. A foto aceita PNG/JPEG/WebP de até 2 MB; o e-mail de autenticação permanece somente leitura.
- [x] Mostrar uso gratuito e privacidade real. Permitir solicitar/cancelar exclusão ao administrador, com confirmação explícita e sem exclusão automática. A Administração consulta as solicitações pendentes.
- [x] Adicionar resumo de questões no Início, indicadores, distribuição, estado vazio, atalhos de período e busca/filtro de concursos.
- [x] Manter cabeçalho e botão Fechar fora da região rolável dos diálogos e personalizar barras de rolagem com CSS.
- [x] Adicionar URLs distintas (?page=...) e caminhos clicáveis; restaurar links diretos e tratar Voltar/Avançar do navegador com proteção de anotações não salvas.
- [x] Aprovar lint, testes e build remotos desta ampliação do PR #2. Execução aprovada de referência: https://github.com/felipeeliascs/central-de-estudos/actions/runs/46064278287. O PR registra também as verificações do commit final.
- [ ] Homologar migração 013, upload e links assinados de foto no Storage real com contas fictícias. Nenhuma migração de produção aplicada. 001–012 são pré-requisitos.
- [ ] Incorporar e publicar somente após confirmação.


## Trilhas, menu da conta e ofensiva — 27/11/2026

- [x] Manter Planejamento e Central de Prompts dentro da main, sem dialog; adicionar Trilhas com URL própria.
- [x] Criar trilha semanal com linha do tempo, disponibilidade diária, estimativas, pré-requisitos e registro individual de conclusão. Reorganizar pendências preserva o histórico concluído.
- [x] Priorizar incidência documentada da mesma banca e unidade, respeitando pré-requisitos; a urgência do conteúdo dependente antecipa sua base, sem atribuir a frequência do dependente ao pré-requisito. Sem dados suficientes, mostrar prioridade estimada e sequência revisável.
- [x] Acrescentar o prompt Organizar trilha lógica de estudos, com contrato study_trail 1.0, UUIDs reais do contexto, importação, prévia, referências/ciclos validados e confirmação. Reimportar configuração não apaga progresso nem materiais.
- [x] Trocar profile-trigger por menu da conta com identidade real, atalhos, modo noturno, ajuda, uso gratuito e saída, incluindo Escape, setas e clique externo.
- [x] Calcular ofensiva atual e recorde com dias de tempo de estudo, questões ou revisões; deduplicar o dia em America/Sao_Paulo. Não contar páginas abertas, planejamentos nem estimativas como atividade.
- [x] Aprovar lint, 78 testes em 25 arquivos e build no CI remoto. Referência: https://github.com/felipeeliascs/central-de-estudos/actions/runs/46068758751; o PR registra o check do commit final.
- [ ] Homologar a migração 014 após 001–013, incluindo RLS/PostgREST e ofensiva com contas fictícias. Não há aplicação automática em produção.
- [ ] Incorporar e publicar após confirmação. A versão publicada no Pages ainda pode exibir os diálogos antigos até a aprovação e implantação do PR #2.

## Correção do fluxo de importação e cobertura — 27/11/2026

Esta seção atualiza o estado do ambiente; as listas anteriores são registros históricos.
- [x] Conferir main b0a225f, ausência de AGENTS.md remoto e preservar a cópia local de prévia sem Git.
- [x] Unificar análise de upload/colagem, traduzir sintaxe com posição quando disponível, preservar entrada e manter validação estrita.
- [x] Manter limite de 180 caracteres, corrigir índice de recurso no erro do lote e explicitar limites nos prompts.
- [x] Destacar erros primeiro, identificar aula/ID/campo e resumir bloqueios junto à confirmação, distinguindo duplicatas válidas.
- [x] Adicionar quantidade fixa ou cobertura completa por todos os assuntos/subassuntos ativos, inclusive pais, com IDs externos exatos e novo ID ao trocar vídeo.
- [x] Corrigir IDs/nomes/rótulos dos três controles da importação e cobrir foco por teclado.
- [x] Preparar reprodução sintética de 31 vínculos com conflito de Planejamento Reverso, testes de UI e transação/idempotência/preservação no banco descartável.
- [x] Confirmar somente por leitura componentes 012–014 instalados e publicação anterior no workflow 43; não alterar produção nesta tarefa.
- [x] Documentar aviso de CSP não reproduzido, busca estática e falta de origem/linha/pilha no Chrome original, sem adicionar unsafe-eval.
- [ ] Validar o arquivo original corrigido quando for disponibilizado; nesta tarefa foi fornecido somente o texto do pedido.
- [ ] Homologar Auth/PostgREST real com contas fictícias e ambiente separado quando disponível.
- [ ] Após revisão, obter autorização específica para merge e Pages. Nenhuma migração nova é necessária.

Resultados das verificações em nuvem e commit final são registrados no PR desta branch. Detalhes em IMPORTACAO-DIAGNOSTICO.md.

## Gestão de concursos e seções recolhíveis — 27/11/2026

- [x] Reunir Arquivar/Reativar e Excluir concurso importado nos cartões, distinguindo remoção pessoal e ações do catálogo.
- [x] Exigir prévia, ID externo digitado e confirmação para exclusão definitiva. Oferecer arquivamento quando houver dados vinculados; o servidor revalida todas as contas e a versão do edital.
- [x] Preparar migração 015 com RPCs administrativas, bloqueio por estudos, referências pessoais e planos, gravação transacional e preservação dos recibos. DELETE direto permanece revogado.
- [x] Apresentar Histórico de operações em cartões com data, tipo e indicadores, recolhido por padrão com Exibir/Esconder.
- [x] Usar o mesmo painel na Incidência histórica do edital, mantendo amostra, fonte, período e aviso sobre frequência.
- [x] Acrescentar testes de teclado, confirmação, permissões, bloqueio e rollback com banco descartável. Resultados finais no PR.
- [ ] Após autorização específica, aplicar 202611270015_catalog_deletion.sql em produção e publicar a interface. Sem a migração, o botão orienta arquivar e não executa exclusão.

## Administração, Biblioteca e reorganização — 28/11/2026

- [x] Partir da main 2650c89, mantendo PR de incidência independente e sem alterar produção.
- [x] Preparar disponibilidade administrativa, confirmação e preservação das seleções ao retirar da descoberta.
- [x] Atualizar acessos de perfil e preparar resumos/tabelas privadas para Mercado Pago, sem ativar cobrança.
- [x] Distinguir Abrir Edital informativo, Estudar contextual e Biblioteca como acervo único, com URLs próprias.
- [x] Criar vínculos múltiplos sem cópia, metadados, filtros, decisões de duplicidade e importação transacional library_batch.
- [x] Preservar os contratos existentes, arquivos e IDs; documentar migrações aditivas 017 e 018.
- [x] Reorganizar ações em menus, equivalências integral/parcial e consulta do portal oficial sem fontes redundantes.
- [x] Manter Plano de Estudos diário/semanal no mesmo modelo, com abertura contextual e confirmação de recálculo.
- [x] Recolher seções detalhadas de desempenho e guardar preferência por usuário.
- [x] Aprovar lint, 120 testes/32 arquivos, build e Chrome em 1440/768/390 pixels; referência Actions 46103895048. O PR registra o commit final. Relatório em RELATORIO-BIBLIOTECA.md.
- [ ] Homologar HTTP/PostgREST e Storage real com contas e arquivos fictícios, quando existir ambiente separado.
- [ ] Autorizar separadamente merge, migrações de produção e publicação. Nenhuma dessas ações foi executada nesta tarefa.

Decisões e limites em BIBLIOTECA.md e MERCADO-PAGO.md.


## Prompt e importação de incidência — 27/11/2026

- [x] Partir da main 2650c89 e conferir implementação, documentação e ausência de AGENTS.md na árvore.
- [x] Adicionar prompt Calcular incidência por assunto · JSON, com unidade escolhida, IDs externos de todos os assuntos/subassuntos ativos e contagem documentada sem quantidade fixa.
- [x] Criar contrato incidence_batch 1.0, arquivo/colagem, prévia, duplicatas, substituições, lacunas, omissões e confirmação após revisão das fontes.
- [x] Reutilizar erros de JSON em português, linha/coluna quando disponíveis, texto preservado, limites, índice original e destaque das linhas inválidas.
- [x] Preparar migração 016 com papel/permissão no servidor, validação integral, transação, concorrência e reimportação idempotente; preservar materiais/progresso.
- [x] Acrescentar testes de contrato, UI e SQL com corpus e contas fictícios; resultado final registrado no PR.
- [ ] Homologar APIs do Supabase com contas fictícias em projeto separado.
- [ ] Aplicar migração 016, incorporar e publicar somente após autorização específica.

Contrato e instruções em INCIDENCIA-JSON.md. URLs e contagens dos testes são fictícias, sem pretensão de evidência real.

## Revisão assistida de importação JSON

- [x] Compartilhar limites dos sete contratos entre diagnóstico, tabela e prompts.
- [x] Permitir correções por campo, identificação de tipo, download e normalização explícita de uma cerca exata.
- [x] Invalidar prévias após edição e preservar validações finais/RPCs.
- [x] Preparar simulação parcial de Roseira — Professor de Matemática, sem inventar Anexo II.
- [x] Validar lint, testes, build e Chrome (1440/768/390 px) no GitHub Actions; resultado final vinculado no PR.
- [ ] Validar Anexo II completo e fluxos Auth/Storage em homologação.

Consulte [decisões, simulação do edital e limitações](JSON-IMPORTACAO-ASSISTIDA.md). Nenhuma nova migração é necessária.
