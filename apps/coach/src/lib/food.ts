import { Platform } from 'react-native';

// Food facts and diary sums shared by Voltrix and Voltrix Coach (the same file is in both apps).
// Products come from Open Food Facts (openfoodfacts.org), a free food database with many
// South African products. Its data is open, and it asks apps to say where it came from.

export type Macros = { kcal: number; protein: number | null; carbs: number | null; fat: number | null };
export type Unit = 'g' | 'ml' | 'serving';

export type Food = {
  barcode: string | null;
  name: string;
  brand: string | null;
  image: string | null;
  // Drinks are measured in ml.
  liquid: boolean;
  // Per 100 g (100 ml for drinks), when known.
  per100: Macros | null;
  // One serving: its size in g (ml) and what it holds, when known.
  serving: { size: number | null; label: string | null; macros: Macros | null } | null;
  // Open Food Facts, the person's own foods or their recent diary.
  source: 'off' | 'mine' | 'recent';
};

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

export function mealLabel(meal: string | undefined) {
  return MEALS.find((m) => m.key === meal)?.label ?? 'Snacks';
}

export function isMeal(value: unknown): value is Meal {
  return MEALS.some((m) => m.key === value);
}

// The meal people are most likely having now.
export function mealForNow(date = new Date()): Meal {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

// A food someone logged, with what the amount they ate adds up to.
export type DiaryEntry = {
  id: string;
  day: string;
  meal: Meal;
  name: string;
  brand: string | null;
  barcode?: string | null;
  amount: number;
  unit: Unit;
  kcal: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  created_at: string;
};

export type Totals = { kcal: number; protein: number; carbs: number; fat: number };

// A trainer's daily targets. Any of them can be left out.
export type Targets = { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };

export type PlanMeal = { name: string; food?: string };

// Numbers come back from the database as numbers or strings.
function toNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cleanEntry(row: Record<string, unknown>): DiaryEntry {
  return {
    id: String(row.id),
    day: String(row.day),
    meal: isMeal(row.meal) ? row.meal : 'snacks',
    name: String(row.name ?? ''),
    brand: (row.brand as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    amount: toNumber(row.amount) ?? 0,
    unit: row.unit === 'ml' || row.unit === 'serving' ? row.unit : 'g',
    kcal: toNumber(row.kcal) ?? 0,
    protein: toNumber(row.protein),
    carbs: toNumber(row.carbs),
    fat: toNumber(row.fat),
    created_at: String(row.created_at ?? ''),
  };
}

export function totalsOf(entries: Pick<DiaryEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Totals {
  return entries.reduce<Totals>(
    (t, e) => ({
      kcal: t.kcal + e.kcal,
      protein: t.protein + (e.protein ?? 0),
      carbs: t.carbs + (e.carbs ?? 0),
      fat: t.fat + (e.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

// Protein and carbs have 4 kcal a gram, fat 9.
export function kcalFromMacros(protein: number | null, carbs: number | null, fat: number | null) {
  return (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;
}

// ---------- Amounts ----------

function scale(m: Macros, factor: number): Macros {
  const times = (v: number | null) => (v === null ? null : v * factor);
  return { kcal: m.kcal * factor, protein: times(m.protein), carbs: times(m.carbs), fat: times(m.fat) };
}

export function baseUnit(food: Food): Unit {
  return food.liquid ? 'ml' : 'g';
}

// What one serving holds, from the label or worked out from its size.
export function perServing(food: Food): Macros | null {
  if (food.serving?.macros) return food.serving.macros;
  if (food.serving?.size && food.per100) return scale(food.per100, food.serving.size / 100);
  return null;
}

export function unitsFor(food: Food): Unit[] {
  const units: Unit[] = [];
  if (food.per100) units.push(baseUnit(food));
  if (perServing(food)) units.push('serving');
  return units;
}

export function hasNutrition(food: Food) {
  return unitsFor(food).length > 0;
}

// What an amount of a food adds up to.
export function nutrientsFor(food: Food, amount: number, unit: Unit): Macros | null {
  if (!(amount > 0)) return null;
  if (unit === 'serving') {
    const one = perServing(food);
    return one ? scale(one, amount) : null;
  }
  return food.per100 ? scale(food.per100, amount / 100) : null;
}

// The amount a food starts at: one serving when there is one, otherwise 100 g.
export function startingAmount(food: Food): { amount: number; unit: Unit } {
  if (perServing(food)) return { amount: 1, unit: 'serving' };
  return { amount: 100, unit: baseUnit(food) };
}

// A food rebuilt from a diary entry, so it can be added again or its amount changed.
export function foodFromEntry(
  e: Pick<DiaryEntry, 'name' | 'brand' | 'barcode' | 'amount' | 'unit' | 'kcal' | 'protein' | 'carbs' | 'fat'>,
): Food {
  const per = (v: number | null, factor: number) => (v === null ? null : v * factor);
  const factor = e.unit === 'serving' ? 1 / e.amount : 100 / e.amount;
  const macros: Macros = {
    kcal: e.kcal * factor,
    protein: per(e.protein, factor),
    carbs: per(e.carbs, factor),
    fat: per(e.fat, factor),
  };
  return {
    barcode: e.barcode ?? null,
    name: e.name,
    brand: e.brand,
    image: null,
    liquid: e.unit === 'ml',
    per100: e.unit === 'serving' ? null : macros,
    serving: e.unit === 'serving' ? { size: null, label: null, macros } : null,
    source: 'recent',
  };
}

// ---------- Words and numbers ----------

// 1250 -> "1 250", the South African way, with a space that never breaks the number.
export function formatNumber(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatKcal(n: number) {
  return `${formatNumber(n)} kcal`;
}

// Grams of protein, carbs or fat: one decimal for small amounts.
export function formatGrams(n: number | null) {
  if (n === null) return '–';
  return n < 10 ? `${Math.round(n * 10) / 10} g` : `${Math.round(n)} g`;
}

function tidy(n: number) {
  return String(Math.round(n * 100) / 100);
}

export function formatAmount(amount: number, unit: Unit) {
  if (unit === 'serving') return `${tidy(amount)} ${amount === 1 ? 'serving' : 'servings'}`;
  return `${tidy(amount)} ${unit}`;
}

export function servingLabel(food: Food) {
  const size = food.serving?.size;
  if (size) return `1 serving (${tidy(size)} ${baseUnit(food)})`;
  return food.serving?.label ? `1 serving (${food.serving.label})` : '1 serving';
}

// ---------- Days ----------
// The diary uses the day on the phone ("2026-10-08"), so late dinners land on the right day.

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromDayKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function shiftDay(key: string, days: number) {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dayTitle(key: string, today = new Date()) {
  const todayKey = dayKey(today);
  if (key === todayKey) return 'Today';
  if (key === shiftDay(todayKey, -1)) return 'Yesterday';
  if (key === shiftDay(todayKey, 1)) return 'Tomorrow';
  return fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Open Food Facts ----------

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const LEGACY_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_FIELDS =
  'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,quantity,image_front_small_url';
const SEARCH_FIELDS =
  'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity,image_front_small_url,countries';
// Open Food Facts asks apps to say who they are. Browsers don't allow setting this.
const HEADERS: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': 'Voltrix/1.0 (fitness app)' };

export const FOOD_CREDIT = 'Food facts from Open Food Facts';

// A problem looking food up, with a message to show as it is.
export class FoodError extends Error {}

const OFFLINE = "You're offline. Check your internet connection and try again.";
const SLOW = 'Food search is slow right now. Try again in a moment.';
const BUSY = 'Food search is busy. Try again in a minute.';
const TROUBLE = "Couldn't look that up right now. Try again.";

async function getJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new FoodError(OFFLINE);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (res.status === 429 || res.status === 503) throw new FoodError(BUSY);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (e) {
    if (e instanceof FoodError) throw e;
    throw new FoodError(controller.signal.aborted ? SLOW : OFFLINE);
  } finally {
    clearTimeout(timer);
  }
}

export function isBarcode(code: string) {
  return /^\d{6,14}$/.test(code);
}

// Product names can come as text or as text per language.
function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(text).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (value && typeof value === 'object') {
    const byLang = value as Record<string, unknown>;
    return text(byLang.en) ?? text(byLang.main) ?? text(Object.values(byLang)[0]);
  }
  return null;
}

type Nutriments = Record<string, unknown>;

// Energy in kcal; South African labels often only give kJ.
function energy(n: Nutriments, per: '100g' | 'serving') {
  const kcal = toNumber(n[`energy-kcal_${per}`]);
  if (kcal !== null) return kcal;
  const kj = toNumber(n[`energy-kj_${per}`]) ?? toNumber(n[`energy_${per}`]);
  return kj === null ? null : kj / 4.184;
}

function macrosFrom(n: Nutriments, per: '100g' | 'serving'): Macros | null {
  const kcal = energy(n, per);
  if (kcal === null || kcal < 0) return null;
  return {
    kcal,
    protein: toNumber(n[`proteins_${per}`]),
    carbs: toNumber(n[`carbohydrates_${per}`]),
    fat: toNumber(n[`fat_${per}`]),
  };
}

const LIQUID = /\d\s*(ml|cl|l)\b/i;

function parseProduct(p: Record<string, unknown>, code: string | null): Food | null {
  const name = text(p.product_name) ?? text(p.product_name_en) ?? text(p.generic_name);
  const barcode = text(p.code) ?? code;
  if (!name && !barcode) return null;
  const n = (p.nutriments ?? {}) as Nutriments;
  const servingSize = toNumber(p.serving_quantity);
  const servingLabel = text(p.serving_size);
  const servingMacros = macrosFrom(n, 'serving');
  const brand = text(p.brands);
  return {
    barcode: barcode && isBarcode(barcode) ? barcode : null,
    name: name ?? 'Unnamed product',
    // "Bokomo, Weet-Bix" -> "Bokomo"
    brand: brand ? brand.split(',')[0].trim() : null,
    image: text(p.image_front_small_url),
    liquid: p.serving_quantity_unit === 'ml' || LIQUID.test(servingLabel ?? '') || LIQUID.test(text(p.quantity) ?? ''),
    per100: macrosFrom(n, '100g'),
    serving:
      servingSize || servingMacros
        ? { size: servingSize && servingSize > 0 ? servingSize : null, label: servingLabel, macros: servingMacros }
        : null,
    source: 'off',
  };
}

// Looks a barcode up. Null when Open Food Facts doesn't know it.
export async function lookupBarcode(code: string): Promise<Food | null> {
  if (!isBarcode(code)) throw new FoodError('Barcodes have 8 to 14 numbers. Check the number and try again.');
  const { status, body } = await getJson(`${PRODUCT_URL}${code}?fields=${PRODUCT_FIELDS}`, 12000);
  const data = (body ?? {}) as { status?: number; product?: Record<string, unknown> };
  if (status === 404 || data.status === 0) return null;
  if (status >= 400 || !data.product) throw new FoodError(TROUBLE);
  return parseProduct(data.product, code);
}

// Lucene characters in what people type would confuse the search.
function searchTerms(query: string) {
  return query
    .replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

const SOUTH_AFRICA = /south[-_ ]?africa/i;

async function searchalicious(q: string, size: number) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&page_size=${size}&langs=en&fields=${SEARCH_FIELDS}`;
  const { status, body } = await getJson(url, 15000);
  const hits = (body as { hits?: unknown })?.hits;
  if (status >= 400 || !Array.isArray(hits)) throw new FoodError(TROUBLE);
  return hits as Record<string, unknown>[];
}

async function legacySearch(terms: string) {
  const url = `${LEGACY_SEARCH_URL}?search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process&json=1&page_size=24&fields=${PRODUCT_FIELDS},countries_tags`;
  const { status, body } = await getJson(url, 15000);
  const products = (body as { products?: unknown })?.products;
  if (status >= 400 || !Array.isArray(products)) throw new FoodError(TROUBLE);
  return products as Record<string, unknown>[];
}

// Searches products by name: ones with calories first, South African products before
// the rest of the world.
export async function searchFoods(query: string): Promise<Food[]> {
  const terms = searchTerms(query);
  if (!terms) return [];
  const [local, world] = await Promise.allSettled([
    searchalicious(`${terms} countries:"en:south-africa"`, 20),
    searchalicious(terms, 30),
  ]);
  let rows: { hit: Record<string, unknown>; local: boolean }[] = [];
  if (local.status === 'fulfilled') rows.push(...local.value.map((hit) => ({ hit, local: true })));
  if (world.status === 'fulfilled') {
    rows.push(...world.value.map((hit) => ({ hit, local: SOUTH_AFRICA.test(JSON.stringify(hit.countries ?? '')) })));
  }
  if (local.status === 'rejected' && world.status === 'rejected') {
    // The newer search is down: try the older one before giving up.
    try {
      rows = (await legacySearch(terms)).map((hit) => ({
        hit,
        local: SOUTH_AFRICA.test(JSON.stringify(hit.countries_tags ?? '')),
      }));
    } catch {
      throw world.reason;
    }
  }
  const seen = new Set<string>();
  const foods: { food: Food; rank: number }[] = [];
  rows.forEach(({ hit, local: isLocal }, i) => {
    const food = parseProduct(hit, null);
    if (!food || !text(hit.product_name)) return;
    const key = food.barcode ?? `${food.name}|${food.brand}`;
    if (seen.has(key)) return;
    seen.add(key);
    foods.push({ food, rank: (hasNutrition(food) ? 0 : 2) + (isLocal ? 0 : 1) + i / 1000 });
  });
  return foods.sort((a, b) => a.rank - b.rank).map((f) => f.food);
}
