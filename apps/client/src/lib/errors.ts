// What to tell the person when a save fails. The database's own messages for a refused
// workout or habit (codes 22023 and 42501) are written for people, so they are shown as
// they come, except its row-level security wording. Anything else is most likely the
// connection.

export const SAVE_FAILED = "That didn't save. Check your connection and try again.";

export function saveError(error: unknown, fallback = SAVE_FAILED): string {
  const e = error as { code?: string; message?: string } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  if (
    (e?.code === '22023' || e?.code === '42501') &&
    message &&
    !/row-level security|permission denied/i.test(message)
  ) {
    return message;
  }
  // A value out of range (a check constraint).
  if (e?.code === '23514') return 'Check the numbers and try again.';
  return fallback;
}
