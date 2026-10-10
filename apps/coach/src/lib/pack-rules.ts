// Which pack a session uses, worked out the way the database does, for hints on screen before saving
// (the booking form's pack line, "Use Cara's pack", "Put on Cara's pack"). The database decides when
// it saves. Pure: no runtime imports, so the unit checks can load it as it is.

type PackLike = { sold_on: string; expires_on: string | null; sessions_left: number };

// Ending first, packs with no end last; then the oldest sale.
function byEndThenSale(a: PackLike, b: PackLike) {
  if (a.expires_on !== b.expires_on) {
    if (a.expires_on == null) return 1;
    if (b.expires_on == null) return -1;
    return a.expires_on < b.expires_on ? -1 : 1;
  }
  return a.sold_on < b.sold_on ? -1 : a.sold_on > b.sold_on ? 1 : 0;
}

// The pack the database's pick_pack would choose for a session on `day` ('YYYY-MM-DD'): sold on or
// before it, not ended by it, with room; the one ending first (no end last), then the oldest sale.
export function packFor<P extends PackLike>(packs: P[], day: string): P | null {
  const fits = packs.filter(
    (p) => p.sold_on <= day && (p.expires_on == null || p.expires_on >= day) && p.sessions_left > 0,
  );
  return fits.sort(byEndThenSale)[0] ?? null;
}

// For "Put on {first}'s pack" on a done session: room, and not ended before the session's day. The
// sale day isn't required (the trainer is choosing: she paid for a pack after the fact).
export function packToPutOn<P extends PackLike>(packs: P[], day: string): P | null {
  const fits = packs.filter((p) => (p.expires_on == null || p.expires_on >= day) && p.sessions_left > 0);
  return fits.sort(byEndThenSale)[0] ?? null;
}

// The share of the pack's price each session carries: Math.round, as the database's round().
export function perSession(priceCents: number, sessions: number): number {
  return sessions > 0 ? Math.round(priceCents / sessions) : 0;
}

// A pack's end `months` months after `from` ('YYYY-MM-DD'): the same day that many months later, less
// a day (1 month from 15 Oct ends 14 Nov; from 31 Jan, 27 or 28 Feb).
export function packEnd(from: string, months: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)) - 86_400_000);
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
}
