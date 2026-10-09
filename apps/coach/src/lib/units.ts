// Units and numbers on screen, the same as in Voltrix. Clients' weights are kept in kg and
// lengths in cm, water in ml and sleep in minutes; Voltrix Coach shows them in the trainer's own
// units (Settings).

export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';

export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;
export const ML_PER_FL_OZ = 29.5735;

// A space that never breaks a number in two, as lib/food.ts groups thousands.
const GROUP = ' ';

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// "62,5" or " 62.5 " → 62.5; '' or not a number or below 0 → null.
export function parseNumber(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// Rounds to at most `decimals` and drops trailing zeros, with no grouping (for text inputs):
// trim(62.50) → '62.5'.
export function trim(value: number, decimals = 2): string {
  const rounded = round(value, decimals);
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

// Like trim, with thousands grouped by a non-breaking space: formatNumber(8250) → '8 250',
// formatNumber(2.25, 1) → '2.3'.
export function formatNumber(value: number, decimals = 0): string {
  const [whole, fraction] = trim(value, decimals).split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = (sign ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return `${sign}${digits}${fraction ? `.${fraction}` : ''}`;
}

export function toKg(value: number, unit: WeightUnit): number {
  return round(unit === 'lb' ? value / LB_PER_KG : value, 3);
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return round(unit === 'lb' ? kg * LB_PER_KG : kg, 2);
}

export function toCm(value: number, unit: LengthUnit): number {
  return round(unit === 'in' ? value * CM_PER_IN : value, 2);
}

export function fromCm(cm: number, unit: LengthUnit): number {
  return round(unit === 'in' ? cm / CM_PER_IN : cm, 2);
}

// '62.5 kg', '137.5 lb', '1 250 kg'; null → '–'. withUnit false → '62.5'.
export function formatWeight(kg: number | null, unit: WeightUnit, withUnit = true): string {
  if (kg === null || !Number.isFinite(kg)) return '–';
  const value = formatNumber(fromKg(kg, unit), 2);
  return withUnit ? `${value} ${unit}` : value;
}

// An estimated one-rep max, rounded to 0.5 kg or to 1 lb: '80 kg', '77.5 kg', '176 lb'.
export function formatEstimate(kg: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${formatNumber(Math.round(kg * LB_PER_KG))} lb`;
  return `${formatNumber(Math.round(kg * 2) / 2, 1)} kg`;
}

// '82.5 cm', '32.5 in'; null → '–'.
export function formatLength(cm: number | null, unit: LengthUnit, withUnit = true): string {
  if (cm === null || !Number.isFinite(cm)) return '–';
  const value = formatNumber(fromCm(cm, unit), 2);
  return withUnit ? `${value} ${unit}` : value;
}

// For a TextInput: '' for null, else the weight in the person's unit.
export function weightInput(kg: number | null, unit: WeightUnit): string {
  return kg === null ? '' : trim(fromKg(kg, unit));
}

// Water goes with the weight units: ml for kg, whole fl oz for lb.
export function waterValue(ml: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round(ml / ML_PER_FL_OZ) : Math.round(ml);
}

export function waterUnit(unit: WeightUnit): 'ml' | 'oz' {
  return unit === 'lb' ? 'oz' : 'ml';
}

// A typed water amount (ml, or fl oz for lb) in whole ml.
export function waterToMl(value: number, unit: WeightUnit): number {
  return Math.round(unit === 'lb' ? value * ML_PER_FL_OZ : value);
}

// Short labels and averages: '750 ml' below 1 000 ml, else '2.1 L'; for lb, '25 oz'.
export function formatWater(ml: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${formatNumber(ml / ML_PER_FL_OZ)} oz`;
  return ml < 1000 ? `${formatNumber(ml)} ml` : `${formatNumber(ml / 1000, 1)} L`;
}

// One quick add of water in ml: a glass of 250 ml, or 8 fl oz.
export function waterStep(unit: WeightUnit): number {
  return unit === 'lb' ? 237 : 250;
}

// '7 h 30 min', '8 h', '45 min'; null → 'Not logged'.
export function formatSleep(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return 'Not logged';
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatSteps(steps: number): string {
  return formatNumber(steps);
}

// A limit in the person's units, rounded inwards so both ends are allowed:
// rangeLabel(44.09, 881.85, 1, 'lb') → '44.1–881.8 lb', rangeLabel(500, 100000, 0, '') → '500–100 000'.
export function rangeLabel(min: number, max: number, decimals: number, unit: string): string {
  const factor = 10 ** decimals;
  // The small nudge keeps floating point noise (78.69999…) from rounding the wrong way.
  const low = Math.ceil(min * factor - 1e-9) / factor;
  const high = Math.floor(max * factor + 1e-9) / factor;
  return `${formatNumber(low, decimals)}–${formatNumber(high, decimals)}${unit ? ` ${unit}` : ''}`;
}

// "45 s", "90 s", "2 min", "2:30 min": short enough for a small box on any phone.
export function restLabel(seconds: number): string {
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}:${String(rest).padStart(2, '0')} min` : `${minutes} min`;
}
