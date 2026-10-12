import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// The publishable key is safe to ship in the app: every table is protected by
// row level security, so it only grants what a signed-in user is allowed.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Links in sign-up and password emails are read by lib/auth-links.ts on the
    // web too (see takeHeldLink), so a link never changes who is signed in here
    // without asking.
    detectSessionInUrl: false,
  },
});

// A second client that keeps nothing: it checks which account a sign-in link is for without
// changing who is signed in (lib/auth-links.ts).
let checker: SupabaseClient | null = null;
export function linkChecker(): SupabaseClient {
  checker ??= createClient(supabaseUrl, supabaseKey, {
    auth: {
      storageKey: 'voltrix-link-check',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return checker;
}

// Only refresh the session while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
