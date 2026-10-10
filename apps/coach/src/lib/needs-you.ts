// "Needs you" on Home: the clients with something for the trainer to do today, one reason each,
// the most important first. The rules are narrow so a row always means something to do, and
// doing it clears the row. Pure: only type imports, so the unit checks can load it as it is.

import type { Href } from 'expo-router';

import type { ClientOverview } from '@/lib/overview';

export type NeedKind = 'check_in' | 'quiet' | 'missed_check_in' | 'no_shows' | 'invite';

export type Need = {
  kind: NeedKind;
  client: ClientOverview;
  subtitle: string;
  // When it started (ms): the longest waiting comes first within a reason.
  since: number;
  href: Href;
  // A button at the end of the row: a chat with the client, or the WhatsApp invite.
  trailing: 'message' | 'whatsapp' | null;
};

export const NEED_KINDS: NeedKind[] = ['check_in', 'quiet', 'missed_check_in', 'no_shows', 'invite'];

export const NEED_TITLES: Record<NeedKind, string> = {
  check_in: 'Check-ins to answer',
  quiet: 'Gone quiet',
  missed_check_in: 'Missed check-ins',
  no_shows: 'No-shows',
  invite: 'Invites',
};

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utc(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function keyOf(time: number) {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// The person's own day for a moment in time.
function localDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysFrom(from: string, to: string) {
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// How long ago, in a few words: "20 min", "3 h", "2 days".
export function waitedFor(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return plural(Math.floor(hours / 24), 'day');
}

// The newest weekly check-in that has closed: the week before last until Thursday, last week from
// Friday (when the check-in opens) to Sunday. The same rule as the client's check-in.
export function closedCheckInWeek(today: string): string {
  const weekday = ((new Date(utc(today)).getUTCDay() + 6) % 7) + 1;
  const monday = utc(today) - (weekday - 1) * DAY_MS;
  return keyOf(monday - (weekday >= 5 ? 7 : 14) * DAY_MS);
}

function clientHref(id: string, params?: Record<string, string>): Href {
  return { pathname: '/clients/[id]', params: { id, ...params } };
}

// Every reason a client needs the trainer, in the order of NEED_KINDS.
export function needsOf(row: ClientOverview, today: string, now: number): Need[] {
  if (row.status !== 'active') return [];
  if (row.app_status === 'declined' || row.app_status === 'left' || row.app_status === 'gone') return [];
  const needs: Need[] = [];
  const id = row.client_id;

  if (row.unanswered_check_ins > 0) {
    const since = row.unanswered_since ? Date.parse(row.unanswered_since) : now;
    needs.push({
      kind: 'check_in',
      client: row,
      subtitle:
        row.unanswered_check_ins > 1
          ? `${row.unanswered_check_ins} check-ins waiting`
          : `Check-in waiting · ${row.unanswered_since ? waitedFor(row.unanswered_since, now) : 'new'}`,
      since,
      href: clientHref(id, {
        tab: 'progress',
        ...(row.unanswered_check_in_id ? { checkIn: row.unanswered_check_in_id } : {}),
      }),
      trailing: null,
    });
  }

  if (row.linked && row.plan_planned_week > 0) {
    const last =
      [row.last_workout_on, row.last_tick_on]
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null;
    if (last) {
      const days = daysFrom(last, today);
      if (days >= 7) {
        needs.push({
          kind: 'quiet',
          client: row,
          subtitle: `No workout logged in ${days} days`,
          since: utc(last),
          href: clientHref(id, { tab: 'plan' }),
          trailing: 'message',
        });
      }
    } else if (row.joined_at && daysFrom(localDay(row.joined_at), today) >= 7) {
      needs.push({
        kind: 'quiet',
        client: row,
        subtitle: 'No workout logged since joining',
        since: Date.parse(row.joined_at),
        href: clientHref(id, { tab: 'plan' }),
        trailing: 'message',
      });
    }
  }

  if (row.linked && row.last_check_in_week) {
    const closed = closedCheckInWeek(today);
    const opened = keyOf(utc(closed) + 4 * DAY_MS);
    if (row.last_check_in_week < closed && row.joined_at && localDay(row.joined_at) < opened) {
      const date = new Date(utc(closed));
      needs.push({
        kind: 'missed_check_in',
        client: row,
        subtitle: `No check-in for the week of ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
        since: utc(row.last_check_in_week),
        href: clientHref(id, { tab: 'progress' }),
        trailing: 'message',
      });
    }
  }

  if (row.no_shows_30d >= 2) {
    needs.push({
      kind: 'no_shows',
      client: row,
      subtitle: `${row.no_shows_30d} no-shows in the last 30 days`,
      // More no-shows first.
      since: now - row.no_shows_30d * DAY_MS,
      href: { pathname: '/clients/[id]/sessions', params: { id, show: 'no_show' } },
      trailing: null,
    });
  }

  if (!row.linked && (row.app_status === 'not_on_app' || row.app_status === 'invited')) {
    const ask = row.invite_shared_at ?? (row.email ? row.invited_at : null);
    if (!ask) {
      if (!row.email && daysFrom(localDay(row.created_at), today) <= 30) {
        needs.push({
          kind: 'invite',
          client: row,
          subtitle: 'Not invited yet',
          since: Date.parse(row.created_at),
          href: clientHref(id),
          trailing: 'whatsapp',
        });
      }
    } else {
      const days = daysFrom(localDay(ask), today);
      if (days >= 3 && days <= 30) {
        needs.push({
          kind: 'invite',
          client: row,
          subtitle: `Invite sent ${days} days ago`,
          since: Date.parse(ask),
          href: clientHref(id),
          trailing: 'whatsapp',
        });
      }
    }
  }
  return needs;
}

function byReason(a: Need, b: Need) {
  return NEED_KINDS.indexOf(a.kind) - NEED_KINDS.indexOf(b.kind) || a.since - b.since;
}

// Home: one row per client with their most important reason, at most `limit`; `more` when other
// clients need something too.
export function needsYou(
  rows: ClientOverview[],
  today: string,
  now: number,
  limit = 5,
): { rows: Need[]; more: boolean; total: number } {
  const first = rows
    .map((row) => needsOf(row, today, now)[0])
    .filter((n): n is Need => !!n)
    .sort(byReason);
  return { rows: first.slice(0, limit), more: first.length > limit, total: first.length };
}

// The Needs you page: every reason of every client, grouped by reason.
export function needsYouAll(rows: ClientOverview[], today: string, now: number): Record<NeedKind, Need[]> {
  const all = Object.fromEntries(NEED_KINDS.map((k) => [k, [] as Need[]])) as Record<NeedKind, Need[]>;
  for (const row of rows) for (const need of needsOf(row, today, now)) all[need.kind].push(need);
  for (const kind of NEED_KINDS) all[kind].sort(byReason);
  return all;
}
