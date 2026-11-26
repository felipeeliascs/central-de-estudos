import contest from "../examples/concurso-ficticio.json";
export const contractExamples = {
  contest,
  cards: {
    schema_version: "1.0",
    type: "flashcard_deck",
    deck: { title: "Baralho fictício", author: "Autoria fictícia" },
    cards: [{ front: "Pergunta fictícia?", back: "Resposta fictícia." }],
  },
  questions: {
    schema_version: "1.0",
    type: "questions",
    questions: [
      {
        topic_id: "UUID_DO_ASSUNTO",
        statement: "Questão fictícia?",
        options: ["Alternativa A", "Alternativa B"],
        answer: 0,
        explanation: "Explicação fictícia.",
        source: "ai_generated",
        difficulty: "medium",
        reviewed: false,
      },
    ],
  },
} as const;
import { promptContract as contestContract } from "./contest-schema";
import { promptContract as cardsContract } from "./flashcards";
import { promptContract as questionsContract } from "./questions";
export const contracts = {
  contest: contestContract,
  cards: cardsContract,
  questions: questionsContract,
} as const;
