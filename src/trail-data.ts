import { supabase } from "./repository";
import type { TrailState } from "./trails";
export type SavedTrail = { revision: number | null; state: TrailState };
export const emptyTrail = (): SavedTrail => ({ revision: null, state: { version: 1, config: { minutes: [60,60,60,60,60,0,0], measure: "questions", topics: [] }, weeks: [] } });
const key = (user: string, contest: string) => "central-trail:" + user + ":" + contest;
export async function readTrail(user: string, demo: boolean, contest: string): Promise<SavedTrail> {
  if (demo) return JSON.parse(localStorage.getItem(key(user,contest)) ?? "null") ?? emptyTrail();
  const result = await supabase!.from("study_trails").select("revision,state").eq("user_id",user).eq("contest_id",contest).maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? emptyTrail();
}
export async function saveTrail(user: string, demo: boolean, contest: string, previous: SavedTrail, state: TrailState): Promise<SavedTrail> {
  const revision = (previous.revision ?? 0) + 1;
  if (demo) { const next = { revision, state }; localStorage.setItem(key(user,contest),JSON.stringify(next)); return next; }
  const table = supabase!.from("study_trails");
  const write = previous.revision === null ? table.insert({ user_id:user,contest_id:contest,revision,state }) : table.update({ revision,state }).eq("user_id",user).eq("contest_id",contest).eq("revision",previous.revision);
  const result = await write.select("revision").maybeSingle();
  if (result.error?.code === "23505" || (!result.data && !result.error)) throw new Error("A trilha mudou em outra aba. Recarregue antes de salvar.");
  if (result.error) throw result.error;
  return { revision, state };
}
