# Concursos e importação JSON

Use **Meus concursos → Ver catálogo**. Administradores com acesso de edição ao concurso podem cadastrar, editar, duplicar, arquivar, importar e exportar. A conta precisa ter o papel `admin` cadastrado conforme `SUPABASE.md`. Um concurso fica restrito ao dono e aos membros autorizados até que o administrador o disponibilize para estudantes autenticados. O estudante pode selecionar vários concursos e desmarcá-los individualmente. O arquivamento retira o concurso ou item da navegação de estudo, preservando as referências e o histórico.

Para usar este módulo conectado, aplique `supabase/migrations/202611250004_contest_catalog.sql` após as migrações 001 a 003. A aplicação remota depende de confirmação do ambiente. O painel funciona com Supabase configurado. A demonstração da biblioteca continua disponível para uso local.

## Contrato 1.0

O arquivo é um objeto JSON UTF-8 de até 512 KiB. São aceitos exatamente `schema_version: "1.0"` e `type: "contest"`. Campos extras são rejeitados. Omita dados opcionais desconhecidos em vez de inventá-los ou usar `null`. A exceção é `parent: null` em disciplinas. Todos os IDs aceitam de 1 a 80 caracteres minúsculos ASCII, dígitos, ponto, hífen e sublinhado, começando por letra ou dígito. Defina o ID uma vez e preserve-o em todas as retificações.

| Objeto             | Campos obrigatórios                                                    | Campos opcionais                                                                                     |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Concurso           | `schema_version`, `type`, `id`, `name`, `notice`, `items`, `resources` | `organization`, `role`, `board`, `exam_date`, `listed`, `archived`, `questions`, `weight`, `sources` |
| `notice`           | `version` (inteiro de 1 a 100.000)                                     | `url`, `published_on`                                                                                |
| Cada `items[]`     | `id`, `parent`, `kind`, `name`                                         | `archived`, `questions`, `weight`, `priority`, `minutes`, `checklist`, `sources`                     |
| Cada `resources[]` | `id`, `item`, `kind`, `title`                                          | `author`, `edition`, `url`, `text`, `archived`, `sources`. Alguns tipos exigem campos adicionais.    |
| Cada `sources[]`   | `title`, `url`                                                         | Nenhum                                                                                               |

- `id` do concurso é único no catálogo. Os IDs dos itens e, separadamente, dos recursos são únicos dentro de cada concurso. Array `items` aceita até 1.500 entradas e `resources` até 2.000. A ordem das listas determina a ordem dos itens irmãos e dos recursos na biblioteca.
- `kind` do item é `discipline`, `topic` ou `subtopic`. A disciplina tem pai `null`. Assuntos referenciam o ID de uma disciplina e subassuntos referenciam o ID de um assunto. Recursos referenciam assunto ou subassunto pelo campo `item`.
- `bibliography` exige `author` e usa `title` como obra. `video` exige URL de vídeo do YouTube. `legislation` e `external_questions` exigem URL. `material` exige `text` ou `url`. Links entram como referências ainda não verificadas. Arquivos binários continuam sendo cadastrados pela biblioteca.
- Campos de texto usam até 180 caracteres, exceto `text` (100.000) e URLs (2.000, HTTPS e sem credenciais). Datas usam `AAAA-MM-DD`. `sources` aceita até 30 referências. `listed` e `archived` são booleanos, com padrão `false`.
- `questions` é inteiro de 0 a 100.000 e `weight` é número de 0 a 100.000. `minutes` é inteiro de 1 a 100.000. `priority` aceita `low`, `medium`, `high`. `checklist` contém índices únicos entre 0 e 4, na ordem assistir videoaula, estudar teoria, consultar bibliografia, resolver questões, realizar revisão. Esses valores são sugestões do edital e ficam visíveis no catálogo. O checklist individual mantém suas marcações.

## Prévia, confirmação e retificação

