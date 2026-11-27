# Diagnóstico da importação de concursos e videoaulas

## Base e método

Base: main b0a225fdc00b6dddfd5db29b5eeced42b0603876, merge do PR #2. Não há AGENTS.md na árvore GitHub consultada. A pasta de trabalho local não é um checkout Git; sua cópia de prévia foi preservada. Alterações na branch codex/corrigir-importacao-videoaulas, com validação no GitHub Actions. Nenhum teste ou servidor do projeto é executado no computador do usuário.

## Causas reproduzidas

1. ContestPanel.importPreview chamava JSON.parse antes de parseContest/previewVideoBatch. Assim a interface mostrava a exceção original em inglês; parseContest, por sua vez, descartava posição e motivo. Arquivo e colagem alimentam o mesmo raw. Agora ambos usam parseImportJson, com limite de 512 KiB, BOM opcional e mensagens em português, linha/coluna quando informadas pelo motor ou calculáveis no fim do texto. Não se extraem objetos de introduções, cercas de Markdown ou múltiplos JSONs. Falhas mantêm o texto e o destino para correção.
2. O limite de title era e continua sendo 180 caracteres. Em lotes, a validação isolada de cada recurso reportava sempre resources[0]; agora a mensagem aponta o índice original. Há teste para resources[29].title com 181 caracteres e para o limite válido de 180.
3. O bloqueio de ID reaproveitado para outro vídeo era correto. A interface descartava o sinal error ao renderizar a lista e não resumia a causa junto ao botão. Agora erros aparecem primeiro, com borda, texto, ID, campo, link direto e contagem junto à confirmação. Duplicatas continuam válidas e preservadas. Voltar e corrigir JSON mantém a entrada.
4. O contexto dos prompts sempre enviava quantidade:5. Agora videoaulas tem quantidade fixa ou cobertura completa. A cobertura usa topic e subtopic ativos do JSON exportado, inclusive assuntos com filhos; ancestrais arquivados são excluídos. Os filtros individuais não reduzem esse modo. A meta é ao menos uma aula verificada por ID elegível; quantidade fixa é omitida e lacunas não autorizam inventar links. IDs externos, novo ID ao trocar vídeo/vínculo e títulos de 1 a 180 caracteres estão explícitos.
5. Inspeção DOM do formulário publicado confirmou select de destino, input file e textarea sem id/name. A correção usa IDs por instância com useId, nomes e rótulos associados. Há teste de foco por Tab.

## Reprodução de 31 vínculos

O anexo desta solicitação trouxe somente o pedido, sem video_batch_seduc_sp_matematica_corrigido.json nem o edital original exportado. O sucesso não deve ser atribuído a uma execução desse arquivo indisponível.

tests/video-fixture.ts contém dados sintéticos com 14 assuntos e 17 subassuntos. Reproduz o concurso externo seduc-sp-pefm-01-2026-matematica, item gestao.10 e ID video-gestao-10-wiggins-planejamento-reverso: vídeo anterior plL98oaMLsU e novo eyh02YUVxsI. Títulos e demais aulas são fictícios. Com o ID antigo há um conflito; com novo ID há 31 vínculos válidos, preservando o vídeo anterior.

Testes de interface cobrem upload e colagem, prévia sem gravação, confirmação habilitada para 31 vínculos e bloqueada no conflito. PostgreSQL/PGlite descartável exercita a RPC real: conflito após entradas válidas não altera documento nem projeção; lote válido acrescenta 31 recursos; reimportação mantém contagem e recibos; materiais pessoais, notas e checklist de outra conta são preservados. Auth/Storage são simulados no banco de teste; não equivale a homologação HTTP/PostgREST.

## CSP e aviso do Chrome

Na inspeção do site publicado, registros de console warn/error acessíveis ficaram vazios antes e após abrir Catálogo → Importar JSON. Não foi reproduzida a violação e não há arquivo/linha atribuível com essa evidência. O navegador inspecionado é o navegador integrado; não foi inspecionada a aba Issues do Chrome original nem suas extensões.

Busca estática nos arquivos src/, scripts/, index.html e vite.config.ts não encontrou chamadas eval, new Function, timers com string, unsafe-eval ou definição de Content-Security-Policy. index.html publicado também não expôs meta CSP no DOM. Isso não prova ausência de CSP em cabeçalhos ou de execução por dependência/extensão. Nenhuma política foi removida ou relaxada; unsafe-eval não foi adicionado.

Falta capturar a violação no Chrome original com URL do script, linha, coluna, pilha e origem (aplicação, dependência ou chrome-extension), ou um relatório de CSP. Sem esses dados não é correto atribuir a mensagem a JSON.parse ou a uma extensão.

## Estado do ambiente e autorizações

O workflow 42 verificou a main mas pulou Pages. A publicação posterior foi o workflow 43, run 46073219115, com verify, pages-build e deploy aprovados no mesmo commit b0a225f. Na inspeção atual, o DOM publicou assets/index-DbDsUXzf.js e as páginas do PR #2; as correções desta branch ainda não estão publicadas.

Consulta atual em transação BEGIN READ ONLY ao Supabase confirmou:
- study_apply_video_batch(jsonb,jsonb,uuid,uuid) e coluna measure de study_historical_incidence (012);
- avatar_path de study_profiles e study_account_deletion_requests (013);
- study_trails e study_activity_streak() (014).

Todos retornaram instalado=true. A verificação confirma a presença desses componentes, sem reconciliar o histórico da CLI nem afirmar equivalência integral de cada definição SQL. Não foi encontrada ausência dessas dependências. Nenhuma migração, escrita de dados de estudo, merge ou publicação foi realizada nesta tarefa. Não há nova migração para esta correção de interface/contratos. Merge, Pages e qualquer alteração futura em produção exigem autorização específica.

Os dois textos malformados originais não foram capturados: os testes cobrem as classes de erro e as mensagens de posição relatadas, sem afirmar a causa byte a byte dessas entradas.
