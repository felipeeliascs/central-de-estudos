# Biblioteca central e ambientes complementares

## Decisão arquitetural

Mantidas três páginas com URLs distintas:
- Meus concursos → **Abrir Edital** (`?page=notice&item=UUID`): consulta de órgão, banca, cargo, data, questões/pesos e árvore disciplina → assunto → subassunto. Bibliografia exigida aparece no conteúdo correspondente. Não calcula progresso nem oferece editor de estudo.
- **Estudar** (`?page=study&item=UUID`): navegação contextual, materiais do acervo, checklist, notas privadas, questões, flashcards/revisões e registro de sessões.
- **Biblioteca** (`?page=library`): gerenciamento do acervo acessível, busca e filtros, cadastro, edição, importação e vínculos entre concursos/conteúdos.

O Plano de Estudos mantém as visões diário/semanal e demais modalidades existentes na mesma persistência. Cada atividade abre seu conteúdo no ambiente de estudo. O recálculo pede confirmação e preserva tarefas concluídas, sessões e desempenho. Desempenho mantém os dados e recolhe seções complementares; a preferência de expansão é privada por usuário no navegador.

## Uma fonte de materiais

A tabela `study_materials` continua sendo a única fonte do conteúdo. Nenhuma tabela ou bucket paralelo armazena cópias. IDs e arquivos existentes permanecem. A migração 018 permite materiais com `topic_id=null`, independentes de concursos, e acrescenta metadados opcionais de autor, obra, edição, fonte, versão e ID externo.

`study_material_links` guarda somente referências por usuário: material, conteúdo e estado ativo. Um vínculo pode apontar a concurso, disciplina, assunto ou subassunto; materiais de concurso/disciplina são incluídos nos assuntos descendentes. O assunto original continua como âncora de compatibilidade para importações anteriores. Um vínculo inativo oculta essa associação para aquela pessoa, sem apagar o material ou afetar outras contas. Materiais pessoais antigos ganham seu vínculo inicial; recursos gerenciados pelo catálogo conservam a associação de origem e suas permissões.

Editar um material altera o mesmo registro usado em todos os vínculos. Desvincular preserva o original. Excluir material é uma operação distinta, com confirmação e remoção de todos os seus vínculos; checklist, notas e sessões não são apagados. Upload e links assinados continuam no bucket privado existente, com os mesmos limites e expiração.

Anotações por assunto continuam privadas em `study_notes`. Não são convertidas automaticamente em material compartilhável; o acervo aceita **Anotações pessoais** como texto criado explicitamente pelo usuário.

## Permissões

Apenas o proprietário edita materiais pessoais. Recursos do catálogo continuam gerenciados por administradores pelos contratos existentes. Vínculos pessoais não concedem acesso ao original: a consulta precisa passar pela RLS de materiais. Materiais compartilhados legados com assunto de origem continuam exigindo acesso a esse assunto; materiais independentes usam os destinatários explícitos. Compartilhar ou vincular não torna arquivos públicos.

A migração 017 torna a disponibilidade visível no admin. Publicar no catálogo significa disponibilizar a contas autenticadas, sem inscrevê-las automaticamente. Retirar da descoberta preserva acesso de quem já selecionou o concurso, além do histórico. Adoção de concurso manual preserva IDs e não converte materiais privados em recursos públicos.

## Equivalências

Associações antigas começam como parciais/a revisar. A revisão administrativa registra cobertura integral/parcial e comparação de profundidade e exigências. Títulos semelhantes não geram associação automática.

A Biblioteca sugere materiais acessíveis dos assuntos associados; a pessoa confirma cada vínculo. Somente equivalência **integral revisada** permite reaproveitar etapas de checklist, com confirmação pessoal e comparação da prévia. A origem é preservada; etapas concluídas do destino não são desmarcadas. Pesos, prioridades e exigências do destino permanecem próprios. Questões/respostas, tempo, revisões, histórico FSRS e evidências de domínio não são duplicados: não se inventam novos estudos ou domínio consolidado a partir de checklist.

## Importação própria do acervo

Novo contrato `library_batch 1.0`, sem alterar os contratos de concursos, videoaulas, questões, flashcards ou trilhas. A interface exibe contrato e instruções para uso numa IA externa, sem integração direta com APIs.

```json
{"schema_version":"1.0","type":"library_batch","materials":[{"id":"resumo-ldb-v1","title":"Resumo fictício da LDB","section":"Teoria e resumos","kind":"text","body":"Conteúdo de teste, sem valor como evidência."}]}
```

Até 512 KiB e 300 materiais. Campos permitidos em cada entrada: id (1–80 ASCII minúsculo), title (1–180), section, kind (text/link/youtube), body/back (até 100.000), url/source (até 2.000), author/work/edition (até 180), content_version (até 80). Opcionais desconhecidos devem ser omitidos, sem null. Campos extras e sintaxe malformada são recusados pelo analisador compartilhado; arquivo e colagem seguem o mesmo caminho. PDFs e imagens continuam pelo cadastro com upload, sem binários no JSON.

Possíveis duplicatas são identificadas por ID, URL/vídeo normalizado, conteúdo ou título/tipo/autor/obra/edição. Isso é sugestão, sem prova de identidade semântica ou comparação binária de arquivos. A pessoa decide usar, atualizar ou manter ambos. Atualizar outro material exige propriedade, confirmação e snapshot vigente; não amplia compartilhamento. Arquivos existentes são atualizados pelo formulário individual, preservando o fluxo de Storage.

A RPC de lote é uma transação: erro em qualquer entrada reverte tudo, incluindo vínculos e recibo. Repetir a mesma operação com a mesma chave é idempotente. Reimportações com outra chave apresentam duplicatas para revisão; o modo utilizar não cria materiais. A opção explícita de manter ambos cria ID externo distinto quando necessário.

## Portal oficial

Sem mudar o schema de concursos, a URL é uma referência de origem com título exato **Página oficial do concurso**, editável no formulário. Outros documentos/fontes permanecem no JSON, mas não poluem o cartão. Não se presume que a URL de um PDF de edital seja a página de inscrições. Ausência de cadastro é informada sem inventar links.

## Migrações e validação

017 e 018 são independentes da migração 016 do PR de incidência. Exigem 001–015; a numeração reservada evita colisões. Nenhuma é aplicada automaticamente no deploy. Aplicar primeiro em Supabase de homologação, com contas e arquivos fictícios, após backup e conferência do histórico real.

O CI usa testes de UI/contrato e PostgreSQL/PGlite descartável. Auth e Storage desse harness são simulados. Homologação HTTP/PostgREST, envio real de PDF/imagem e inspeção visual nas três larguras continuam necessários quando houver ambiente integrado separado. Resultados finais do commit ficam no PR.