1. Escolha um `.json` ou cole o texto e gere a prévia. IDs repetidos, campos inválidos e referências inconsistentes interrompem a validação.
2. Confira itens novos, alterados, arquivados e sem alteração. Para retirar um item ou recurso mantenha seu ID e use `"archived": true`. Omissão de um ID existente é rejeitada, assim como mudança de tipo ou pai do mesmo ID. Para reorganizar um assunto para outro pai, arquive o item antigo e crie um novo ID. O histórico permanece vinculado ao item antigo.
3. Confirme. O banco grava catálogo, estrutura, recursos, versão e recibo em uma única transação. Se outro administrador salvar entre prévia e confirmação, gere a prévia novamente. A reaplicação do mesmo documento salvo devolve o concurso existente sem duplicar a estrutura ou o recibo. Para retificação, aumente `notice.version`. Uma edição dentro da mesma versão atualiza o snapshot daquela versão.
4. Ao adotar um concurso cadastrado antes deste módulo, exporte pelo próprio painel, mantenha os IDs existentes e selecione o concurso como destino na primeira importação. O catálogo vincula os UUIDs que a biblioteca já usa. A exportação inclui somente a estrutura e os recursos do catálogo, sem materiais pessoais, registros de estudo, credenciais ou IDs de contas.

**Duplicar** cria outro concurso com ID próprio e copia a estrutura e os recursos cadastrados no catálogo. A cópia começa fora do catálogo de estudantes. **Equivalências** exige selecionar dois assuntos de concursos diferentes e confirmar a associação. O vínculo é consultável e pode ser removido, preservando os históricos individuais. Nesta etapa a associação registra equivalência de conteúdo. Reaproveitamento automático de evidências entre editais permanece pendente.

Os exemplos `examples/concurso-ficticio.json` e `examples/retificacao-ficticia.json` são inteiramente fictícios. Importe o primeiro, importe novamente para observar a idempotência e então use o segundo para observar edição, inclusão e arquivamento.

## Lote de videoaulas para edital existente

Em **Importar JSON**, escolha o edital de destino ou deixe identificar pelo ID externo do lote. Use o contrato abaixo; não reenvie items nem o edital inteiro. O exemplo completo é examples/videoaulas-ficticias.json, compatível com examples/concurso-ficticio.json. São referências fictícias para teste, sem comprovação de conteúdo do vídeo.

```json
{
  "schema_version": "1.0",
  "type": "video_batch",
  "contest_id": "exemplo-concurso-ficticio",
  "resources": [{
    "id": "aula-id-estavel",
    "item": "a01",
    "kind": "video",
    "title": "Videoaula fictícia",
    "url": "https://www.youtube.com/watch?v=abcdefghijl"
  }]
}
```

O lote usa até 512 KiB e 2.000 entradas. Cada aula segue os campos de video em resources do contrato 1.0, sem archived. contest_id é o id externo do documento exportado; item é o ID externo exato de assunto ou subassunto, não o UUID da biblioteca, nome ou número de posição. O prompt **Pesquisar videoaulas gratuitas** inclui o edital atual para usar esses IDs. O concurso e todos os ancestrais do assunto precisam estar ativos.

A prévia mostra título, assunto/ID, novas aulas, duplicatas e referências inválidas. Erros impedem confirmar o lote inteiro. Reimportar a mesma combinação de vídeo do YouTube e assunto preserva o recurso existente, mesmo com outro ID ou formato de URL equivalente. Um ID existente com outro vídeo ou assunto é recusado; IDs repetidos dentro do lote também são erros. O mesmo vídeo pode ser vinculado a assuntos distintos. Metadados de duplicatas e aulas arquivadas devem ser revisados no editor do catálogo.

A migração 202611270012_video_incidence.sql adiciona a RPC que valida permissões no banco e reaproveita study_apply_catalog em transação, sem apagar materiais, checklist, anotações ou progresso. Outra edição após a prévia exige gerar nova prévia. A reimportação sem novidades não cria material nem recibo adicional.

**Seleção e arquivamento:** “Remover dos meus concursos” pausa somente a seleção do usuário; o concurso sai de sua navegação e pode ser selecionado novamente no catálogo. “Arquivar no catálogo” exige administrador com edição e afeta a disponibilidade geral. A prévia e confirmação de salvamento continuam obrigatórias. A exclusão definitiva é oferecida a administradores com edição, mediante verificação de vínculos e confirmação pelo ID externo. A migração 015 é necessária; authenticated continua sem DELETE direto em study_nodes.

**Aparecida / AVANÇASP:** confirmou-se que o prompt anterior gerava texto (target none) e que o importador aceitava apenas contest 1.0 com resources no documento completo. A projeção correta converte resources[].item em UUID via item_map e grava section Videoaulas/kind youtube. Essa incompatibilidade é uma lacuna confirmada, mas não comprova a causa do caso relatado. Sem JSONs originais, snapshot do edital e recibo da operação não é possível determinar se as aulas foram persistidas ou se apontavam para IDs errados. Nenhum dado de produção foi usado ou alterado nesta investigação.

