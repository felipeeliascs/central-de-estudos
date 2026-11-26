# Questões, simulados e caderno de erros

Abra **Questões e simulados** na barra lateral. O cadastro associa o item a um assunto do edital, o que determina também a disciplina e o concurso. Classifique a origem como original, inédita gerada por IA ou fonte autorizada. Para fonte autorizada, informe nome, URL original e confirme a autorização. A revisão editorial é indicada separadamente. O banco começa vazio e imagens opcionais usam URLs HTTPS.

Em **Importar JSON**, cole o conteúdo ou abra um arquivo local, gere a prévia e confirme. O formato usa uma lista de 1 a 30 itens, até 256 KiB, com gabarito de base zero e referências a assuntos existentes. A prévia detecta enunciados iguais após normalizar maiúsculas e espaços. O banco reconfirma a duplicidade na gravação. As plataformas proprietárias entram no fluxo por referências pessoais e resultados declarados em vez de importação de seus acervos.

```json
{
  "schema_version": "1.0",
  "type": "questions",
  "questions": [
    {
      "topic_id": "UUID_DO_ASSUNTO",
      "statement": "Exemplo fictício. Quanto é 2 + 2?",
      "options": ["3", "4", "5"],
      "answer": 1,
      "explanation": "A soma de dois com dois é quatro.",
      "source": "author",
      "difficulty": "easy",
      "reviewed": false
    }
  ]
}
```

`source` aceita `author`, `ai_generated` ou `licensed`. `difficulty` aceita `easy`, `medium` ou `hard`. Os campos opcionais são `source_name`, `source_url`, `image_url`, `board`, `year` e `reviewed`. Fonte autorizada exige `source_name` e `source_url`.

Em **Simulados**, filtre por disciplina, assunto, banca ou concurso. Ao distribuir por disciplina de um edital cadastrado, confira as quantidades e pesos sugeridos pelo edital e ajuste os campos para a sessão. Quando faltarem questões em qualquer grupo, o sistema informa as quantidades e bloqueia o início. A nota é a soma dos pesos dos acertos dividida pela soma dos pesos de todos os itens. Questões em branco não pontuam e ficam explícitas no relatório. A escolha das questões segue a ordem estável do banco por cadastro. A opção diagnóstica usa a mesma correção e destaca os resultados por disciplina.

O simulado grava respostas, posição e marcações à medida que o estudante avança. O prazo absoluto persiste após recarregar. Após o prazo, a tentativa só aceita encerramento, usando as respostas salvas. O modo estudo corrige e explica imediatamente após confirmação. A correção usa um retrato das questões e pesos no início, preservando o resultado quando o banco muda. As tentativas deste módulo ficam na aba **Tentativas**.

**Registrar simulado externo** abre o formulário de produtividade com o tipo já selecionado. O dado é agregado e manual. Um erro externo específico pode ser registrado no **Caderno de erros** com seu link e uma síntese própria. Erros internos são criados na correção e vinculados à tentativa e à questão. O caderno registra motivo, resposta correta, anotações, imagens e histórico, e oferece conversão para um baralho privado. Concluir a revisão de uma questão muda o estado do erro. O domínio do assunto continua calculado por desempenho, recência e volume. As respostas efetivas alimentam dashboard, mapa de domínio e planejador. Os cartões criados a partir dos erros entram no fluxo FSRS.

O modo conectado exige a migração `202611250008_questions.sql` aplicada depois das anteriores. O modo demonstração permite praticar e persistir no navegador.
