// Plain words for what went wrong. Supabase (the database, sign-in and file storage) reports
// problems in developer language; plainError turns the ones people meet into one calm sentence
// and anything else technical into `fallback`. Messages written for people (by the app, or raised
// by the database for a refused change) pass through as they are.

export const TRY_AGAIN = 'Something went wrong. Check your connection and try again.';
const OFFLINE = 'Couldn’t reach Voltrix. Check your connection and try again.';
const SIGNED_OUT = 'You were signed out. Sign in again.';

const AUTH: [RegExp, string][] = [
  [/invalid login credentials|invalid_credentials/i, 'That email and password don’t match.'],
  [/email not confirmed|email_not_confirmed/i, 'Confirm your email first: open the link we sent you.'],
  [
    /user already registered|already been registered|email_exists|user_already_exists/i,
    'There’s already an account with that email. Sign in instead.',
  ],
  [/password should be at least (\d+)/i, 'Use a password of at least $1 characters.'],
  [/different from the old password|same_password/i, 'Choose a new password, not the one you have now.'],
  [/weak_password|password is known|pwned/i, 'Choose a stronger password, one that isn’t easy to guess.'],
  [
    /(invalid|unable to validate) email|email address .*invalid|email_address_invalid/i,
    'Check the email address and try again.',
  ],
  [/signups? not allowed|signup_disabled/i, 'New accounts can’t be made right now. Try again later.'],
  [
    /rate limit|too many requests|over_\w*_rate_limit|for security purposes/i,
    'Too many tries. Wait a minute and try again.',
  ],
  [/otp_expired|link is invalid or has expired|token has expired/i, 'That link has expired. Ask for a new one.'],
  [/jwt expired|invalid jwt|refresh token|session_not_found|session_expired|auth session missing/i, SIGNED_OUT],
];

const NETWORK = /failed to fetch|network request failed|networkerror|load failed|fetch failed|timed out|timeout/i;

// Database and API codes people can meet, in their words.
const CODES: Record<string, string> = {
  '23505': 'That’s already saved.',
  '23503': 'That’s still in use elsewhere, so it can’t be changed yet.',
  '23514': 'Some of that is too long or not allowed. Check it and try again.',
  '22001': 'Some of that is too long. Shorten it and try again.',
  '22P02': 'Check what you typed and try again.',
  '42501': 'Your account can’t do that.',
  '57014': 'That took too long. Try again.',
  PGRST116: 'That couldn’t be found. It may have been removed.',
  PGRST301: SIGNED_OUT,
  PGRST303: SIGNED_OUT,
};

// Developer language that must never reach the screen.
const TECHNICAL =
  /row-level security|permission denied|violates|constraint|relation "|column |syntax|schema cache|JSON|uuid|null value|PGRST|TypeError|undefined|unexpected token|statusCode/i;

type Problem = {
  message?: unknown;
  error_description?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  __isAuthError?: unknown;
  __isStorageError?: unknown;
};

export function plainError(error: unknown, fallback = TRY_AGAIN): string {
  if (!error) return fallback;
  const e = (typeof error === 'object' ? error : { message: String(error) }) as Problem;
  const message =
    typeof e.message === 'string' ? e.message : typeof e.error_description === 'string' ? e.error_description : '';
  const code = typeof e.code === 'string' ? e.code : '';
  for (const [pattern, words] of AUTH) {
    const match = pattern.exec(message) ?? pattern.exec(code);
    if (match) return words.replace('$1', match[1] ?? '');
  }
  if (NETWORK.test(message)) return OFFLINE;
  const fromSupabase = !!code || 'details' in e || 'hint' in e || !!e.__isAuthError || !!e.__isStorageError;
  if (fromSupabase) {
    // A refused change the database explains itself (raise exception), but not its row-level
    // security wording.
    if (['P0001', '22023', '42501'].includes(code) && message && !TECHNICAL.test(message)) return message;
    return CODES[code] ?? fallback;
  }
  // A message the app wrote itself.
  return message && !TECHNICAL.test(message) ? message : fallback;
}
