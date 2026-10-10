// Programs: weeks of workouts on weekdays. A program's workouts are its own copies (workouts with
// program_id), its schedule is program_slots, and giving it to a client copies it onto their plan
// (plan_assignments, with the client's own copies). Changing one never changes another.

import { rpcOrThrow } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export type Program = {
  id: string;
  name: string;
  description: string | null;
  weeks: number;
  template_id: string | null;
  updated_at: string;
};

export type ProgramSlot = {
  id: string;
  program_id: string;
  workout_id: string;
  week_from: number;
  week_to: number | null;
  // 1 = Monday to 7 = Sunday; empty is any day, once a week.
  weekdays: number[];
  position: number;
  note: string | null;
};

export type PlanAssignment = {
  id: string;
  client_id: string;
  program_id: string | null;
  name: string;
  weeks: number;
  starts_on: string;
  ends_on: string;
};

export const PROGRAM_COLUMNS = 'id, name, description, weeks, template_id, updated_at';
export const SLOT_COLUMNS = 'id, program_id, workout_id, week_from, week_to, weekdays, position, note';
export const ASSIGNMENT_COLUMNS = 'id, client_id, program_id, name, weeks, starts_on, ends_on';

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const NOTE_MAX = 500;

// Gives a program to a client from a Monday; with endCurrent, what runs past then ends. Returns the
// assignment.
export function giveProgram(program: string, client: string, monday: string, endCurrent: boolean) {
  return rpcOrThrow<string>('assign_program', {
    p_program: program,
    p_client: client,
    p_starts_on: monday,
    p_end_current: endCurrent,
  });
}

// Puts a workout on a client's plan as their own copy. Returns the plan workout.
export function giveWorkout(workout: string, client: string, weekdays: number[], note: string | null) {
  return rpcOrThrow<string>('assign_workout', {
    p_workout: workout,
    p_client: client,
    p_weekdays: weekdays,
    p_note: note,
  });
}

// "Save as template": the program as it is on the client's plan, as a new program.
export function saveAsProgram(assignment: string, name: string) {
  return rpcOrThrow<string>('save_assignment_as_program', { p_assignment: assignment, p_name: name });
}

export function duplicateProgram(program: string) {
  return rpcOrThrow<string>('copy_program', { p_program: program });
}

// A copy in the library, or in a program.
export function duplicateWorkout(workout: string, program?: string) {
  return rpcOrThrow<string>('copy_workout', { p_workout: workout, ...(program ? { p_program: program } : {}) });
}

// The video files the trainer's workouts and exercises still use, of these. A copy shares its
// files with the workout it came from, so a file is removed only when nothing uses it any more.
// When the database can't say, every file counts as used, so nothing is removed.
export async function videosInUse(paths: string[]): Promise<Set<string>> {
  const real = paths.filter(Boolean);
  if (!real.length) return new Set();
  const { data, error } = await supabase.rpc('workout_videos_in_use', { p_paths: real });
  if (error) return new Set(real);
  return new Set((data as string[] | null) ?? []);
}

// The paths of these that nothing uses any more, to remove from storage.
export async function unusedVideos(paths: (string | null | undefined)[]) {
  const real = [...new Set(paths.filter((p): p is string => !!p))];
  if (!real.length) return [];
  const used = await videosInUse(real);
  return real.filter((p) => !used.has(p));
}

export function weeksLabel(weeks: number) {
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

export function daysLabelShort(days: number) {
  return days === 1 ? '1 day a week' : `${days} days a week`;
}

// "Weeks 1–4", "Week 5".
export function rangeLabel([from, to]: [number, number]) {
  return from === to ? `Week ${from}` : `Weeks ${from}–${to}`;
}
