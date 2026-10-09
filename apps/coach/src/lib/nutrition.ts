import { cleanEntry, type PlanMeal } from '@/lib/food';
import { supabase } from '@/lib/supabase';

// A client's nutrition plan, which they see in the Voltrix app, and their food diary.

export type NutritionPlan = {
  id: string;
  client_id: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  meals: PlanMeal[];
  notes: string | null;
  updated_at: string;
};

export type PlanInput = Pick<NutritionPlan, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'meals' | 'notes'>;

const PLAN_COLUMNS = 'id, client_id, kcal, protein_g, carbs_g, fat_g, meals, notes, updated_at';

function cleanPlan(row: NutritionPlan): NutritionPlan {
  return { ...row, meals: Array.isArray(row.meals) ? row.meals.filter((m) => m && typeof m.name === 'string') : [] };
}

export async function loadPlan(clientId: string) {
  const { data, error } = await supabase
    .from('nutrition_plans')
    .select(PLAN_COLUMNS)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? cleanPlan(data as NutritionPlan) : null;
}

export async function savePlan(clientId: string, input: PlanInput, existingId?: string) {
  const { data, error } = existingId
    ? await supabase.from('nutrition_plans').update(input).eq('id', existingId).select(PLAN_COLUMNS).single()
    : await supabase
        .from('nutrition_plans')
        .insert({ ...input, client_id: clientId })
        .select(PLAN_COLUMNS)
        .single();
  if (error) throw new Error('Could not save the plan. Check your internet connection and try again.');
  return cleanPlan(data as NutritionPlan);
}

export async function deletePlan(id: string) {
  const { error } = await supabase.from('nutrition_plans').delete().eq('id', id);
  if (error) throw new Error('Could not remove the plan. Try again.');
}

// What the client logged between two days ("2026-10-02" to "2026-10-08").
export async function loadClientDiary(clientId: string, from: string, to: string) {
  const { data, error } = await supabase.rpc('client_food_diary', { p_client: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(cleanEntry);
}
