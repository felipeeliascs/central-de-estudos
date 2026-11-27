import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import sample from "../examples/concurso-ficticio.json";
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: "saved", error: null }),
}));
vi.mock("../src/repository", () => ({
  supabase: {
    rpc,
    from: () => {
      const response = { data: [], error: null };
      const query = {
        select: () => query,
        like: () => query,
        order: () => query,
        eq: () => query,
        limit: () => Promise.resolve(response),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: typeof response) => void) =>
          Promise.resolve(response).then(resolve),
      };
      return query;
    },
  },
}));
import { ContestPanel } from "../src/ContestPanel";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("exige confirmação após a prévia antes de chamar a gravação", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const user = userEvent.setup();
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <ContestPanel
      nodes={[]}
      editable={new Set()}
      user="a"
      admin
      close={() => {}}
      open={() => {}}
      refresh={refresh}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Meus concursos" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Importar JSON" }));
  await user.click(screen.getByLabelText("Ou cole o JSON"));
  await user.paste(JSON.stringify(sample));
  await user.click(screen.getByRole("button", { name: "Gerar prévia" }));
  await screen.findByRole("heading", { name: "Prévia de alterações" });
  expect(rpc).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmar e salvar" }));
  await screen.findByText("Concurso salvo.");
  expect(rpc).toHaveBeenCalledWith(
    "study_apply_catalog",
    expect.objectContaining({
      doc: sample,
      expected: null,
      operation: "import",
    }),
  );
  expect(refresh).toHaveBeenCalledOnce();
});

