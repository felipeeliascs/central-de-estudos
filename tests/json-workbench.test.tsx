import {useState} from "react";
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {JsonImportWorkbench} from "../src/JsonImportWorkbench";
import {videoBase,validVideoBatch} from "./video-fixture";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function Review({initial=JSON.stringify(validVideoBatch)}:{initial?:string}) {
 const [raw,setRaw]=useState(initial);
 return <><textarea aria-label="Rascunho de teste" value={raw} onChange={e=>setRaw(e.target.value)}/><JsonImportWorkbench raw={raw} onChange={setRaw} accepted={["video_batch"]} context={{contest:videoBase}}/></>;
}
it("corrige a entrada 30 na tabela e preserva o original para restauração",async()=>{
 const user=userEvent.setup();
 const batch={...validVideoBatch,resources:validVideoBatch.resources.map((r,i)=>({...r,title:i===29?"a".repeat(181):r.title}))};
 render(<Review initial={JSON.stringify(batch)}/>);
 await user.click(screen.getByRole("button",{name:"Corrigir este campo"}));
 const field=screen.getByLabelText(/Título \*.*\$\.resources\[29\]\.title/);
 fireEvent.change(field,{target:{value:"Aula revisada"}});
 expect(JSON.parse((screen.getByLabelText("Rascunho de teste") as HTMLTextAreaElement).value).resources[29].title).toBe("Aula revisada");
 expect((screen.getByRole("button",{name:"Baixar JSON revisado"}) as HTMLButtonElement).disabled).toBe(false);
 vi.spyOn(window,"confirm").mockReturnValue(true);
 await user.click(screen.getByRole("button",{name:"Restaurar entrada original"}));
 expect((screen.getByLabelText("Rascunho de teste") as HTMLTextAreaElement).value).toBe(JSON.stringify(batch));
});
it("identifica o destino errado e impede exportação como se fosse válido",()=>{
 render(<Review initial='{"schema_version":"1.0","type":"library_batch","materials":[]}'/>);
 expect(screen.getByText(/Abra Biblioteca/)).toBeTruthy();
 expect((screen.getByRole("button",{name:"Baixar JSON revisado"}) as HTMLButtonElement).disabled).toBe(true);
});
it("usa a cerca de código somente após ação explícita e mantém download original",async()=>{
 const user=userEvent.setup();const plain=JSON.stringify(validVideoBatch);
 render(<Review initial={"```json\n"+plain+"\n```"}/>);
 expect((screen.getByRole("button",{name:"Baixar JSON revisado"}) as HTMLButtonElement).disabled).toBe(true);
 await user.click(screen.getByRole("button",{name:"Usar somente o JSON identificado"}));
 expect((screen.getByLabelText("Rascunho de teste") as HTMLTextAreaElement).value).toBe(plain);
 expect(screen.getByRole("button",{name:"Baixar entrada original"})).toBeTruthy();
});
it("produz pedido de correção sob revisão sem enviar o arquivo",async()=>{
 const user=userEvent.setup();render(<Review initial='{"type":"video_batch","schema_version":"1.0","contest_id":"errado","resources":[],"secreto":"NÃO COPIAR"}'/>);
 await user.click(screen.getByRole("button",{name:"Preparar pedido de correção para IA externa"}));
 const report=screen.getByLabelText("Pedido de correção ou contrato para IA externa") as HTMLTextAreaElement;
 expect(report.value).toContain("$.contest_id");expect(report.value).not.toContain("NÃO COPIAR");
 expect(within(screen.getByRole("region",{name:"Revisão assistida do JSON"})).getByText(/não são enviados automaticamente/)).toBeTruthy();
});

it("baixa o JSON revisado e a entrada original sem alterar os dados",async()=>{
 const user=userEvent.setup();
 const original={...validVideoBatch,resources:validVideoBatch.resources.map((r,i)=>({...r,title:i===29?"a".repeat(181):r.title}))};
 const blobs:Blob[]=[];
 Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn((blob:Blob)=>{blobs.push(blob);return "blob:qa";})});
 Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:vi.fn()});
 vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
 render(<Review initial={JSON.stringify(original)}/>);
 await user.click(screen.getByRole("button",{name:"Corrigir este campo"}));
 fireEvent.change(screen.getByLabelText(/Título \*.*\$\.resources\[29\]\.title/),{target:{value:"Corrigido"}});
 await user.click(screen.getByRole("button",{name:"Baixar JSON revisado"}));
 await user.click(screen.getByRole("button",{name:"Baixar entrada original"}));
 const read=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob);});
 const revised=JSON.parse(await read(blobs[0]));
 expect(revised.resources[29].title).toBe("Corrigido");
 expect(revised.resources[0]).toEqual(original.resources[0]);
 expect(JSON.parse(await read(blobs[1]))).toEqual(original);
});
