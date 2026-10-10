import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type DbError = { code?: string; message: string };

export const PLAN_NOT_ACTIVE =
  'Your Voltrix Coach plan isn’t active. Subscribe to keep adding clients, workouts and sessions.';

// A plain message for a refused save. A broken check (23514) means something is too long
// or not allowed, which the form should normally stop before it gets that far.
export function saveError(error: DbError) {
  if (error.code === '23514') return 'Some of that is too long. Shorten it and try again.';
  return plainError(error);
}

// The same for adding something new: a client, workout, exercise, session, plan or video.
// Only a trainer with a trial, plan or free access can add these, and the database turns
// the rest away (42501). The app shows the Subscribe screen first, but a trial or plan can
// end, or free access be switched off, while the app is open.
export async function addError(error: DbError) {
  if (error.code === '42501') return accessRefused();
  return saveError(error);
}

const listeners = new Set<() => void>();

// The sign-in code listens here, to check the trainer's account again.
export function onAccessRefused(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Something new was turned away. Asks the database whether the trainer can still add
// things: if not, their account is checked again, which moves them to the Subscribe
// screen. Returns the message to show.
export async function accessRefused() {
  const { data, error } = await supabase.rpc('has_coach_access');
  // They still have access, so something else was wrong, like a client removed meanwhile.
  if (!error && data === true) return 'That couldn’t be saved. Go back and try again.';
  for (const listener of listeners) listener();
  return PLAN_NOT_ACTIVE;
}
