// Money in Voltrix Coach: whole cents everywhere, shown as "R400", "R1 250" or "R1 250.50" (a
// space that never breaks between thousands, cents only when they aren't whole). Clients never
// see prices. Pure: no runtime imports, so the unit checks can load it as it is.

export type Currency = { code: string; name: string; symbol: string };

// South African rand first, then the currencies trainers near and far use most.
export const CURRENCIES: Currency[] = [
  { code: 'ZAR', name: 'South African rand', symbol: 'R' },
  { code: 'NAD', name: 'Namibian dollar', symbol: 'N$' },
  { code: 'BWP', name: 'Botswana pula', symbol: 'P' },
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$' },
  { code: 'KES', name: 'Kenyan shilling', symbol: 'KSh ' },
  { code: 'NGN', name: 'Nigerian naira', symbol: '₦' },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED ' },
];

// The words for an amount read aloud: "1 250 rand", "80 dollars".
const SPOKEN: Record<string, [string, string]> = {
  ZAR: ['rand', 'rand'],
  NAD: ['Namibian dollar', 'Namibian dollars'],
  BWP: ['pula', 'pula'],
  USD: ['dollar', 'dollars'],
  GBP: ['pound', 'pounds'],
  EUR: ['euro', 'euros'],
  AUD: ['Australian dollar', 'Australian dollars'],
  NZD: ['New Zealand dollar', 'New Zealand dollars'],
  CAD: ['Canadian dollar', 'Canadian dollars'],
  KES: ['shilling', 'shillings'],
  NGN: ['naira', 'naira'],
  AED: ['dirham', 'dirhams'],
};

const NBSP = ' ';
export const MAX_PRICE_CENTS = 10_000_000;

export function currencyOf(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? { code, name: code, symbol: `${code} ` };
}

export function currencySymbol(code: string): string {
  return currencyOf(code).symbol.trim();
}

function thousands(whole: number) {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

// The amount without a symbol: "1 250", "1 250.50".
function amount(cents: number) {
  const value = Math.round(Math.abs(cents));
  const whole = Math.floor(value / 100);
  const rest = value % 100;
  return `${cents < 0 ? '−' : ''}${thousands(whole)}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

// "R400", "R1 250", "R1 250.50", "$80"; an unknown code goes first: "XYZ 5".
export function formatMoney(cents: number, currency: string): string {
  const symbol = currencyOf(currency).symbol.replace(/ $/, NBSP);
  return `${symbol}${amount(cents)}`;
}

// What a screen reader says: "1 250 rand", "80 dollars", else "5 XYZ".
export function spokenMoney(cents: number, currency: string): string {
  const words = SPOKEN[currency];
  const n = amount(cents).replace(new RegExp(NBSP, 'g'), ' ');
  if (!words) return `${n} ${currency}`;
  return `${n} ${Math.round(cents) === 100 ? words[0] : words[1]}`;
}

// A typed price: "400", "400.5", "400,50", "1 250", "R1 250", "1,250.00". Empty is no price (null).
// `currency` names the symbol in the "too much" message.
export function parseMoney(text: string, currency = 'ZAR'): { cents: number | null; error: string | null } {
  let s = text.trim().replace(/[\s ]/g, '');
  if (!s) return { cents: null, error: null };
  const symbol = currencySymbol(currency);
  // A leading symbol or code ("R", "$", "ZAR", "KSh").
  for (const lead of [currency, symbol, ...CURRENCIES.map((c) => c.symbol.trim())]) {
    if (lead && s.toUpperCase().startsWith(lead.toUpperCase())) {
      s = s.slice(lead.length);
      break;
    }
  }
  const tooMuch = { cents: null, error: `Enter up to ${formatMoney(MAX_PRICE_CENTS, currency)}.` };
  const unclear = { cents: null, error: 'Enter a price like 400 or 450.50.' };
  if (!/^[0-9.,]+$/.test(s)) return unclear;
  const marks = s.replace(/[0-9]/g, '');
  let normal = s;
  if (marks.includes('.') && marks.includes(',')) {
    // Both: the last one is the decimal mark, the other separates thousands.
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const other = decimal === '.' ? ',' : '.';
    normal = s.split(other).join('');
    if (decimal === ',') normal = normal.replace(',', '.');
  } else if (marks.length) {
    const mark = marks[0];
    if (marks.length > 1) {
      // "1,250,000": thousands only when every group after the first has three digits.
      const parts = s.split(mark);
      if (parts.slice(1).every((p) => p.length === 3)) normal = parts.join('');
      else return unclear;
    } else {
      const [whole, part] = s.split(mark);
      // "1,250" is a thousand and more; "400,50" and "400.5" are cents.
      if (mark === ',' && part.length === 3 && whole.length > 0) normal = whole + part;
      else normal = `${whole}.${part}`;
    }
  }
  const match = /^(\d*)(?:\.(\d*))?$/.exec(normal);
  if (!match || (!match[1] && !match[2])) return unclear;
  if ((match[2] ?? '').length > 2) return unclear;
  const value = Number(`${match[1] || '0'}.${match[2] || '0'}`);
  if (!Number.isFinite(value)) return unclear;
  const cents = Math.round(value * 100);
  if (cents > MAX_PRICE_CENTS) return tooMuch;
  return { cents, error: null };
}

// What goes back into a price field: "400", "1250.50". Never with a space.
export function moneyInput(cents: number | null): string {
  if (cents == null) return '';
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest ? `${whole}.${String(rest).padStart(2, '0')}` : String(whole);
}

// The price a new booking gets: the client's own, else the usual one.
export function priceFor(
  clientCents: number | null,
  usualCents: number | null,
): { cents: number | null; own: boolean } {
  if (clientCents != null) return { cents: clientCents, own: true };
  return { cents: usualCents, own: false };
}

// "R400", or "Free" for 0, in rows; totals show R0 through formatMoney.
export function priceLabel(cents: number | null, currency: string): string | null {
  if (cents == null) return null;
  return cents === 0 ? 'Free' : formatMoney(cents, currency);
}
