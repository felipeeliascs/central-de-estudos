# Importação JSON assistida

## Implementação em ordem de dependências

1. Metadados dos sete contratos em `src/import-contracts.ts`: campos, obrigatoriedade, limites, enumerações e destinos compartilhados pela tabela, diagnóstico e prompts. As regras relacionais continuam nos importadores de domínio e RPCs do Supabase.
2. Análise da entrada e diagnósticos em `src/import-assistance.ts`: tipo de documento, campos extras, números/booleanos, datas reais, limites, referências, conflitos e identidades existentes.
3. Componente reutilizável `JsonImportWorkbench`: edição por campo, índices originais, paginação de dez registros, filtro de erros, restauração da entrada e download revisado. Não trunca, não remove campos desconhecidos e não grava automaticamente.
4. Integração nos importadores de edital/videoaulas, incidência, Biblioteca, questões, flashcards e Trilhas. Alterar o rascunho invalida a prévia e as confirmações correspondentes. A confirmação chama os mesmos serviços transacionais existentes.
5. Prompts recebem os limites dos mesmos metadados. Contrato/IDs e pedido de correção podem ser revisados e copiados para IA externa. Nenhuma integração direta com IA.
6. Regressões unitárias, interface React, PostgreSQL isolado e navegador no GitHub Actions.

## Comportamento e preservação

- Continua existindo apenas JSON como formato de intercâmbio.
- O parser estrito continua rejeitando cercas Markdown e texto extra. Somente uma cerca exata contendo um JSON pode ser adotada por botão explícito; não há extração de objetos dentro de prosa nem tentativa de completar JSON truncado.
- BOM UTF-8 é aceito. Sintaxe inválida recebe mensagem em português com posição quando disponível. Não são adivinhadas aspas, vírgulas, datas, referências ou conteúdo ausente.
- Tipo errado orienta o usuário ao importador correto; não muda `type` para forçar aceitação.
- A tabela usa índices originais e aponta o campo. IDs externos são distintos dos UUIDs de questões/Trilhas. Listas de referências usam o contexto disponível; carregue a prévia do destino para validar IDs contra o banco.
- IDs e vínculos existentes são preservados; conflitos de videoaulas permitem criar um novo ID explicitamente, preservando o recurso anterior.
- Reimportação e decisões de duplicidade continuam obedecendo às regras de cada módulo. A Biblioteca exige decisão entre utilizar, atualizar ou manter distintos. Não há unificação automática.
- Download revisado exige validação local. Isso não substitui prévia, autorização, revisão de fontes ou validação no servidor.
- A entrada original e as correções ficam somente na sessão React; sair da página encerra o rascunho. Baixe antes de sair se precisar guardar.
- Nenhum novo armazenamento paralelo, pacote, migração ou alteração de política de acesso. Mantida compatibilidade com contratos 1.0 e GitHub Pages.

## Simulação com o PDF fornecido

Escopo confirmado pelo usuário: **PEB II — Professor de Matemática**.

Documento: Prefeitura Municipal de Roseira, Processo Seletivo Simplificado 02/2026, Edital nº 02/2026, organização NetEduc Concursos. O arquivo recebido tem **16 páginas**. SHA-256: `603cdc4b96ba9fcb80aec6d82b104c5f21218941b7ab9b929839f253b8712b15`.

Evidências por página do PDF recebido:

| Página | Informação |
| --- | --- |
| 1 | Órgão, processo e organizadora; referência ao Anexo II. |
| 2 | Cargo PEB II — Professor de Matemática. |
| 11 | Grupo 6, prova em 06/12/2026 às 13h; 25 questões, cinco alternativas, até duas horas; remissão ao Anexo II. |
| 13 | Cada questão vale 0,4 ponto; pontuação total 10. Isso não foi tratado como peso de disciplina. |
| 16 | Edital datado de 29/10/2026. |

**O Anexo II não está nas 16 páginas recebidas.** Não foi possível extrair disciplinas, assuntos, subassuntos, distribuição por disciplina ou bibliografia. Não se pode validar o cadastro completo do edital a partir deste arquivo.

O fixture `examples/roseira-ps-02-2026-matematica-parcial.json` contém apenas os metadados comprovados. `items` e `resources` estão vazios e `listed:false`. Os horários, alternativas e pontuação acima ficam neste relatório, pois o contrato atual não possui campos correspondentes. Não foi inventado link da página específica do concurso a partir do portal geral da organizadora.

A prévia exige confirmação explícita de cadastro parcial antes de salvar. Os testes React simulam arquivo e colagem, correção na tabela e nova confirmação. O teste PostgreSQL aplica o fixture, reimporta sem duplicar, verifica ausência de conteúdo inventado, recusa escrita por estudante e testa disponibilização/seleção apenas com contas fictícias. Os demais testes de vínculos, materiais e progresso usam dados sintéticos identificados, sem atribuí-los a Roseira.

## Validação e limites

Execução dos testes somente no GitHub Actions; nenhum cadastro ou upload na produção. A suite existente continua verificando preservação de materiais, questões, cartões, revisões, anotações e progresso nas migrações 001–018. A simulação de interface usa serviços fictícios; PostgreSQL isolado executa as RPCs e RLS reais. Chrome verifica erros/correção/novas prévias da Biblioteca em 1440, 768 e 390 px.

Faltam validar a importação do Anexo II completo e o fluxo com duas contas reais em um Supabase de homologação, incluindo Auth/rede/Storage. Não foi criado ambiente de produção nem aplicado SQL. Fontes de incidência e links de videoaulas continuam exigindo conferência humana; o diagnóstico não comprova sua autenticidade.

O resultado final de CI e o commit verificado constam no PR.
