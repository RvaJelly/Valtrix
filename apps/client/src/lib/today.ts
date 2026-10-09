import { readActiveWorkout, type ActiveWorkout } from '@/lib/active-workout';
import { totalsOf } from '@/lib/food';
import { emptyDay, loadHabitDays, loadTargets, type HabitDay, type HabitTargets } from '@/lib/habits';
import { loadDay, loadPlans, type NutritionPlan } from '@/lib/nutrition';
import { dueOn, loadPlan, type PlanItem } from '@/lib/plan';
import { checkInWeekKey, loadCheckIns, loadSeenReply } from '@/lib/progress';
import { dayKey } from '@/lib/sessions';

// What Home's Today card shows: today's planned workouts, calories left, habits, the weekly
// check-in and a workout in progress on the phone. It loads on its own, so the rest of Home
// never waits for it.

export type TodayData = {
  // The day it was loaded for.
  day: string;
  // Each server part is null when it couldn't be loaded.
  // Due today, done or not.
  plan: { due: PlanItem[]; hasPlan: boolean } | null;
  // target: the kcal of the newest plan with any targets (as the Nutrition tab picks it),
  // null when none; eaten: today's diary.
  nutrition: { target: number | null; eaten: number } | null;
  // emptyDay(day) when nothing is logged yet.
  habits: HabitDay | null;
  targets: HabitTargets | null;
  // checkedIn: there is a check-in for checkInWeekKey(). newReply: the newest trainer reply from
  // the last 14 days that this phone hasn't shown yet.
  checkIns: { checkedIn: boolean; newReply: { trainer_name: string; at: string } | null } | null;
  // From the phone; null means none (saved or discarded).
  active: ActiveWorkout | null;
};

const NEW_REPLY_DAYS = 14;

// The plan whose targets the diary shows: the newest with any of them.
function kcalTarget(plans: NutritionPlan[]): number | null {
  const plan = plans.find((p) => p.kcal || p.protein_g || p.carbs_g || p.fat_g);
  return plan?.kcal ?? null;
}

export async function loadToday(userId: string, now = new Date()): Promise<TodayData> {
  const day = dayKey(now);
  const [plan, plans, diary, habitDays, targets, checkIns, seen, active] = await Promise.all([
    loadPlan(now).catch(() => null),
    loadPlans().catch(() => null),
    loadDay(day).catch(() => null),
    loadHabitDays(day, day).catch(() => null),
    loadTargets().catch(() => null),
    loadCheckIns(2).catch(() => null),
    loadSeenReply(userId),
    readActiveWorkout(userId),
  ]);
  if (!plan && !plans && !diary && !habitDays && !targets && !checkIns) {
    throw new Error('Could not load today.');
  }

  let newReply: { trainer_name: string; at: string } | null = null;
  if (checkIns) {
    const since = now.getTime() - NEW_REPLY_DAYS * 24 * 60 * 60 * 1000;
    const seenAt = seen ? Date.parse(seen) : 0;
    for (const reply of checkIns.flatMap((c) => c.replies)) {
      const at = Date.parse(reply.updated_at);
      if (!(at > since && at > seenAt)) continue;
      if (!newReply || at > Date.parse(newReply.at))
        newReply = { trainer_name: reply.trainer_name, at: reply.updated_at };
    }
  }

  return {
    day,
    plan: plan ? { due: plan.filter((item) => dueOn(item, now)), hasPlan: plan.length > 0 } : null,
    nutrition: plans && diary ? { target: kcalTarget(plans), eaten: totalsOf(diary).kcal } : null,
    habits: habitDays ? (habitDays.find((h) => h.day === day) ?? emptyDay(day)) : null,
    targets,
    checkIns: checkIns ? { checkedIn: checkIns.some((c) => c.week_start === checkInWeekKey(now)), newReply } : null,
    active,
  };
}

// A failed part keeps the last answer for the same day, so a bad connection never wipes what
// was on screen. A new day starts afresh. The workout on the phone is always the newest.
export function mergeToday(old: TodayData | null, t: TodayData): TodayData {
  if (!old || old.day !== t.day) return t;
  return {
    ...t,
    plan: t.plan ?? old.plan ?? null,
    nutrition: t.nutrition ?? old.nutrition ?? null,
    habits: t.habits ?? old.habits ?? null,
    targets: t.targets ?? old.targets ?? null,
    checkIns: t.checkIns ?? old.checkIns ?? null,
  };
}
