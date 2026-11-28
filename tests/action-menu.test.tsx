import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionMenu } from "../src/ActionMenu";
import { CollapsibleSection } from "../src/CollapsibleSection";
beforeEach(()=>localStorage.clear());afterEach(cleanup);
it("fecha menu com Escape, clique externo e escolha da ação sem bloquear teclado",async()=>{
 const user=userEvent.setup(),action=vi.fn();
 render(<><ActionMenu label="Mais ações"><button onClick={action}>Editar</button></ActionMenu><button>Fora</button></>);
 const trigger=screen.getByLabelText("Mais ações");
 await user.click(trigger);expect(trigger.closest("details")?.open).toBe(true);
 await user.keyboard("{Escape}");expect(trigger.closest("details")?.open).toBe(false);expect(document.activeElement).toBe(trigger);
 await user.click(trigger);await user.click(screen.getByRole("button",{name:"Fora"}));expect(trigger.closest("details")?.open).toBe(false);
 await user.click(trigger);await user.click(screen.getByRole("button",{name:"Editar"}));expect(action).toHaveBeenCalledOnce();expect(trigger.closest("details")?.open).toBe(false);
});
it("guarda expansão por conta e mantém estado recolhido para outra conta",async()=>{
 const user=userEvent.setup();
 const view=render(<CollapsibleSection title="Mapa de domínio" description="Evidências" icon={null} storageKey="performance:user-a"><p>Detalhes</p></CollapsibleSection>);
 let trigger=screen.getByRole("button",{name:/Mapa de domínio/});expect(trigger.getAttribute("aria-expanded")).toBe("false");
 await user.click(trigger);expect(localStorage.getItem("performance:user-a")).toBe("open");
 view.unmount();
 const second=render(<CollapsibleSection title="Mapa de domínio" description="Evidências" icon={null} storageKey="performance:user-a"><p>Detalhes</p></CollapsibleSection>);
 trigger=screen.getByRole("button",{name:/Mapa de domínio/});expect(trigger.getAttribute("aria-expanded")).toBe("true");second.unmount();
 render(<CollapsibleSection title="Mapa de domínio" description="Evidências" icon={null} storageKey="performance:user-b"><p>Detalhes</p></CollapsibleSection>);
 expect(screen.getByRole("button",{name:/Mapa de domínio/}).getAttribute("aria-expanded")).toBe("false");
});
