import { createClient } from "@supabase/supabase-js";
import { demoData, demoUser } from "./demo";
import {
  type Snapshot,
  type Material,
  type Node,
  type Check,
  type Note,
  type MaterialLink,
  empty,
  validateFile,
  validateMaterial,
} from "./domain";
const env = import.meta.env;
export const supabase =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
export type Member = {
  contest_id: string;
  user_id: string;
  role: "reader" | "editor";
};
export interface Repository {
  user: string;
  demo: boolean;
  load(): Promise<Snapshot>;
  saveMaterial(m: Material, file?: File): Promise<void>;
  deleteMaterial(m: Material): Promise<void>;
  saveNode(n: Node): Promise<void>;
  check(c: Check): Promise<void>;
  note(n: Note): Promise<void>;
  fileUrl(m: Material): Promise<string>;
  members(): Promise<Member[]>;
  member(m: Member, remove?: boolean): Promise<void>;
  move(m: Material, direction: number): Promise<void>;
  linkMaterial?(material: string, target: string, linked: boolean): Promise<void>;
}
const key = "central-estudos-demo-v1";
export function demoRepository(): Repository {
  let state: Snapshot;
  try {
    state = JSON.parse(localStorage.getItem(key) || "null") || demoData();
  } catch {
    state = demoData();
  }
  const persist = (next: Snapshot) => {
    localStorage.setItem(key, JSON.stringify(next));
    state = next;
  };
  return {
    user: demoUser,
    demo: true,
    async load() {
      return { ...structuredClone(state), libraryReady: true };
    },
    async linkMaterial(material, target, active) {
      if (!state.materials.some(m => m.id === material) || !state.nodes.some(n => n.id === target)) throw new Error("Material ou conteúdo inválido.");
      persist({ ...state, materialLinks: [...(state.materialLinks ?? []).filter(l => !(l.material_id === material && l.node_id === target && l.user_id === demoUser)), { user_id: demoUser, material_id: material, node_id: target, active }] });
    },
    async saveMaterial(m, file) {
      if (m.owner_id !== demoUser) throw new Error("Sem permissão.");
      validateMaterial(m);
      if (file || m.kind === "pdf" || m.kind === "image")
        throw new Error("Arquivos exigem conexão com Supabase.");
      const next = structuredClone(state);
      next.materials = [...next.materials.filter((x) => x.id !== m.id), m];
      persist(next);
    },
    async deleteMaterial(m) {
      if (m.owner_id !== demoUser) throw new Error("Sem permissão.");
      persist({
        ...state,
        materials: state.materials.filter((x) => x.id !== m.id),
      });
    },
    async saveNode(n) {
      persist({
        ...state,
        nodes: [...state.nodes.filter((x) => x.id !== n.id), n],
      });
    },
    async check(c) {
      const checks = [
        ...state.checks.filter(
          (x) =>
            !(
              x.topic_id === c.topic_id &&
              x.step === c.step &&
              x.user_id === c.user_id
            ),
        ),
        c,
      ];
      persist({ ...state, checks });
    },
    async note(n) {
      const notes = [
        ...state.notes.filter(
          (x) => !(x.topic_id === n.topic_id && x.user_id === n.user_id),
        ),
        n,
      ];
      persist({ ...state, notes });
    },
    async fileUrl() {
      throw new Error("Arquivos exigem conexão com Supabase.");
    },
    async members() {
      return [];
    },
    async member() {
      throw new Error(
        "O compartilhamento entre contas exige conexão com Supabase.",
      );
    },
    async move(m, direction) {
      const next = structuredClone(state);
      const list = next.materials
        .filter(
          (x) =>
            x.topic_id === m.topic_id &&
            x.section === m.section &&
            x.owner_id === demoUser,
        )
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const index = list.findIndex((x) => x.id === m.id);
      const other = list[index + direction];
      if (!other) return;
      list.forEach((x, i) => (x.position = i));
      [list[index].position, other.position] = [
        other.position,
        list[index].position,
      ];
      persist(next);
    },
  };
}
export function remoteRepository(user: string): Repository {
  const db = supabase!;
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  const bucket = db.storage.from("study-materials");
  return {
    user,
    demo: false,
    async load() {
      async function readAll(table: string, keys: string[]) {
        const rows: unknown[] = [];
        const pageSize = 200;
        for (let start = 0; ; start += pageSize) {
          let query = db.from(table).select("*");
          for (const key of keys) query = query.order(key);
          const result = await query.range(start, start + pageSize - 1);
          fail(result.error);
          const page = result.data ?? [];
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      }
      const [nodes, materials, checks, notes] = await Promise.all([
        readAll("study_nodes", ["id"]),
        readAll("study_materials", ["id"]),
        readAll("study_checks", ["user_id", "topic_id", "step"]),
        readAll("study_notes", ["user_id", "topic_id"]),
      ]);
      let materialLinks: MaterialLink[] = []; let libraryReady = true;
      try { materialLinks = await readAll("study_material_links", ["user_id","material_id","node_id"]) as MaterialLink[]; }
      catch (e) { if (/study_material_links|schema cache|does not exist/.test((e as Error).message)) libraryReady = false; else throw e; }
      return { nodes, materials: (materials as Material[]).map(m => ({ ...m, topic_id: m.topic_id ?? "" })), checks, notes, materialLinks, libraryReady } as Snapshot;
    },
    async saveMaterial(m, file) {
      validateMaterial(m);
      if (m.owner_id !== user)
        throw new Error("Somente o proprietário pode editar.");
      if (file) {
        validateFile(file);
        if (
          (m.kind === "pdf" && file.type !== "application/pdf") ||
          (m.kind === "image" && !file.type.startsWith("image/")) ||
          !["pdf", "image"].includes(m.kind)
        )
          throw new Error("O arquivo não corresponde ao formato selecionado.");
      }
      const previous = await db
        .from("study_materials")
        .select("*")
        .eq("id", m.id)
        .maybeSingle();
      fail(previous.error);
      const old = previous.data as Material | null;
      const value = { ...m, topic_id: m.topic_id || null };
      if (file)
        value.file_path = `${user}/${m.id}/${crypto.randomUUID()}.${file.type === "application/pdf" ? "pdf" : file.type.split("/")[1]}`;
      if ((value.kind === "pdf" || value.kind === "image") && !value.file_path)
        throw new Error("Selecione um arquivo.");
      const saved = await db
        .from("study_materials")
        .upsert(value)
        .select("id")
        .single();
      fail(saved.error);
      if (file) {
        const upload = await bucket.upload(value.file_path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upload.error) {
          const rollback = old
            ? await db.from("study_materials").upsert(old)
            : await db.from("study_materials").delete().eq("id", m.id);
          throw new Error(
            `Falha no envio: ${upload.error.message}.${rollback.error ? " Não foi possível restaurar o cadastro; confira o material." : ""}`,
          );
        }
      }
      if (old?.file_path && old.file_path !== value.file_path) {
        const cleanup = await bucket.remove([old.file_path]);
        if (cleanup.error)
          throw new Error(
            "Material salvo, mas o arquivo anterior não foi removido. Tente removê-lo no Storage.",
          );
      }
    },
    async deleteMaterial(m) {
      if (m.owner_id !== user) throw new Error("Sem permissão.");
      if (m.file_path) {
        const r = await bucket.remove([m.file_path]);
        fail(r.error);
      }
      const r = await db
        .from("study_materials")
        .delete()
        .eq("id", m.id)
        .select("id")
        .single();
      fail(r.error);
    },
    async saveNode(n) {
      const r = await db.from("study_nodes").upsert(n).select("id").single();
      fail(r.error);
    },
    async check(c) {
      const r = await db.from("study_checks").upsert(c).select("step").single();
      fail(r.error);
    },
    async note(n) {
      const r = await db
        .from("study_notes")
        .upsert(n)
        .select("topic_id")
        .single();
      fail(r.error);
    },
    async fileUrl(m) {
      const r = await bucket.createSignedUrl(m.file_path, 60);
      fail(r.error);
      return r.data!.signedUrl;
    },
    async linkMaterial(material, target, linked) {
      const r = await db.rpc("study_link_library_material", { material_id: material, target, linked });
      fail(r.error);
    },
    async members() {
      const r = await db.from("study_members").select("*");
      fail(r.error);
      return r.data as Member[];
    },
    async member(m, remove) {
      const r = remove
        ? await db
            .from("study_members")
            .delete()
            .eq("contest_id", m.contest_id)
            .eq("user_id", m.user_id)
        : await db.from("study_members").upsert(m);
      fail(r.error);
    },
    async move(m, direction) {
      const r = await db.rpc("study_move_material", {
        material_id: m.id,
        direction,
      });
      fail(r.error);
    },
  };
}
export { empty };
