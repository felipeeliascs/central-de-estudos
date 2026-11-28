# Relatório — Administração, Biblioteca e estudo

Implementação em branch própria a partir da main `2650c89b7a7604f1aa4a64c910ee298400f0708a`. [PR #5](https://github.com/felipeeliascs/central-de-estudos/pull/5). O PR #4 de incidência permanece independente.

## Resultado e responsabilidades

| Área | Comportamento |
|---|---|
| Administração | Disponibilizar concursos no catálogo de contas autenticadas, com prévia e confirmação. Retirar da descoberta mantém seleções e estudo anteriores. Adoção manual não compartilha materiais privados. |
| Meu Perfil | Atalho administrativo para o próprio perfil e continuidade dos pedidos de exclusão, sem acesso geral a fotos, telefone ou dados de estudo alheios. |
| Abrir Edital | Página informativa própria: concurso, dados documentados, questões/pesos, hierarquia recolhível, bibliografia exigida e portal oficial. |
| Estudar | Contexto de aprendizagem por conteúdo, usando materiais da Biblioteca. Atalhos de questões, flashcards/revisões e sessões recebem o contexto. |
| Biblioteca | Acervo independente: cadastro, busca/filtros, leitura/edição, importação e vínculos múltiplos, sem cópia de conteúdo/arquivo. |
| Plano de Estudos | Mesma persistência diária/semanal, seletor compacto e acesso aos conteúdos das tarefas. Recálculo confirmado preserva concluídas e histórico. |
| Desempenho | Indicadores gerais visíveis; cinco seções detalhadas recolhidas, com preferência de expansão por conta. |
| Mercado Pago | Fundação de dados e resumos administrativos/pessoais. Uso gratuito; cobranças desativadas. Sem checkout ou comunicação com o provedor. |

## Arquitetura e redundâncias eliminadas

A Biblioteca e Estudar deixam de abrir a mesma tela. Os dois ambientes usam `study_materials` como fonte única; a Biblioteca gerencia e Estudar consome. Não foi criado bucket ou repositório paralelo de conteúdo.

A migração 018 preserva os UUIDs e o assunto original como âncora compatível, permite novos materiais sem concurso e acrescenta vínculos pessoais em `study_material_links`. Um material pode atender vários assuntos/concursos; atualizar o registro reflete em todos os vínculos. Desvincular não exclui o original. Metadados bibliográficos existentes são preservados e sincronizados; notas privadas, questões, respostas, decks, revisões, sessões e históricos não são convertidos nem apagados.

Menus de ações reutilizáveis substituem a exposição simultânea de editar/duplicar/arquivar/exportar/excluir em concursos e ações secundárias dos materiais. O portal oficial usa uma única referência identificada, sem apagar outras fontes nem modificar o schema JSON de concursos.

Importações antigas do catálogo não são fundidas automaticamente entre si: os originais e seus IDs são preservados. Vínculos/sugestões permitem reutilizar esses recursos sem reimportar. O importador próprio do acervo identifica possíveis duplicatas e pede decisão explícita, sem unificação destrutiva.

## Equivalências e evidências

Equivalência integral exige comparação documentada de conteúdo e profundidade; parcial exige complementos. Associações antigas ficam parciais/a revisar. Não há associação por título semelhante nem inferência transitiva automática.

Materiais acessíveis são sugeridos para vínculo manual. Checklist pode ser reaproveitado somente de equivalência integral revisada, com confirmação e snapshot. Questões, sessões e revisões permanecem nos registros originais. O mapa de domínio pode consultar as evidências originais diretamente equivalentes, deduplicadas por assunto, com identificação desse reaproveitamento. Totais gerais não duplicam eventos; pesos e prioridades continuam específicos do destino.

## Migrações

- **202611280017_admin_catalog_billing.sql**: disponibilidade administrativa, preservação de acesso após retirada e fundação privada de assinaturas/eventos. Clientes, inclusive administradores do aplicativo, não escrevem tabelas de cobrança.
- **202611280018_central_library.sql**: metadados, vínculo opcional de origem, vínculos múltiplos, importação transacional, equivalências revisadas e proteção da exclusão de concursos com vínculos da Biblioteca.

São aditivas, exigem 001–015 e independem da 016. Nenhuma foi aplicada em produção. A publicação não executa migrações. A preparação do Mercado Pago usa somente nomes vazios de secrets do backend; não há chaves privadas no código ou PR.

## Testes e inspeção

[Execução de referência aprovada](https://github.com/felipeeliascs/central-de-estudos/actions/runs/46103895048), commit `d931680`:
- Lint sem avisos, **120 testes em 32 arquivos**, build TypeScript/Vite.
- PostgreSQL/PGlite descartável: adoção de catálogo, permissões de estudante/admin/anônimo, ausência de inscrição automática, preservação ao retirar da descoberta, notas privadas, vínculos, atualização única, rollback de lote, reimportação, snapshot desatualizado e equivalência parcial/integral.
- UI: prévia/confirmação de disponibilidade, erro de migração, edital informativo, cadastro com duplicidade, arquivo/colagem, uso de existente, filtros, menus, teclado e preferência privada de expansão.
- Chrome no runner: 1440×900, 768×1024 e 390×844, início/perfil/estudo/catálogo/edital/Biblioteca/plano/desempenho, navegação por Enter, largura sem overflow, console/runtime, subpasta, service worker e recarga offline.
- Capturas do runner inspecionadas. A verificação encontrou e levou à correção da rolagem horizontal do seletor de planos no celular. Também foram ajustados contraste da seleção, espaçamento das tarefas e repetição de título/cartão no acervo.

As verificações do commit final ficam no PR. Capturas e relatório do navegador estão no artefato **verificacao-visual** do Actions, com retenção de sete dias. O projeto e os testes foram executados somente no runner; foram baixadas apenas capturas fictícias para inspeção.

## Limitações e pendências

Auth/Storage no teste SQL são simulados. O navegador testa o modo demonstração; fluxos administrativos são exercitados por testes de UI e banco, sem credenciais reais. Falta homologação HTTP/PostgREST e upload/link assinado de PDF/imagem em Supabase separado com duas contas fictícias.

A deduplicação sugere por ID, URL/vídeo normalizado, conteúdo ou metadados. Não comprova identidade semântica nem compara binários de PDF/imagem. Manter ambos continua disponível; atualizações de arquivos usam o formulário individual.

Mercado Pago ainda exige implementação de backend, assinatura/consulta de webhook e reconciliação, planos/preços e homologação. Nenhuma cobrança foi habilitada. Consulte [MERCADO-PAGO.md](MERCADO-PAGO.md).

Merge, migrações de produção e Pages dependem de autorização específica. [BIBLIOTECA.md](BIBLIOTECA.md) documenta os contratos e as permissões.

## Arquivos criados ou alterados

### Interface e navegação

- [src/AdminCatalogAvailability.tsx](src/AdminCatalogAvailability.tsx)
- [src/BillingStatus.tsx](src/BillingStatus.tsx)
- [src/AdminDashboard.tsx](src/AdminDashboard.tsx)
- [src/ProfilePage.tsx](src/ProfilePage.tsx)
- [src/ActionMenu.tsx](src/ActionMenu.tsx)
- [src/NoticePage.tsx](src/NoticePage.tsx)
- [src/LibraryImporter.tsx](src/LibraryImporter.tsx)
- [src/LibraryPanel.tsx](src/LibraryPanel.tsx)
- [src/StudyLibraryLinks.tsx](src/StudyLibraryLinks.tsx)
- [src/App.tsx](src/App.tsx)
- [src/Forms.tsx](src/Forms.tsx)
- [src/ContestPanel.tsx](src/ContestPanel.tsx)
- [src/PlannerPanel.tsx](src/PlannerPanel.tsx)
- [src/ProductivityPanel.tsx](src/ProductivityPanel.tsx)
- [src/CollapsibleSection.tsx](src/CollapsibleSection.tsx)
- [src/page-navigation.ts](src/page-navigation.ts)
- [src/styles.css](src/styles.css)
- [src/planner-data.ts](src/planner-data.ts)
- [src/QuestionsPanel.tsx](src/QuestionsPanel.tsx)
- [src/FlashcardPanel.tsx](src/FlashcardPanel.tsx)
- [src/prompts.ts](src/prompts.ts)
- [src/PromptPanel.tsx](src/PromptPanel.tsx)
- [src/AccountMenu.tsx](src/AccountMenu.tsx)

### Dados e contratos

- [src/library.ts](src/library.ts)
- [src/library-import.ts](src/library-import.ts)
- [src/domain.ts](src/domain.ts)
- [src/repository.ts](src/repository.ts)
- [src/equivalences.ts](src/equivalences.ts)

### Banco e preparação do backend

- [supabase/migrations/202611280017_admin_catalog_billing.sql](supabase/migrations/202611280017_admin_catalog_billing.sql)
- [supabase/migrations/202611280018_central_library.sql](supabase/migrations/202611280018_central_library.sql)
- [supabase/functions/.env.example](supabase/functions/.env.example)
- [supabase/functions/.gitignore](supabase/functions/.gitignore)

### Verificação

- [tests/admin-library-sql.ts](tests/admin-library-sql.ts)
- [tests/rls.test.ts](tests/rls.test.ts)
- [tests/library.test.ts](tests/library.test.ts)
- [tests/reference-ui.test.tsx](tests/reference-ui.test.tsx)
- [tests/catalog-management.test.tsx](tests/catalog-management.test.tsx)
- [tests/module-pages.test.tsx](tests/module-pages.test.tsx)
- [tests/prompts.test.ts](tests/prompts.test.ts)
- [scripts/test-browser-local.mjs](scripts/test-browser-local.mjs)
- [.github/workflows/ci-pages.yml](.github/workflows/ci-pages.yml)
- [tests/profile.test.tsx](tests/profile.test.tsx)
- [tests/library-ui.test.tsx](tests/library-ui.test.tsx)
- [tests/ui.test.tsx](tests/ui.test.tsx)
- [tests/action-menu.test.tsx](tests/action-menu.test.tsx)
- [tests/equivalences.test.ts](tests/equivalences.test.ts)

### Documentação

- [README.md](README.md)
- [TASKS.md](TASKS.md)
- [CONCURSOS-JSON.md](CONCURSOS-JSON.md)
- [BIBLIOTECA.md](BIBLIOTECA.md)
- [MERCADO-PAGO.md](MERCADO-PAGO.md)

Este relatório também foi acrescentado ao repositório.
