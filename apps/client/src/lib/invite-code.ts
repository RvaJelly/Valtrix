// Invite codes: 8 characters from Crockford's alphabet (no I, L, O or U), shown and typed as
// K7QM-2XJ9. The database ignores spaces, dashes and case, and reads O as 0 and I or L as 1, so
// this file does the same. No runtime imports, so it can be checked on its own.

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

// Two groups of four, split by a dash or a space, as a whole word: "K7QM-2XJ9" in a message.
const PAIR = /\b([0-9A-Za-z]{4})[- ]([0-9A-Za-z]{4})\b/g;

// Upper case, no spaces or dashes, O read as 0 and I or L as 1.
export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function isCode(text: string): boolean {
  return CODE.test(normalizeCode(text));
}

// What the field shows while someone types: the code as the database reads it (upper case, O as 0,
// I or L as 1, letters and numbers only), with a dash after the first four once a fifth is typed (so
// deleting back past it never sticks): at most 9 characters.
export function formatCode(text: string): string {
  const chars = normalizeCode(text)
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

// The code in pasted text, such as the whole WhatsApp message, without its dash; else the whole
// text when it is a code by itself; else null. The message shows the code in capitals with a dash,
// and two ordinary words can look like a code ("apps from"), so a capitals-and-dash match wins,
// then capitals, then a dash, then the first that reads as a code.
export function findCode(text: string): string | null {
  const found = [...text.matchAll(PAIR)]
    .map((m) => ({ code: normalizeCode(m[1] + m[2]), dash: m[0][4] === '-', upper: m[0] === m[0].toUpperCase() }))
    .filter((m) => CODE.test(m.code));
  const best =
    found.find((m) => m.dash && m.upper) ?? found.find((m) => m.upper) ?? found.find((m) => m.dash) ?? found[0] ?? null;
  if (best) return best.code;
  return isCode(text) ? normalizeCode(text) : null;
}
