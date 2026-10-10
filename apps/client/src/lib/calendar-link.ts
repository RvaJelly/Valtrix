// The calendar link's addresses, the same file in Voltrix and Voltrix Coach. The link holds a long
// random secret; whoever has it sees the person's session times and places, never notes, prices or
// health. Pure: no runtime imports, so the unit checks can load it as it is.

export type CalendarLink = { token: string | null; created_at: string | null; last_used_at: string | null };

// Expo puts the project's address in at build time; the unit checks pass their own.
function baseOf(base?: string): string {
  return (base ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
}

// https://<project>.supabase.co/functions/v1/calendar-feed/<token>.ics
export function feedUrl(token: string, base?: string): string {
  return `${baseOf(base)}/functions/v1/calendar-feed/${token}.ics`;
}

// The same with webcal://, which tells Apple Calendar and Outlook to subscribe.
export function webcalUrl(token: string, base?: string): string {
  return feedUrl(token, base).replace(/^https?:\/\//, 'webcal://');
}

// Google Calendar's page for adding a calendar by its address.
export function googleAddUrl(token: string, base?: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(token, base))}`;
}
