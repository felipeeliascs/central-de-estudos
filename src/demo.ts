import type { Snapshot } from "./domain";
export const demoUser = "00000000-0000-4000-8000-000000000001";
export function demoData(): Snapshot {
  return {
    nodes: [
      {
        id: "demo-contest",
        parent_id: null,
        kind: "contest",
        name: "Concurso de exemplo",
        board: "Banca de exemplo",
        owner_id: demoUser,
        position: 0,
      },
      {
        id: "demo-discipline",
        parent_id: "demo-contest",
        kind: "discipline",
        name: "Direito Constitucional",
        board: "",
        owner_id: demoUser,
        position: 0,
      },
      {
        id: "demo-topic",
        parent_id: "demo-discipline",
        kind: "topic",
        name: "Direitos e garantias fundamentais",
        board: "",
        owner_id: demoUser,
        position: 0,
      },
      {
        id: "demo-subtopic",
        parent_id: "demo-topic",
        kind: "subtopic",
        name: "Direitos individuais e coletivos",
        board: "",
        owner_id: demoUser,
        position: 0,
      },
      {
        id: "demo-topic-2",
        parent_id: "demo-discipline",
        kind: "topic",
        name: "Organização do Estado",
        board: "",
        owner_id: demoUser,
        position: 1,
      },
    ],
    materials: [
      {
        id: "demo-material",
        topic_id: "demo-topic",
        owner_id: demoUser,
        section: "Teoria e resumos",
        title: "Como organizar seu primeiro resumo",
        kind: "text",
        url: "",
        body: "Material demonstrativo\n\nRegistre os conceitos centrais do assunto, destaque as diferenças importantes e termine com uma pergunta para sua próxima revisão.\n\nEste exemplo é fictício. Adicione seus próprios materiais para começar.",
        back: "",
        file_path: "",
        visibility: "private",
        shared_with: [],
        position: 0,
        embed: false,
        verified: false,
      },
    ],
    checks: [],
    notes: [],
  };
}
