import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Where links in sign-up and password emails send the person. On the web that's the app itself. On a
// phone it's the app too, through its own address (voltrix:// or voltrixcoach://), so tapping the link
// in the email on the phone opens the app signed in. Supabase only sends people there once that address
// is listed under Authentication > URL Configuration > Redirect URLs; until then it uses its Site URL.
export function emailRedirect(): string | undefined {
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.location.origin : undefined;
  return Linking.createURL('');
}

// What a link from a sign-up or password email carries when it opens the app on a phone: the new session,
// or a token to check (when the email template links straight to the app), or why it didn't work (an
// expired link). Null for any other link. `type` is 'signup', 'recovery', 'magiclink', 'email_change'...
export type AuthLink =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'token'; tokenHash: string; type: string }
  | { kind: 'error'; code: string | null; description: string | null };

export function authLink(url: string): AuthLink | null {
  const params: Record<string, string> = {};
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  const parts = [hash >= 0 ? url.slice(hash + 1) : ''];
  if (query >= 0 && (hash < 0 || query < hash)) parts.push(url.slice(query + 1, hash >= 0 ? hash : undefined));
  for (const part of parts) {
    for (const pair of part.split('&')) {
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      try {
        params[decodeURIComponent(pair.slice(0, at))] = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, ' '));
      } catch {
        // A malformed part is skipped.
      }
    }
  }
  if (params.access_token && params.refresh_token) {
    return {
      kind: 'session',
      accessToken: params.access_token,
      refreshToken: params.refresh_token,
      type: params.type ?? null,
    };
  }
  if (params.token_hash && params.type) return { kind: 'token', tokenHash: params.token_hash, type: params.type };
  if (params.error || params.error_code) {
    return {
      kind: 'error',
      code: params.error_code ?? params.error ?? null,
      description: params.error_description ?? null,
    };
  }
  return null;
}
