# Simulação — Guaratinguetá, Coordenador Pedagógico

## Escopo e resultado

Teste do sistema já implantado a partir da main `4e3ff1caf38968814bd2e491da0e7d4b8b5c42e6`, sem cadastro, migração ou publicação em produção. O administrador importa/disponibiliza o edital; uma estudante fictícia seleciona o concurso e executa sua preparação. Uma terceira conta verifica o isolamento.

Resultados finais e commit verificado ficam no PR desta branch. Os testes são executados no GitHub Actions. O computador do usuário foi usado somente para ler/renderizar o PDF e inspecionar capturas da nuvem.

## Dados documentados e rastreabilidade

Fonte fornecida: `PGUA2501_224_20261104091333.pdf.pdf`, **123 páginas**, SHA-256 `e86ec57d58fd0bd13e970e66b572797d0b8591385d568df673d76807ba610e1a`.

[Página oficial na VUNESP](https://www.vunesp.com.br/PGUA2501), consultada em 28/11/2026. A simulação usa a versão do PDF fornecido; não presume que eventuais retificações posteriores estejam incorporadas.

| Campo | Valor | Página do PDF |
| --- | --- | --- |
| Concurso | Público nº 001/2026 | 1 |
| Órgão | Prefeitura Municipal da Estância Turística de Guaratinguetá | 1 |
| Banca | Fundação VUNESP | 1 |
| Cargo | Coordenador Pedagógico | 3 |
| Vagas | 3: 2 ampla concorrência e 1 cota racial; PCD consta como traço | 3 |
| Vencimento / jornada | R$ 6.577,20 / 40 horas semanais | 3 |
| Formação / experiência | Pedagogia ou licenciatura e pós-graduação na área da Educação, conforme texto do edital; 3 anos de docência na Educação Básica | 3 |
| Inscrição | 16/11/2026 às 10h até 15/12/2026 às 23h59 | 8 |
| Taxa / pagamento | R$ 115,00 para ensino superior; pagamento até 16/12/2026 | 8–9 |
| Regime | Celetista | 8 |
| Prova | 50 questões, 5 alternativas, 3 horas, manhã | 19–20 |
| Distribuição | Português 10, Matemática 10, Informática 5, Específicos 25 | 19 |
| Data da prova | **Prevista** para 21/02/2027, a confirmar na convocação | 22 |
| Avaliação | Acertos × 100 / total de questões; habilitação a partir de 50 pontos | 27 |
| Títulos | Até 4 pontos: doutorado 2,5 e mestrado 1,5 | 27 |
| Assinatura | 03/11/2026; não comprova data de publicação | 34 |
| Atribuições do cargo | Texto do Coordenador Pedagógico, sem funções de outros cargos | 38 |
| Cronograma geral | Datas previstas, incluindo eventos “A definir” sem data inventada | 121 |
| Conteúdo geral | Português, Matemática e Informática aplicáveis ao cargo | 52 |
| Conteúdo específico | Somente o bloco de Coordenador Pedagógico | 56–57 |
| Bibliografia | 75 referências do cargo; para antes de Diretor de Escola | 57–61 |

A verticalização contém **4 disciplinas, 30 assuntos e 145 subassuntos** (179 itens, mais o nó do concurso no banco). É uma organização editorial do texto, não uma nova numeração oficial. A divisão de questões existe apenas nas disciplinas: não foram distribuídas 25 questões entre cada assunto nem inventados pesos individuais, minutos, prioridades ou incidências.

O agrupamento `ce-programa` contém os tópicos específicos como subassuntos e recebe a bibliografia integral. Essa associação indica o escopo do programa completo. O edital não informa qual obra cobre cada tópico; não foi inventado esse vínculo individual. Materiais vinculados ao agrupamento ficam acessíveis aos descendentes pelo mecanismo existente da Biblioteca.

Cada referência conserva a citação completa em `text`, autor, recortes/capítulos e edição quando informada. Títulos de consulta foram redigidos dentro do limite de 180 caracteres, mantendo os recortes na referência completa. Os **29 links HTTPS não ambíguos** são copiados como URLs, sem alegar verificação de disponibilidade/conteúdo. Links HTTP, sem esquema ou com término ambíguo permanecem no texto da citação e não são convertidos automaticamente para HTTPS.

## Arquivos prontos para revisão

- `examples/guaratingueta-001-2026-coordenador-pedagogico.json`: contrato contest 1.0, 179 itens, 75 referências, IDs estáveis e `listed:false`.
- `examples/guaratingueta-ficha-consulta.json`: contrato library_batch 1.0 com ficha textual de vagas, salário, requisitos, inscrições, prova e títulos.
- `tests/fixtures/guaratingueta-provenance.json`: origem, hash, páginas, citações e trechos usados para conferência.

A ficha usa a Biblioteca já existente. O contrato de concurso não tem campos estruturados de salário, vagas/cotas, taxa, horários, duração, requisitos, regime, pontuação de títulos ou status “data prevista”. A ficha conserva esses dados como texto; eles **não passam a ser filtros, alertas ou cálculos estruturados**. A data de assinatura não preenche `notice.published_on`. Não foi inventada uma URL direta do PDF.

## Matriz da jornada simulada

| Fluxo | O que é verificado | Evidência |
| --- | --- | --- |
| Cadastro administrativo | Arquivo e colagem, prévia completa, confirmação, gravação e bloqueio para estudante | testes admin-ui, contratos e SQL |
| Disponibilidade e seleção | Fora do catálogo inicialmente; administrador disponibiliza; estudante escolhe sem inscrição automática | SQL real com contas fictícias |
| Abrir Edital | Órgão/banca/cargo, data, distribuição, árvore e 75 referências; sem checklist/editor | NoticePage em React |
| Estudar | Bibliografia herdada do agrupamento; resumo pessoal, anotações privadas e checklist persistentes | React App + Chrome |
| Biblioteca | Cadastro/importação, metadados, ficha de consulta, vários vínculos, desvincular sem excluir, atualização única e reimportação | React, SQL e Chrome |
| PDF/imagens | Tipos permitidos e rejeição de arquivo inválido; política de leitura de objeto privado | validação e SQL de Storage simulado |
| Questões e simulado | 50 questões **fictícias**, em 2 lotes de 25, 5 alternativas; repetição sem duplicar, simulado 180 min com 80 pontos e 10 erros | contratos, UI e RPCs SQL |
| Caderno de erros | Conversão idempotente de um erro em cartão privado | SQL |
| Flashcards/revisão | Importação, revelar verso, avaliação, estado FSRS e idempotência de envio | React + SQL |
| Sessões e desempenho | Sessão fictícia de 30 min, resultado externo 10/8, indicadores e ofensiva sem contar planejamento | React + SQL |
| Plano de Estudos | Data e distribuição no adaptador conectado, disponibilidade fictícia, limites diários, persistência e abertura contextual do conteúdo/materiais | adaptador/motor, SQL e Chrome |
| Trilhas | Configuração, pré-requisitos, geração semanal, persistência e ausência de incidência inventada | motor, UI, SQL e Chrome |
| Prompts / videoaulas | Todos os 175 IDs elegíveis no contexto; lote de URL **sintética de QA**, reimportação e preservação das 75 referências | contratos e suite existente |
| Incidência histórica | Nenhuma evidência criada a partir do edital; lacunas não viram zeros, amostra ou percentual real | contrato e SQL |
| Perfil e uso gratuito | Dados pessoais fictícios privados; resumo gratuito com cobrança desativada | SQL e regressões existentes |
| Troca de conta / privacidade | Outra conta não lê notas, plano, sessões, baralhos, materiais pessoais ou objeto privado | RLS SQL; Auth simulado na suite existente |
| Retificação e remoção pessoal | IDs mantidos, notas/material/50 respostas/revisão preservados; pausar seleção não apaga estudos | SQL |
| Exclusão definitiva | Bloqueio quando há dados vinculados e falta de permissão administrativa | SQL e regressões existentes |
| Equivalências | Suite existente verifica parcial/integral com conteúdo sintético; nenhuma equivalência real com outros editais foi presumida | regressão SQL/React |

Os dados de estudo, questões, exercícios, horários pessoais, perfis e arquivos de teste são fictícios. **O PDF não contém questões, aulas, resumos, mapas mentais ou provas históricas.** Esses conteúdos não foram apresentados como oficiais nem misturados ao JSON do edital.

## Falha encontrada e corrigida

A inspeção da tela de estudo no celular revelou **Materiais disponíveis: 0**, embora a aba Bibliografia exibisse 75 referências herdadas do agrupamento pai. O contador procurava vínculos no conteúdo selecionado e nos descendentes, sem incluir os ancestrais considerados pela lista de materiais.

A correção reutiliza `appliesTo` para incluir o acervo herdado e mantém a contagem agregada dos descendentes nas visões de concurso/disciplina. Cada material é contado uma única vez; arquivados continuam excluídos. O teste React agora exige 75 antes do resumo pessoal e 76 depois; o Chrome exige 75 em cada tela de estudo. Não há alteração de permissões ou armazenamento.

Na demonstração, a disponibilidade padrão deixa atividades fora do horizonte de 28 dias e o sistema avisa sobre a falta de capacidade. Essa estimativa não mede as horas oficiais do edital: disponibilidade, duração e granularidade dos estudos precisam ser revisadas pelo estudante.

## Ambiente e limites

- PostgreSQL/PGlite descartável executa as 18 migrações existentes, RLS e RPCs; não é o Supabase de produção.
- React testa interações reais dos componentes, usando o adaptador de demonstração ou serviços simulados. Chrome testa a aplicação compilada no runner, com dados semeados exclusivamente no navegador isolado do CI.
- Chrome cobre 1440, 768 e 390 px, incluindo árvore/acervo grande, filtros, persistência de anotação/checklist, plano contextual, Trilhas e Desempenho. O artefato `verificacao-visual` contém capturas `ui-guara-*` e relatório.
- Na demonstração, o catálogo é reconstruído a partir dos nós e não inclui todos os metadados/documento remoto; a página informativa com a distribuição e 75 obras é validada separadamente no teste React com o documento completo.
- Auth por e-mail, confirmação, recuperação, PostgREST, transmissão real de PDF/imagem ao Storage e links assinados ainda exigem Supabase de homologação. Este teste não comprova esses serviços integrados.
- Não foi realizada inscrição na VUNESP, envio de títulos, pagamento ou busca de material pago. A plataforma organiza preparação e não substitui os procedimentos oficiais.
- Não foram geradas evidências de incidência histórica; o edital descreve conteúdo exigido, não frequência observada em provas anteriores.
- Sem migrações novas. A única alteração funcional do aplicativo é a correção do contador contextual de materiais, encontrada durante a simulação; as demais mudanças são dados, testes e documentação.
