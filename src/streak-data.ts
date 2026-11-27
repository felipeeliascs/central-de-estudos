import { supabase } from "./repository";
import { productivityStore } from "./productivity-data";
import { calculateStreak, type Streak } from "./streak";
export async function readStreak(user: string, demo: boolean): Promise<Streak> {
  if (!demo) {
    const result = await supabase!.rpc("study_activity_streak");
    if (result.error) throw result.error;
    if (!result.data || typeof result.data.current !== "number" || !Array.isArray(result.data.active_days)) throw new Error("Resposta de atividade inválida.");
    return result.data as Streak;
  }
  const data = await productivityStore(user,true).load();
  return calculateStreak([
    ...data.sessions.filter(s => s.seconds > 0).map(s => s.ended_at),
    ...data.results.filter(r => r.answered > 0).map(r => r.recorded_at),
    ...data.answers.map(a => a.created_at),
    ...data.reviews.map(r => r.reviewed_at),
  ]);
}
