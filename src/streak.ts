import { addDays, todayInBrazil } from "./planner";
export type Streak = { current: number; best: number; studied_today: boolean; last_day: string | null; active_days: string[] };
export function calculateStreak(stamps: string[], now = new Date()): Streak {
  const today = todayInBrazil(now);
  const days = [...new Set(stamps.filter(s => Number.isFinite(Date.parse(s)) && Date.parse(s) <= now.getTime()).map(s => todayInBrazil(new Date(s))))].sort();
  let best=0, run=0, last: string | null=null;
  for (const day of days) { run = last && addDays(last,1) === day ? run+1 : 1; best=Math.max(best,run); last=day; }
  return { current: last && last >= addDays(today,-1) ? run : 0,best,studied_today:days.includes(today),last_day:last,active_days:days.filter(d => d >= addDays(today,-6)) };
}
