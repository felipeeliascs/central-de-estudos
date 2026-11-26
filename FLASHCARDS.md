# Flashcards e revisão espaçada

Abra **Flashcards e revisão** na barra lateral. Cada baralho pertence a um assunto ou subassunto e herda a organização por disciplina e concurso. O proprietário dá um título, pode indicar o autor e decide a visibilidade. Para compartilhar, informe os IDs das contas que já podem acessar o concurso. Essas contas podem estudar o acervo e guardam datas e histórico próprios. O proprietário pode editar ou arquivar conteúdo. Arquivar retira o conteúdo da fila e preserva os registros.

Os cartões aceitam texto e imagens por URL HTTPS dos dois lados. A sessão mostra primeiro a frente. Em múltipla escolha, selecione uma alternativa e revele o verso para ver a resposta correta. A nota continua sendo sua avaliação de memória. As imagens externas mantêm a disponibilidade do endereço informado.

## Agendamento

O projeto fixa `ts-fsrs@5.4.2`, versão MIT do projeto Open Spaced Repetition, com tipos TypeScript, compatibilidade com Node 20+ e o formato FSRS-6 alinhado ao banco existente. A versão foi verificada no pacote publicado, junto com a documentação, changelog e licença. O projeto mantém guias de API e atualizações. A licença acompanha a aplicação em `licenses/ts-fsrs.txt`. [Documentação do projeto](https://open-spaced-repetition.github.io/ts-fsrs/) · [Changelog](https://open-spaced-repetition.github.io/ts-fsrs/updates/) · [Licença MIT](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/LICENSE)

| Avaliação | Biblioteca         |
| --------- | ------------------ |
| Errei     | `Rating.Again` (1) |
| Difícil   | `Rating.Hard` (2)  |
| Bom       | `Rating.Good` (3)  |
| Fácil     | `Rating.Easy` (4)  |

`repeat` fornece os intervalos estimados e `next` calcula a revisão escolhida no momento da avaliação. A configuração usa retenção solicitada de 90%, pesos e passos padrão da biblioteca e variação aleatória desativada. O estado completo inclui vencimento, estabilidade, dificuldade, dias passados e agendados, passos de aprendizado, repetições, lapsos, situação e última revisão. Cada evento guarda o estado anterior e posterior, o log calculado, a versão e a configuração ficam registradas no estado. Instantes são persistidos em UTC. As metas diárias e o histórico usam o fuso de São Paulo.

Os vencidos vêm primeiro. Cartões novos respeitam a cota diária de novos. Todos os eventos contam para a meta diária de avaliações. O painel informa novos ainda sem avaliação, agendados, vencidos e avaliações concluídas no dia. O planejador consulta os vencidos da conta, exclui cartões e baralhos arquivados e oferece um atalho para a fila.

Cada avaliação recebe um identificador persistido antes do envio. Se a conexão falhar, **Reenviar avaliação** reaproveita o evento mesmo após reabrir a página. O banco grava estado e histórico na mesma transação, devolve o mesmo recibo em novas tentativas e rejeita uma transição calculada sobre um estado já alterado por outra sessão. A escrita direta nessas duas tabelas é bloqueada para clientes autenticados.

## Importação, exportação e caderno de erros

O JSON usa `schema_version: "1.0"`, `type: "flashcard_deck"`, `deck: { "title": "…", "author": "…" }` e `cards`. Cada cartão exige `front` e `back`. Pode incluir `front_image` e `back_image` com URLs HTTPS. Múltipla escolha tem `choices` com duas a oito alternativas e `correct_choice` com o índice da resposta, começando em zero. Limites de 1 MiB e 500 cartões. Escolha o assunto de destino, confira a prévia e confirme. O arquivo cria um baralho privado próprio. A exportação do proprietário inclui conteúdo ativo comum e exclui agendamentos, histórico, contas autorizadas e cartões oriundos de erros pessoais.

Em um baralho privado próprio, **Criar cartão do erro** converte uma entrada com resposta e questão acessíveis. O cartão mantém referências para a entrada, a questão original e as alternativas quando há um gabarito único. Repetir a conversão para o mesmo baralho devolve o mesmo cartão. O baralho permanece privado para proteger a origem do caderno de erros.

Para o modo conectado, aplique a migração `202611250006_flashcards.sql` após as anteriores, no ambiente autorizado. O modo demonstração persiste no navegador e permite testar baralhos, cartões, importação e revisão localmente. Compartilhamento e caderno de erros usam a conta conectada.
