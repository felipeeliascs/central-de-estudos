import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import sample from "../examples/concurso-ficticio.json";
const { rpc }=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("../src/repository",()=>({supabase:{
 rpc,
 from:(table:string)=>{
  const data=table==="study_imports"?[{id:"receipt",kind:"contest:import",created_at:"2026-11-27T18:00:00Z",summary:{name:"Importação fictícia",version:2,items:31,resources:47}}]:[];
  const response={data,error:null};
  const query={select:()=>query,like:()=>query,order:()=>query,eq:()=>query,limit:()=>Promise.resolve(response),then:(resolve:(value:typeof response)=>void)=>Promise.resolve(response).then(resolve)};
  return query;
 }
}}));
import { ContestPanel } from "../src/ContestPanel";
afterEach(()=>{cleanup();vi.clearAllMocks();});
function show(admin=true,editable=true) {
 const refresh=vi.fn().mockResolvedValue(undefined);
 render(<ContestPanel nodes={[{id:"root",parent_id:null,kind:"contest",name:"Concurso fictício",board:"Banca",owner_id:"a",position:0}]} editable={new Set(editable?["root"]:[])} user="a" admin={admin} close={()=>{}} open={()=>{}} refresh={refresh}/>);
 return refresh;
}
function responses(canDelete=true) {
 rpc.mockImplementation(async(name:string)=>({data:name==="study_catalog_document"?sample:name==="study_contest_deletion_status"?{can_delete:canDelete,reason:canDelete?"Sem dados de estudo vinculados.":"Existem dados de estudo. Arquive para preservar."}:null,error:null}));
}
it("mostra histórico em cartões recolhidos e permite exibir/esconder por teclado",async()=>{
 responses(); const user=userEvent.setup(); show();
 const toggle=await screen.findByRole("button",{name:/Histórico de operações/});
 expect(toggle.getAttribute("aria-expanded")).toBe("false");
 expect(screen.queryByRole("heading",{name:"Importação fictícia"})).toBeNull();
 await user.click(toggle);
 await screen.findByRole("heading",{name:"Importação fictícia"});
 const region=screen.getByRole("region",{name:"Histórico de operações"});
 expect(within(region).getByText("31 itens")).toBeTruthy();
 expect(within(region).getByText("47 recursos")).toBeTruthy();
 expect(within(region).getByText("Importação")).toBeTruthy();
 await user.keyboard("{Enter}");
 expect(toggle.getAttribute("aria-expanded")).toBe("false");
 expect(screen.queryByRole("heading",{name:"Importação fictícia"})).toBeNull();
});
it("exige o ID externo exato antes de excluir e mantém o histórico",async()=>{
 responses(); const user=userEvent.setup(); const refresh=show();
 await user.click(screen.getByLabelText("Mais ações de Concurso fictício"));
 await user.click(screen.getByRole("button",{name:"Excluir concurso importado"}));
 const region=await screen.findByRole("region",{name:"Excluir concurso importado"});
 const confirm=within(region).getByRole("button",{name:"Excluir definitivamente"}) as HTMLButtonElement;
 expect(confirm.disabled).toBe(true);
 expect(rpc.mock.calls.some(call=>call[0]==="study_delete_contest")).toBe(false);
 const field=within(region).getByRole("textbox");
 await user.click(field); await user.paste(sample.id+"-errado");
 expect(confirm.disabled).toBe(true);
 await user.clear(field); await user.click(field); await user.paste(sample.id);
 expect(confirm.disabled).toBe(false);
 await user.click(confirm);
 await screen.findByText("Concurso excluído. O histórico de operações foi preservado.");
 expect(rpc).toHaveBeenCalledWith("study_delete_contest",{target:"root",expected:sample,confirmed_external_id:sample.id});
 expect(refresh).toHaveBeenCalledOnce();
});
it("bloqueia exclusão com estudos e oferece arquivamento confirmado",async()=>{
 responses(false); const user=userEvent.setup(); show();
 await user.click(screen.getByLabelText("Mais ações de Concurso fictício"));
 await user.click(screen.getByRole("button",{name:"Excluir concurso importado"}));
 const region=await screen.findByRole("region",{name:"Excluir concurso importado"});
 expect((within(region).getByRole("button",{name:"Excluir definitivamente"}) as HTMLButtonElement).disabled).toBe(true);
 expect(within(region).queryByRole("textbox")).toBeNull();
 await user.click(within(region).getByRole("button",{name:"Arquivar no catálogo"}));
 await screen.findByRole("heading",{name:"Prévia de alterações"});
 expect(rpc.mock.calls.some(call=>call[0]==="study_apply_catalog")).toBe(false);
 await user.click(screen.getByRole("button",{name:"Confirmar e salvar"}));
 await screen.findByText("Concurso salvo.");
 expect(rpc).toHaveBeenCalledWith("study_apply_catalog",expect.objectContaining({doc:{...sample,archived:true},expected:sample}));
});
it("cancelar não exclui e erro de migração ausente orienta arquivar",async()=>{
 responses(); const user=userEvent.setup(); show();
 await user.click(screen.getByLabelText("Mais ações de Concurso fictício"));
 await user.click(screen.getByRole("button",{name:"Excluir concurso importado"}));
 await user.click(await screen.findByRole("button",{name:"Cancelar exclusão"}));
 expect(rpc.mock.calls.some(call=>call[0]==="study_delete_contest")).toBe(false);
 rpc.mockImplementation(async(name:string)=>name==="study_catalog_document"?{data:sample,error:null}:{data:null,error:{code:"PGRST202",message:"Missing function"}});
 await user.click(screen.getByLabelText("Mais ações de Concurso fictício"));
 await user.click(screen.getByRole("button",{name:"Excluir concurso importado"}));
 expect((await screen.findByRole("alert")).textContent).toContain("migração 015");
 await user.click(screen.getByLabelText("Mais ações de Concurso fictício"));
 expect(screen.getByRole("button",{name:"Arquivar no catálogo"})).toBeTruthy();
});
it.each([[false,true],[true,false]])("restringe ações de catálogo a admin com edição: %s/%s",(admin,editable)=>{
 responses(); show(admin,editable);
 expect(screen.queryByRole("button",{name:"Excluir concurso importado"})).toBeNull();
 expect(screen.queryByRole("button",{name:"Arquivar no catálogo"})).toBeNull();
});
