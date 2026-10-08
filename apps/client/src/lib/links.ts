import { Platform } from 'react-native';

// Where links in sign-up and password emails should send the trainer. On the
// web that's the app itself; elsewhere Supabase falls back to its Site URL.
export function emailRedirect(): string | undefined {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
}
