import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {guara,guaraSnapshot,uuid} from "./guaratingueta-fixture";
const {rpc,catalog}=vi.hoisted(()=>({rpc:vi.fn(),catalog:{doc:null as unknown}}));
vi.mock("../src/repository",()=>({supabase:{rpc,from:()=>{
 let fields="";const response={data:[],error:null};
 const query={select:(value:string)=>{fields=value;return query;},like:()=>query,order:()=>query,eq:()=>query,limit:async()=>response,maybeSingle:async()=>({data:fields==="document"?{document:catalog.doc}:null,error:null}),then:(resolve:(r:typeof response)=>void)=>Promise.resolve(response).then(resolve)};return query;
}}}));
import {ContestPanel} from "../src/ContestPanel";
import {NoticePage} from "../src/NoticePage";
beforeEach(()=>{catalog.doc=guara;rpc.mockReset();rpc.mockResolvedValue({data:"saved",error:null});});
afterEach(()=>cleanup());
it.each(["arquivo","colagem"])("administrador importa o edital completo de Guaratinguetá e confirma os 254 vínculos: %s",async method=>{
 const user=userEvent.setup();render(<ContestPanel startImport nodes={[]} editable={new Set()} user="qa-admin" admin close={()=>{}} open={()=>{}} refresh={async()=>{}}/>);
 const raw=JSON.stringify(guara);
 if(method==="arquivo"){const file=new File([raw],"guaratingueta.json",{type:"application/json"});Object.defineProperty(file,"text",{value:async()=>raw});await user.upload(screen.getByLabelText("Arquivo JSON"),file);}
 else{await user.click(screen.getByLabelText("Ou cole o JSON"));await user.paste(raw);}
 await user.click(screen.getByRole("button",{name:"Gerar prévia"}));
 await screen.findByRole("heading",{name:"Prévia de alterações"});
 expect(screen.queryByText(/Cadastro parcial:/)).toBeNull();
 expect(rpc.mock.calls.some(c=>c[0]==="study_apply_catalog")).toBe(false);
 await user.click(screen.getByRole("button",{name:"Confirmar e salvar"}));
 await screen.findByText("Concurso salvo.");
 expect(rpc).toHaveBeenCalledWith("study_apply_catalog",expect.objectContaining({doc:guara,expected:null,operation:"import"}));
},20000);
it("Abrir Edital mostra as quatro disciplinas, distribuição, árvore e 75 obras sem controles de estudo",async()=>{
 const user=userEvent.setup();render(<NoticePage id={uuid(1)} snapshot={guaraSnapshot()} demo={false} close={()=>{}} study={()=>{}}/>);
 await screen.findByRole("heading",{name:guara.name});
 expect(screen.getByText("2027-02-21")).toBeTruthy();
 for(const name of ["Língua Portuguesa","Matemática","Noções de Informática","Conhecimentos Específicos"])expect(screen.getByText(name,{exact:true})).toBeTruthy();
 await user.click(screen.getByText("Conhecimentos Específicos",{exact:true}));
 await user.click(screen.getByText("Conhecimentos específicos — programa e bibliografia do cargo",{exact:true}));
 expect(document.querySelectorAll(".notice-bibliography")).toHaveLength(75);
 expect(screen.getByText(guara.resources[74].title,{exact:true})).toBeTruthy();
 expect(screen.getByRole("link",{name:"Acessar página oficial do concurso ↗"}).getAttribute("href")).toBe("https://www.vunesp.com.br/PGUA2501");
 expect(screen.queryByRole("checkbox")).toBeNull();
 expect(screen.queryByRole("button",{name:"Adicionar material"})).toBeNull();
});
