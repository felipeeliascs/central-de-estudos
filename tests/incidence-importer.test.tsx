import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {incidenceBatch,incidenceContext} from "./incidence-fixture";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("../src/repository",()=>({supabase:{rpc}}));
import {IncidenceImporter} from "../src/IncidenceImporter";
afterEach(()=>{cleanup();vi.clearAllMocks();});
function show(){
 rpc.mockImplementation(async(name:string)=>({data:name==="study_incidence_import_context"?incidenceContext:31,error:null}));
 const saved=vi.fn().mockResolvedValue(undefined);
 render(<IncidenceImporter nodes={[{id:"root",parent_id:null,kind:"contest",name:"Concurso teste",board:"Banca",owner_id:"a",position:0}]} onSaved={saved}/>);
 return saved;
}
it.each(["arquivo","colagem"])("prévia com 31 vínculos e confirmação após revisão das fontes: %s",async method=>{
 const user=userEvent.setup(); const saved=show();
 await user.selectOptions(screen.getByLabelText("Concurso de destino da incidência"),"root");
 const raw=JSON.stringify(incidenceBatch);
 if(method==="arquivo"){
  const file=new File([raw],"incidencia.json",{type:"application/json"});Object.defineProperty(file,"text",{value:async()=>raw});
  await user.upload(screen.getByLabelText("Arquivo JSON de incidência"),file);
 }else{await user.click(screen.getByLabelText("Ou cole o JSON de incidência"));await user.paste(raw);}
 await user.click(screen.getByRole("button",{name:"Gerar prévia da incidência"}));
 await screen.findByText(/31 assuntos declarados/);
 const confirm=screen.getByRole("button",{name:"Confirmar e salvar incidência"}) as HTMLButtonElement;
 expect(confirm.disabled).toBe(true);
 expect(rpc.mock.calls.some(c=>c[0]==="study_apply_incidence_batch")).toBe(false);
 await user.click(screen.getByRole("checkbox")); await user.click(confirm);
 await screen.findByText(/Incidência importada: 31/);
 expect(rpc).toHaveBeenCalledWith("study_apply_incidence_batch",expect.objectContaining({target:"root",batch:incidenceBatch,expected_incidence:[]}));
 expect(saved).toHaveBeenCalledOnce();
});
it("mantém texto inválido e destaca índice do erro sem salvar parcialmente",async()=>{
 const user=userEvent.setup();show();
 await user.selectOptions(screen.getByLabelText("Concurso de destino da incidência"),"root");
 const field=screen.getByLabelText("Ou cole o JSON de incidência");
 await user.click(field);await user.paste("{} texto");
 await user.click(screen.getByRole("button",{name:"Gerar prévia da incidência"}));
 expect((await screen.findByRole("alert")).textContent).toContain("sintaxe JSON inválida");
 expect((field as HTMLTextAreaElement).value).toBe("{} texto");
 await user.clear(field);await user.click(field);
 const bad={...incidenceBatch,entries:incidenceBatch.entries.map((e,i)=>i===29?{...e,occurrences:21}:e)};
 await user.paste(JSON.stringify(bad));
 await user.click(screen.getByRole("button",{name:"Gerar prévia da incidência"}));
 await screen.findByText(/entries\[29\].occurrences/);
 expect((screen.getByRole("button",{name:"Confirmar e salvar incidência"}) as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole("button",{name:"Voltar e corrigir JSON"}));
 expect((screen.getByLabelText("Ou cole o JSON de incidência") as HTMLTextAreaElement).value).toBe(JSON.stringify(bad));
 expect(rpc.mock.calls.some(c=>c[0]==="study_apply_incidence_batch")).toBe(false);
});