## Incidência histórica

O edital reutiliza os registros do Raio-X. Cada percentual informa se mede **provas com o assunto / provas analisadas** ou **questões do assunto / questões analisadas**, além de banca, período, fonte e tamanho da amostra. A migração acrescenta measure (exams/questions); registros antigos ficam sem unidade, sem inventar classificação. Devem ser revisados no Raio-X antes de exibir percentuais. Ausência de evidência completa mostra “Sem dados de incidência”; falha de consulta aparece como erro. Frequência histórica não é probabilidade da próxima prova. Prioridade estimada do planejamento permanece separada.

Antes da publicação, ensaie a migração em homologação e valide Auth e API real com contas fictícias. O CI exercita banco descartável com PGlite e mocks de Auth, sem validar SMTP, PostgREST, Storage ou sincronização real.

## Correção de entradas e cobertura de videoaulas

Upload e colagem usam a mesma análise estrita. Envie somente o objeto JSON, sem cercas de código, introdução ou texto depois dele. Sintaxe inválida mostra motivo em português e linha/coluna quando disponíveis. Erros de contrato indicam o campo, como $.resources[29].title. Mantenha cada title entre 1 e 180 caracteres, sem truncamento automático; coloque detalhes em text.

Na prévia de videoaulas, erros aparecem primeiro e a quantidade é exibida perto de Confirmar e salvar. Use o link ao primeiro erro ou Voltar e corrigir JSON; o texto e o destino são preservados. Duplicata válida não bloqueia a confirmação. Se o mesmo ID já identifica outro vídeo ou vínculo, atribua um novo ID ao novo recurso. Reaproveitar o mesmo vídeo no mesmo assunto preserva o ID e os materiais existentes.

No prompt Pesquisar videoaulas gratuitas, escolha Quantidade fixa ou Cobertura completa do edital. Cobertura completa usa todos os topic e subtopic ativos do JSON atual, incluindo pais com filhos; não é limitada por disciplina/assunto selecionado nem envia quantidade fixa. A meta e cada ID elegível são exibidos no prompt. Solicite apenas URLs verificadas e revise as lacunas; uma meta não permite inventar aulas. O contrato continua video_batch 1.0, com contest_id e item externos exatos.

Veja evidências, testes e limites em [IMPORTACAO-DIAGNOSTICO.md](IMPORTACAO-DIAGNOSTICO.md).

## Arquivar ou excluir concurso importado

Nos cartões do catálogo, Arquivar no catálogo e Excluir concurso importado são ações diferentes. Arquivar exige prévia e confirmação, pode ser revertido e preserva dados e seleções. Remover dos meus concursos altera apenas a seleção pessoal.

Excluir definitivamente exige administrador com edição, verificação no servidor e digitação do ID externo exato. Remove estrutura, recursos importados, versões e seleções de todas as contas, sem remover o histórico de operações. Qualquer nota, checklist, material pessoal, progresso, sessão, resultado, questão, simulado, baralho, planejamento, trilha, evidência de incidência ou equivalência vinculada impede excluir; use arquivamento. Referências desconhecidas protegidas por FK também impedem a operação e revertem a transação integralmente.

A migração 202611270015_catalog_deletion.sql depende de 001–014. Aplicá-la apenas no ambiente autorizado, primeiro em teste. Ela adiciona funções, sem excluir concursos automaticamente. A prévia de exclusão é revalidada no salvamento, incluindo concorrência com importações. Sem essa migração, a interface informa a dependência e mantém o arquivamento disponível.

Histórico de operações e Incidência histórica ficam recolhidos inicialmente. Use Exibir/Esconder; o botão funciona por teclado e não altera os registros.

## Importar incidência histórica

O contrato **incidence_batch 1.0** permite importar evidências para assuntos de um edital existente, separadamente das videoaulas e do edital. Use o novo prompt Calcular incidência por assunto · JSON e o importador em Desempenho → Raio-X do edital. Veja campos, limites, denominadores, lacunas e controle de substituições em [INCIDENCIA-JSON.md](INCIDENCIA-JSON.md). Requer a migração 016 no ambiente autorizado; não altera materiais ou progresso.
