// The words and choices of booking a time in Voltrix, worked out on the trainer's days and times as
// the database answers them ('YYYY-MM-DD', 'HH:MM'), never converted on the phone. Pure: no runtime
// imports, so the unit checks can load it as it is.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'Tue 13 Oct' for '2026-10-13' (worked out in UTC, so no phone's zone can shift it a day). Text that
// isn't a 'YYYY-MM-DD' day is taken as already written out.
function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export type DayPart = 'Morning' | 'Afternoon' | 'Evening';

// Times grouped as the day goes: before 12:00 Morning, before 17:00 Afternoon, then Evening. Empty
// groups are left out.
export function dayParts<T extends { local_time: string }>(times: T[]): { label: DayPart; times: T[] }[] {
  const groups: { label: DayPart; times: T[] }[] = [
    { label: 'Morning', times: [] },
    { label: 'Afternoon', times: [] },
    { label: 'Evening', times: [] },
  ];
  for (const t of times) {
    const hhmm = t.local_time.slice(0, 5);
    groups[hhmm < '12:00' ? 0 : hhmm < '17:00' ? 1 : 2].times.push(t);
  }
  return groups.filter((g) => g.times.length > 0);
}

// The button: "Book Tue 13 Oct · 07:00" when the trainer books instantly, "Ask Thandi for Tue 13 Oct ·
// 07:00" when they approve each time first.
export function bookLabel(mode: 'auto' | 'approve', day: string, time: string, first: string): string {
  const when = `${dayWords(day)} · ${time.slice(0, 5)}`;
  return mode === 'auto' ? `Book ${when}` : `Ask ${first} for ${when}`;
}

// How long before a session the person may still cancel in the app: 120 → "2 hours", 1440 → "1 day",
// 90 → "90 minutes". Null when they can't cancel in the app at all.
export function cancelLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes > 0 && minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
  if (minutes > 0 && minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

// Whether the person may still cancel this session in the app: booked, and before its cut-off.
export function canCancel(s: { status: string; cancel_until?: string | null }, now: number = Date.now()): boolean {
  if (s.status !== 'scheduled' || !s.cancel_until) return false;
  const until = Date.parse(s.cancel_until);
  return Number.isFinite(until) && until > now;
}

// The pack a session with this trainer on `day` would use, as the database picks it: sold on or before
// the day, not ended by it, with room; the one ending first (no end last), then the oldest sale. A hint
// only: the database decides when the time is booked.
export function packForDay<
  P extends { trainer_id: string; sold_on: string; expires_on: string | null; sessions_left: number },
>(packs: P[], trainerId: string, day: string): P | null {
  const fits = packs.filter(
    (p) =>
      p.trainer_id === trainerId &&
      p.sessions_left > 0 &&
      p.sold_on <= day &&
      (p.expires_on == null || p.expires_on >= day),
  );
  fits.sort((a, b) => {
    if (a.expires_on !== b.expires_on) {
      if (a.expires_on == null) return 1;
      if (b.expires_on == null) return -1;
      return a.expires_on < b.expires_on ? -1 : 1;
    }
    return a.sold_on < b.sold_on ? -1 : a.sold_on > b.sold_on ? 1 : 0;
  });
  return fits[0] ?? null;
}

// The words of a trainer's answer, shown once on Home (or Plan › Sessions). `when` is "{shortDate} at
// {time24}" from the caller.
export function answerLine(
  kind: 'booking_answered' | 'training_answered',
  payload: Record<string, unknown>,
  first: string,
  when: string,
): string {
  if (kind === 'booking_answered') {
    return payload.approved === true ? `${first} approved ${when}.` : `${first} can’t do ${when}. Pick another time.`;
  }
  return payload.accepted === true
    ? `${first} accepted your request. You’re connected.`
    : `${first} can’t take you on right now. You can ask another trainer.`;
}

// The first name a trainer goes by in a sentence: their own first name, else their business name.
export function firstOf(t: { trainer_name?: string | null; business_name?: string | null }, fallback = 'Your trainer') {
  return t.trainer_name?.trim().split(/\s+/)[0] || t.business_name?.trim() || fallback;
}