it("mostra vínculo e duplicata do lote e só grava após confirmar", async () => {
  rpc.mockImplementation(async (name: string) => ({ data: name === "study_catalog_document" ? sample : "saved", error: null }));
  const user = userEvent.setup();
  const batch = { schema_version: "1.0", type: "video_batch", contest_id: sample.id, resources: [{ id: "lote", item: "a01", kind: "video", title: "Aula duplicada", url: "https://youtu.be/abcdefghijk" }] };
  render(<ContestPanel nodes={[{ id: "root", parent_id: null, kind: "contest", name: "Teste", board: "", owner_id: "a", position: 0 }]} editable={new Set(["root"])} user="a" admin close={() => {}} open={() => {}} refresh={async () => {}} />);
  await user.click(screen.getByRole("button", { name: "Importar JSON" }));
  await user.selectOptions(screen.getByLabelText("Atualizar concurso existente"), "root");
  await user.click(screen.getByLabelText("Ou cole o JSON"));
  await user.paste(JSON.stringify(batch));
  await user.click(screen.getByRole("button", { name: "Gerar prévia" }));
  await screen.findByText(/Duplicata · preservada/);
  expect(rpc.mock.calls.some(call => call[0] === "study_apply_video_batch")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Confirmar e salvar" }));
  await screen.findByText("Concurso salvo.");
  expect(rpc).toHaveBeenCalledWith("study_apply_video_batch", expect.objectContaining({ batch, target: "root", expected: sample }));
});

import { within } from "@testing-library/react";
import { videoBase, validVideoBatch, conflictingVideoBatch, oldVideoId } from "./video-fixture";
function renderImporter() {
 rpc.mockImplementation(async (name: string) => ({data:name==="study_catalog_document"?videoBase:"saved",error:null}));
 render(<ContestPanel startImport nodes={[{id:"root",parent_id:null,kind:"contest",name:"Teste",board:"",owner_id:"a",position:0}]} editable={new Set(["root"])} user="a" admin close={()=>{}} open={()=>{}} refresh={async()=>{}} />);
}
async function enter(raw: string, method: "arquivo" | "colagem", user: ReturnType<typeof userEvent.setup>) {
 if(method==="colagem") { await user.click(screen.getByLabelText("Ou cole o JSON")); await user.paste(raw); }
 else {
  const file=new File([raw],"teste.json",{type:"application/json"});
  Object.defineProperty(file,"text",{value:async()=>raw});
  await user.upload(screen.getByLabelText("Arquivo JSON"),file);
 }
}
it.each(["arquivo","colagem"] as const)("aceita concurso e lote de 31 vínculos pelo mesmo caminho: %s",async method=>{
 const user=userEvent.setup(); renderImporter();
 await user.selectOptions(screen.getByLabelText("Atualizar concurso existente"),"root");
 await enter(JSON.stringify(validVideoBatch),method,user);
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 await screen.findByText(/31 vínculos na prévia/);
 expect((screen.getByRole("button",{name:"Confirmar e salvar"}) as HTMLButtonElement).disabled).toBe(false);
 expect(rpc.mock.calls.filter(call=>call[0].startsWith("study_apply"))).toHaveLength(0);
 await user.click(screen.getByRole("button",{name:"Voltar e corrigir JSON"}));
 expect((screen.getByLabelText("Ou cole o JSON") as HTMLTextAreaElement).value).toBe(JSON.stringify(validVideoBatch));
 await user.clear(screen.getByLabelText("Ou cole o JSON"));
 await enter(JSON.stringify(videoBase),method,user);
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 await screen.findByRole("heading",{name:"Prévia de alterações"});
 expect((screen.getByRole("button",{name:"Confirmar e salvar"}) as HTMLButtonElement).disabled).toBe(false);
});
it.each(["arquivo","colagem"] as const)("mostra erro em português e preserva entrada inválida: %s",async method=>{
 const user=userEvent.setup(); renderImporter();
 const raw='{"type":"contest"} texto extra';
 await enter(raw,method,user);
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 const alert=await screen.findByRole("alert");
 expect(alert.textContent).toContain("sintaxe JSON inválida");
 expect(alert.textContent).toMatch(/linha 1, coluna/);
 expect(alert.textContent).toContain("conteúdo extra");
 expect((screen.getByLabelText("Ou cole o JSON") as HTMLTextAreaElement).value).toBe(raw);
 expect(rpc.mock.calls.filter(call=>call[0].startsWith("study_apply"))).toHaveLength(0);
});
it("destaca o conflito antes das aulas válidas, bloqueia salvar e permite corrigir sem perder o JSON",async()=>{
 const user=userEvent.setup(); renderImporter();
 await user.selectOptions(screen.getByLabelText("Atualizar concurso existente"),"root");
 await enter(JSON.stringify(conflictingVideoBatch),"colagem",user);
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 const list=await screen.findByRole("list",{name:"Vínculos das videoaulas"});
 const first=within(list).getAllByRole("listitem")[0];
 expect(first.textContent).toContain(oldVideoId);
 expect(first.className).toBe("import-row-error");
 expect(first.textContent).toContain("$.resources[9].id");
 const confirm=screen.getByRole("button",{name:"Confirmar e salvar"}) as HTMLButtonElement;
 expect(confirm.disabled).toBe(true);
 expect(document.getElementById(confirm.getAttribute("aria-describedby")!)?.textContent).toContain("1 erro impede salvar");
 await user.click(confirm);
 expect(rpc.mock.calls.filter(call=>call[0].startsWith("study_apply"))).toHaveLength(0);
 await user.click(screen.getByRole("button",{name:"Voltar e corrigir JSON"}));
 const field=screen.getByLabelText("Ou cole o JSON");
 expect((field as HTMLTextAreaElement).value).toBe(JSON.stringify(conflictingVideoBatch));
 await user.clear(field); await user.click(field); await user.paste(JSON.stringify(validVideoBatch));
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 await user.click(screen.getByRole("button",{name:"Confirmar e salvar"}));
 await screen.findByText("Concurso salvo.");
 expect(rpc.mock.calls.filter(call=>call[0]==="study_apply_video_batch")).toHaveLength(1);
});
it("associa controles de importação a IDs únicos, nomes e rótulos e permite foco pelo teclado",async()=>{
 const user=userEvent.setup(); renderImporter();
 const controls=["Atualizar concurso existente","Arquivo JSON","Ou cole o JSON"].map(label=>screen.getByLabelText(label));
 expect(new Set(controls.map(el=>el.id)).size).toBe(3);
 for(const el of controls) { expect(el.id).toBeTruthy(); expect(el.getAttribute("name")).toBeTruthy(); }
 await user.click(controls[0]); await user.tab(); expect(document.activeElement).toBe(controls[1]);
 await user.tab(); expect(document.activeElement).toBe(controls[2]);
});
