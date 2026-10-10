// WhatsApp invites: turning a typed phone number into the digits wa.me wants, and the message a
// trainer sends a client so they get the app and connect. Pure: no runtime imports, so the unit
// checks can load it as it is.

import type { AppStatus } from '@/lib/clients';

// The Voltrix app for Android, always the newest build, and roughly how big it is (78.6 MB in October 2026), so a
// client on prepaid data can wait for Wi-Fi.
export const ANDROID_APK = 'https://github.com/RvaJelly/valtrix/releases/latest/download/voltrix.apk';
export const ANDROID_APK_SIZE = 'about 80 MB';
// Set when an iPhone build exists; the message then links it.
export const IPHONE_LINK: string | null = null;

// Countries and their calling codes, South Africa first.
export const CALLING_CODES: { country: string; name: string; code: string }[] = [
  { country: 'ZA', name: 'South Africa', code: '27' },
  { country: 'NA', name: 'Namibia', code: '264' },
  { country: 'BW', name: 'Botswana', code: '267' },
  { country: 'ZW', name: 'Zimbabwe', code: '263' },
  { country: 'LS', name: 'Lesotho', code: '266' },
  { country: 'SZ', name: 'Eswatini', code: '268' },
  { country: 'MZ', name: 'Mozambique', code: '258' },
  { country: 'ZM', name: 'Zambia', code: '260' },
  { country: 'KE', name: 'Kenya', code: '254' },
  { country: 'NG', name: 'Nigeria', code: '234' },
  { country: 'GB', name: 'United Kingdom', code: '44' },
  { country: 'IE', name: 'Ireland', code: '353' },
  { country: 'US', name: 'United States', code: '1' },
  { country: 'CA', name: 'Canada', code: '1' },
  { country: 'AU', name: 'Australia', code: '61' },
  { country: 'NZ', name: 'New Zealand', code: '64' },
  { country: 'AE', name: 'United Arab Emirates', code: '971' },
  { country: 'DE', name: 'Germany', code: '49' },
  { country: 'NL', name: 'Netherlands', code: '31' },
  { country: 'PT', name: 'Portugal', code: '351' },
];

export function countryOf(country: string) {
  return CALLING_CODES.find((c) => c.country === country) ?? CALLING_CODES[0];
}

// How many digits follow the calling code, where we know it for sure: South Africa 9 (82 555 0101), the US
// and Canada 10, Australia 9. Calling codes never start with another one, so the first match is the country.
const NATIONAL_DIGITS: { code: string; digits: number }[] = [
  { code: '27', digits: 9 },
  { code: '1', digits: 10 },
  { code: '61', digits: 9 },
];

// The digits for a wa.me link ("27825550101"), or null when the number can't be one: too short or too long
// for its country, or no country code at all. A number without its country code is taken to be from the
// trainer's country. With null the invite sheet asks for a number, or WhatsApp asks who to send it to.
export function waNumber(phone: string | null, country: string): string | null {
  if (!phone) return null;
  const kept = phone.trim().replace(/[^\d+]/g, '');
  const plus = kept.startsWith('+');
  let digits = kept.replace(/\+/g, '');
  if (!digits) return null;
  const code = countryOf(country).code;
  if (plus) {
    // Already international.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = code + digits.slice(1);
  } else if (digits.startsWith(code) && digits.length >= 11 && digits.length <= 15) {
    // Already has the country's code.
  } else if (digits.length <= 10) {
    digits = code + digits;
  }
  // No calling code starts with 0, and the number after it never does either.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  const known = NATIONAL_DIGITS.find((c) => digits.startsWith(c.code));
  if (known) {
    const national = digits.slice(known.code.length);
    if (national.length !== known.digits || national.startsWith('0')) return null;
  }
  return digits;
}

// Opens a chat with the number, or lets WhatsApp ask who to send it to.
export function waLink(number: string | null, text: string): string {
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

// A plain chat with no message.
export function waChat(number: string): string {
  return `https://wa.me/${number}`;
}

export type InviteMessage = {
  // The client's first name.
  first: string;
  // The trainer's first name, and their business when it isn't just their own name.
  trainerFirst: string;
  business: string | null;
  // The code as the database gives it (8 characters).
  code: string;
  // The email on the client, if any.
  email: string | null;
  status: AppStatus;
};

// "K7QM-2XJ9" (the same as formatCode in lib/invite-code, kept here so this file has no imports).
function shown(code: string) {
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean;
}

// The message for the client, in plain words with curly apostrophes, no emoji and no exclamation
// marks. Built from what is on screen when the trainer presses the button.
export function inviteMessage({ first, trainerFirst, business, code, email, status }: InviteMessage): string {
  const from = business && business.trim() && business.trim().toLowerCase() !== trainerFirst.trim().toLowerCase();
  const who = `Hi ${first}, it’s ${trainerFirst}${from ? ` from ${business!.trim()}` : ''}.`;
  const formatted = shown(code);
  if (status === 'invited' && email) {
    return [
      `${who} I’ve invited you to connect in Voltrix.`,
      `Open Voltrix and accept my invite on Home. If it isn’t there, tap “I have an invite code” and enter ${formatted}.`,
    ].join('\n\n');
  }
  const iphone = IPHONE_LINK
    ? `On an iPhone, get the app here: ${IPHONE_LINK}`
    : 'On an iPhone? The app isn’t on the App Store yet. I’ll let you know as soon as it is.';
  // An email with no Voltrix account yet can also take the invite by signing up with it.
  // Without an email on the client, the message says signing up takes one (a client known by phone may not expect it).
  const connect =
    email && status === 'not_on_app'
      ? `Sign up with ${email} and you’ll see my invite on Home. Or tap “I have an invite code” and enter ${formatted}. It works for 30 days.`
      : email
        ? `Once you’ve signed up and confirmed your email, tap “I have an invite code” on Home and enter ${formatted}. It works for 30 days.`
        : `Sign up with your email address and confirm it, then tap “I have an invite code” on Home and enter ${formatted}. It works for 30 days.`;
  return [
    `${who} I’ll be planning your training in Voltrix, the app I use with my clients.`,
    `On an Android phone, get the app here (${ANDROID_APK_SIZE}, best on Wi-Fi): ${ANDROID_APK}\nVoltrix isn’t on the Play Store yet, so your phone may ask you to allow the install. If it warns you about the app, tap More details, then Install anyway.`,
    iphone,
    connect,
  ].join('\n\n');
}
