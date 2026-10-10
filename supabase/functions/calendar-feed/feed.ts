// Turns a private calendar link into an .ics file (RFC 5545) that Google Calendar, Apple Calendar
// and Outlook can subscribe to. The token in the link is the only secret: the database function
// calendar_feed() (service role only) answers null for a token that opens nothing, and never
// returns notes, prices, payments, phone numbers, emails or health answers.
//
// No Deno globals here, so the same file runs under Node for tests (index.ts is the Deno entry).

export type FeedEvent = {
  id: string;
  starts_at: string;
  minutes: number;
  summary: string;
  location: string | null;
  updated_at: string;
};
export type Feed = { name: string; time_zone: string; events: FeedEvent[] };
// rest: the PostgREST base URL (SUPABASE_URL + '/rest/v1'); key: the service role key.
export type Env = { rest: string; key: string };

// 64 hex characters (256 bits from two random UUIDs, 244 of them random).
const TOKEN = /^[0-9a-f]{64}$/;
// The same answer for a token that is malformed, unknown, reset or turned off.
const GONE =
  'This calendar link no longer works. Open Voltrix or Voltrix Coach, go to Settings, Calendar link, and add the new link.';
const LATER = 'Your calendar is not available right now. Your calendar app will try again later.';

// The token from the last part of the path: /calendar-feed/<token>.ics (".ics" optional, any case).
export function tokenFrom(url: URL): string | null {
  const last = (url.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.ics$/i, '').toLowerCase();
  return TOKEN.test(last) ? last : null;
}

function text(status: number, body: string, extra: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return `"${Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}"`;
}

export async function handle(req: Request, env: Env, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Use GET.', { Allow: 'GET, HEAD' });
  const token = tokenFrom(new URL(req.url));
  if (!token) return text(404, GONE);

  let feed: Feed | null;
  try {
    // A new-style secret key (sb_secret_...) goes in apikey only; the older service role JWT in both.
    const headers: Record<string, string> = { apikey: env.key, 'Content-Type': 'application/json' };
    if (!env.key.startsWith('sb_')) headers.Authorization = `Bearer ${env.key}`;
    const res = await fetchFn(`${env.rest}/rpc/calendar_feed`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) {
      // Only the status and the database's error code: never the token, the link or an error's
      // words, which could quote them. (Supabase's own request log still records the path.)
      let code = '';
      try {
        const answer = (await res.json()) as { code?: unknown } | null;
        code = typeof answer?.code === 'string' ? answer.code.slice(0, 10) : '';
      } catch {}
      console.error('calendar_feed failed', res.status, code);
      return text(503, LATER, { 'Retry-After': '600' });
    }
    feed = (await res.json()) as Feed | null;
  } catch (error) {
    console.error('calendar_feed failed', error instanceof Error ? error.name : 'error');
    return text(503, LATER, { 'Retry-After': '600' });
  }
  if (!feed) return text(404, GONE);

  const body = toIcs(feed);
  const etag = await etagOf(body);
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="${feed.name === 'Voltrix Coach' ? 'voltrix-coach' : 'voltrix'}.ics"`,
    // Calendar apps fetch every few hours at most; five minutes keeps repeat fetches cheap.
    'Cache-Control': 'private, max-age=300',
    ETag: etag,
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  const seen = (req.headers.get('if-none-match') ?? '').split(',').map((s) => s.trim().replace(/^W\//, ''));
  if (seen.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers });
}

// 2026-10-12T07:00:00+02:00 -> 20261012T050000Z
export function utc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a time: ${iso}`);
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

// TEXT values (RFC 5545 3.3.11): backslash, semicolon and comma escaped, line breaks as \n,
// other control characters dropped.
export function esc(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

// Lines longer than 75 octets are folded: CRLF and one space, never inside a UTF-8 character.
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (size + n > limit) {
      parts.push(cur);
      cur = '';
      size = 0;
      limit = 74; // the leading space counts
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

// Times in UTC ("Z"), so no time zone block is needed and every calendar shows them on the
// phone's own clock. DTSTAMP is the session's last change, so the file (and its ETag) only
// changes when a session does. Cancelled sessions aren't in the feed, so they disappear.
export function toIcs(feed: Feed): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Voltrix//Calendar link//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(feed.name)}`,
    `X-WR-TIMEZONE:${esc(feed.time_zone)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of feed.events) {
    const start = new Date(e.starts_at);
    const end = new Date(start.getTime() + e.minutes * 60_000).toISOString();
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@voltrix`,
      `DTSTAMP:${utc(e.updated_at)}`,
      `LAST-MODIFIED:${utc(e.updated_at)}`,
      `DTSTART:${utc(e.starts_at)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
