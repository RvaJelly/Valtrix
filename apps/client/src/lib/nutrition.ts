import {
  cleanEntry,
  foodFromEntry,
  nutrientsFor,
  type DiaryEntry,
  type Food,
  type Meal,
  type PlanMeal,
  type Unit,
} from '@/lib/food';
import { supabase } from '@/lib/supabase';

// The signed-in person's food diary, their own foods and their trainers' nutrition plans.

const ENTRY_COLUMNS = 'id, day, meal, name, brand, barcode, amount, unit, kcal, protein, carbs, fat, created_at';

export async function loadDay(day: string) {
  const { data, error } = await supabase.from('food_diary').select(ENTRY_COLUMNS).eq('day', day).order('created_at');
  if (error) throw error;
  return (data ?? []).map(cleanEntry);
}

// Totals are rounded to one decimal, the way the database keeps them.
const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

export async function addToDiary(food: Food, amount: number, unit: Unit, meal: Meal, day: string) {
  const totals = nutrientsFor(food, amount, unit);
  if (!totals) throw new Error('This food has no calories to add.');
  const { data, error } = await supabase
    .from('food_diary')
    .insert({
      day,
      meal,
      name: food.name.slice(0, 200),
      brand: food.brand?.slice(0, 200) || null,
      barcode: food.barcode,
      amount: Math.round(amount * 100) / 100,
      unit,
      kcal: round(totals.kcal),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
    })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw new Error('Could not add it. Check your internet connection and try again.');
  return cleanEntry(data);
}

// A new amount of the same food scales everything it adds up to.
export async function changeAmount(entry: DiaryEntry, amount: number) {
  const totals = nutrientsFor(foodFromEntry(entry), amount, entry.unit);
  if (!totals) throw new Error('Enter an amount above 0.');
  const { data, error } = await supabase
    .from('food_diary')
    .update({
      amount: Math.round(amount * 100) / 100,
      kcal: round(totals.kcal),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
    })
    .eq('id', entry.id)
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw new Error('Could not change the amount. Try again.');
  return cleanEntry(data);
}

export async function removeFromDiary(id: string) {
  const { error } = await supabase.from('food_diary').delete().eq('id', id);
  if (error) throw new Error('Could not remove it. Try again.');
}

// The foods logged most recently, each once.
export async function loadRecent(): Promise<Food[]> {
  const { data, error } = await supabase
    .from('food_diary')
    .select(ENTRY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const seen = new Set<string>();
  const foods: Food[] = [];
  for (const entry of (data ?? []).map(cleanEntry)) {
    const key = entry.barcode || `${entry.name.toLowerCase()}|${(entry.brand ?? '').toLowerCase()}`;
    if (seen.has(key) || !(entry.amount > 0)) continue;
    seen.add(key);
    foods.push(foodFromEntry(entry));
    if (foods.length >= 25) break;
  }
  return foods;
}

// ---------- The person's own foods ----------

const MY_FOOD_COLUMNS = 'id, barcode, name, brand, per, kcal, protein, carbs, fat, serving_size, liquid';

type MyFoodRow = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  per: '100g' | 'serving';
  kcal: number | string;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  serving_size: number | string | null;
  liquid: boolean;
};

const num = (v: number | string | null) => (v === null || v === '' ? null : Number(v));

function fromMyFood(row: MyFoodRow): Food {
  const macros = { kcal: Number(row.kcal), protein: num(row.protein), carbs: num(row.carbs), fat: num(row.fat) };
  const size = num(row.serving_size);
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    image: null,
    liquid: row.liquid,
    per100: row.per === '100g' ? macros : null,
    serving: row.per === 'serving' ? { size, label: null, macros } : size ? { size, label: null, macros: null } : null,
    source: 'mine',
  };
}

export async function findMyFood(barcode: string) {
  const { data, error } = await supabase
    .from('custom_foods')
    .select(MY_FOOD_COLUMNS)
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return data ? fromMyFood(data as MyFoodRow) : null;
}

export async function loadMyFoods() {
  const { data, error } = await supabase.from('custom_foods').select(MY_FOOD_COLUMNS).order('name').limit(500);
  if (error) throw error;
  return ((data ?? []) as MyFoodRow[]).map(fromMyFood);
}

export type MyFoodInput = {
  barcode: string | null;
  name: string;
  brand: string | null;
  per: '100g' | 'serving';
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  serving_size: number | null;
  liquid: boolean;
};

// One of the person's own foods as it was saved, so saving the same form again changes it.
export type SavedFood = { id: string; barcode: string | null; created: boolean; food: Food };

const SAVE_FAILED = 'Could not save your food. Check your internet connection and try again.';

// Saves a food the person typed in. A barcode they saved before is updated, so the
// next scan of it finds the new numbers. Pass what the form saved last time (when they
// went back to fix a number) so it is changed instead of saved twice.
export async function saveMyFood(input: MyFoodInput, before?: SavedFood | null): Promise<SavedFood> {
  const { barcode, ...changes } = input;
  const existing =
    before && before.barcode === barcode
      ? { data: { id: before.id }, error: null }
      : barcode
        ? await supabase.from('custom_foods').select('id').eq('barcode', barcode).maybeSingle()
        : null;
  if (existing?.error) throw new Error(SAVE_FAILED);
  const { data, error } = existing?.data
    ? await supabase.from('custom_foods').update(changes).eq('id', existing.data.id).select(MY_FOOD_COLUMNS).single()
    : await supabase
        .from('custom_foods')
        .insert({ ...changes, barcode })
        .select(MY_FOOD_COLUMNS)
        .single();
  if (error) throw new Error(SAVE_FAILED);
  const row = data as MyFoodRow;
  const created = existing?.data ? before?.id === row.id && before.created : true;
  // The barcode changed since the last save: the food this form added before is replaced.
  if (before?.created && before.id !== row.id) {
    await supabase.from('custom_foods').delete().eq('id', before.id);
  }
  return { id: row.id, barcode: row.barcode, created, food: fromMyFood(row) };
}

// ---------- Plans from trainers ----------

export type NutritionPlan = {
  id: string;
  trainer_id: string;
  trainer_name: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  meals: PlanMeal[];
  notes: string | null;
  updated_at: string;
};

// Newest first: the newest plan's targets are the ones the diary shows.
export async function loadPlans() {
  const { data, error } = await supabase.rpc('my_nutrition_plans');
  if (error) throw error;
  return ((data ?? []) as NutritionPlan[]).map((p) => ({
    ...p,
    meals: Array.isArray(p.meals) ? p.meals.filter((m) => m && typeof m.name === 'string') : [],
  }));
}

// Whether the person has a trainer, who can see their diary.
export async function hasTrainer() {
  const { data } = await supabase.rpc('my_trainers');
  return Array.isArray(data) && data.length > 0;
}
