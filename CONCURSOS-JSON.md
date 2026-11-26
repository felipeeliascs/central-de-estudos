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
