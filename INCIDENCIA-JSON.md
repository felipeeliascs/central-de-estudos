# Incidência histórica por JSON

## Fluxo

1. Na Central de Prompts, escolha **Calcular incidência por assunto · JSON**, selecione o concurso e a unidade da amostra. O JSON atual do edital fornece os IDs externos. Também é possível colar ali o JSON exportado.
2. Copie o prompt para uma IA externa. Forneça provas/questões e fontes verificáveis. Não há chamada de IA no aplicativo nem chave de API. O prompt inclui todos os topic/subtopic ativos, inclusive assuntos com filhos, sem quantidade fixa e sem limitar aos filtros.
3. Revise corpus, banca, período, fontes e contagens. Para provas, conte provas com o assunto/provas analisadas; para questões, questões do assunto/questões analisadas. Uma prova/questão conta uma vez por assunto. Pais usam a união dos documentos dos filhos, sem somar duplicatas.
4. Abra **Desempenho → Raio-X do edital → Importar incidência JSON** (ou o atalho no prompt). Administrador com edição escolhe o concurso, envia arquivo ou cola o JSON e gera a prévia.
5. Confira os percentuais calculados pela Central, os registros que serão substituídos e as lacunas. Marque a revisão das fontes e confirme. Sem alterações, a confirmação fica desabilitada.

## Contrato incidence_batch 1.0

Objeto JSON UTF-8, até 512 KiB. Campos exatos:
- schema_version: "1.0"; type: "incidence_batch".
- contest_id: ID externo exato do concurso, nunca o UUID da biblioteca.
- board: banca exata do edital.
- measure: "exams" (provas) ou "questions" (questões).
- period_start e period_end: datas reais AAAA-MM-DD, fim não anterior ao início.
- sample: inteiro de 1 a 1000000, denominador comum do corpus analisado.
- entries: lista de evidências com item, occurrences e source_url.
- unavailable: lista de lacunas com item e reason.

Cada item é o ID externo de topic/subtopic ativo, sem ancestral arquivado. Até 1500 assuntos no total, sem repetições entre as listas. occurrences é inteiro entre zero e sample. source_url deve usar HTTPS sem credenciais, até 2000 caracteres. reason tem de 1 a 180 caracteres. Não envie percentuais, campos extras, cercas Markdown, introdução ou texto após o JSON. Se não houver fonte verificada, declare lacuna; não invente ocorrência zero ou uma amostra. Sem nenhuma evidência válida, não há o que salvar.

Exemplo integralmente fictício (substitua IDs, banca, amostra e fonte por dados comprovados):

```json
{
  "schema_version": "1.0",
  "type": "incidence_batch",
  "contest_id": "concurso-ficticio",
  "board": "Banca fictícia",
  "measure": "exams",
  "period_start": "2020-01-01",
  "period_end": "2025-12-31",
  "sample": 20,
  "entries": [
    {"item": "assunto-1", "occurrences": 5, "source_url": "https://example.org/provas-ficticias"}
  ],
  "unavailable": [
    {"item": "assunto-2", "reason": "Fonte não disponibilizada"}
  ]
}
```

A Central calcula 5/20 × 100 = 25% das provas. A URL de exemplo não comprova evidência. A plataforma valida estrutura, limites e referências, mas não confere automaticamente o conteúdo dos documentos. Frequência passada não é probabilidade da próxima prova.

## Erros, atualizações e preservação

Arquivo e colagem compartilham parseImportJson, usado nos concursos/videoaulas: erro de sintaxe em português com linha/coluna quando disponíveis, limite de tamanho e rejeição de conteúdo extra. O texto não é apagado em falhas. A prévia mostra todos os erros de linhas com índice original, por exemplo $.entries[29].occurrences, antes dos registros válidos; há contagem junto ao botão e link para o primeiro erro.

No modelo atual existe uma evidência por assunto+banca. Uma atualização substitui unidade, período, contagens e fonte desse registro, explicitamente na prévia; não consolida corpora diferentes automaticamente. A duplicata exata não gera gravação nem novo recibo. Lacunas em unavailable e assuntos omitidos preservam registros anteriores; a prévia lista omissões. Materiais, progresso e demais atividades do estudante não são modificados.

## Banco e validação

A migração **202611270016_incidence_import.sql** depende de 001–015. Adiciona RPC de contexto e gravação transacional. Exige administrador com edição também no Supabase, valida todo o lote e mantém controle de concorrência com o edital e a incidência da prévia, incluindo edições manuais. Um erro rejeita o lote inteiro. Somente alterações efetivas geram recibo incidence:import.

Ensaiar em ambiente descartável antes de aplicar em produção. A migração não foi aplicada nesta tarefa; merge e publicação também aguardam autorização específica. Sem a RPC, o importador informa a dependência e o cadastro manual continua disponível. Resultados dos testes em nuvem ficam no PR. Testes SQL usam PostgreSQL/PGlite descartável com Auth/Storage simulados; homologação HTTP/PostgREST com contas fictícias em Supabase separado permanece pendente.
