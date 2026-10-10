// Voltrix templates: ready-made programs and workouts built from the built-in exercises. Using one
// makes the trainer's own program or workout, theirs to change.

import { rpcOrThrow } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type TemplateExercise = {
  name: string;
  sets: number;
  reps: string;
  rest?: number | null;
  notes?: string | null;
};
export type TemplateWorkout = { key: string; name: string; notes?: string | null; exercises: TemplateExercise[] };
export type TemplateSlot = {
  workout: string;
  weekdays: number[];
  from?: number | null;
  to?: number | null;
  note?: string | null;
};
// A workout template has no schedule.
export type TemplateBody = { workouts: TemplateWorkout[]; schedule?: TemplateSlot[] };

export type Template = {
  id: string;
  slug: string;
  kind: 'program' | 'workout';
  name: string;
  summary: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  equipment: 'gym' | 'home';
  weeks: number;
  days_per_week: number;
  minutes: number;
  position: number;
  body: TemplateBody;
};

export const TEMPLATE_COLUMNS =
  'id, slug, kind, name, summary, level, equipment, weeks, days_per_week, minutes, position, body';

export const LEVELS: Record<Template['level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export async function loadTemplates(): Promise<Template[]> {
  const { data, error } = await supabase.from('voltrix_templates').select(TEMPLATE_COLUMNS).order('position');
  if (error) throw error;
  return (data ?? []) as Template[];
}

export async function loadTemplate(slug: string): Promise<Template | null> {
  const { data, error } = await supabase
    .from('voltrix_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Template | null) ?? null;
}

// Makes the trainer's own copy: a program template a new program, a workout template a library
// workout, or a workout in `program`. Returns the new program or workout.
export function startFromTemplate(template: string, program?: string) {
  return rpcOrThrow<string>('use_voltrix_template', {
    p_template: template,
    ...(program ? { p_program: program } : {}),
  });
}

// "8 weeks · 3 days a week · Beginner", "Workout · 40 min · Intermediate".
export function templateSubtitle(t: Pick<Template, 'kind' | 'weeks' | 'days_per_week' | 'minutes' | 'level'>) {
  if (t.kind === 'workout') return `Workout · ${t.minutes} min · ${LEVELS[t.level]}`;
  const weeks = t.weeks === 1 ? '1 week' : `${t.weeks} weeks`;
  const days = t.days_per_week === 1 ? '1 day a week' : `${t.days_per_week} days a week`;
  return `${weeks} · ${days} · ${LEVELS[t.level]}`;
}

// "4 × 8 · 2 min 30 s rest".
export function exerciseLine(e: TemplateExercise) {
  const rest = e.rest == null ? null : restWords(e.rest);
  return [`${e.sets} × ${e.reps}`, rest].filter(Boolean).join(' · ');
}

function restWords(seconds: number) {
  if (seconds <= 0) return 'No rest';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} s rest`;
  return s ? `${m} min ${s} s rest` : `${m} min rest`;
}
