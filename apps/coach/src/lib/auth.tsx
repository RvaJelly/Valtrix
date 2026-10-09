import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { replaceReminders } from '@/lib/notify';
import { onAccessRefused } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  role: 'trainer' | 'client';
  full_name: string | null;
  business_name: string | null;
  trial_ends_at: string | null;
  subscription_status: 'none' | 'active' | 'past_due' | 'cancelled' | 'expired';
  subscription_expires_at: string | null;
  is_admin: boolean;
  free_access: boolean;
  // The public profile clients see in the Voltrix app.
  avatar_url?: string | null;
  specialties?: string[];
  bio?: string | null;
  city?: string | null;
  years_experience?: number | null;
  // Rough location (about 1 km) so clients near the trainer can find them.
  latitude?: number | null;
  longitude?: number | null;
  // Theme, units and reminder time saved with the account.
  preferences?: Record<string, unknown> | null;
};

type AuthState = {
  // True until the stored session and the trainer's profile have been loaded.
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  // True after the trainer opens a reset-password link, until they set a new password.
  recovering: boolean;
  finishRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  // True until the trainer passes the Face ID or fingerprint lock (when it is turned on).
  locked: boolean;
  setLocked: (locked: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, role, full_name, business_name, trial_ends_at, subscription_status, subscription_expires_at, is_admin, free_access, preferences, avatar_url, specialties, bio, city, years_experience, latitude, longitude',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [locked, setLocked] = useState(true);
  const loadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (next: Session | null) => {
    const loaded = next ? await fetchProfile(next.user.id).catch(() => null) : null;
    loadedUserId.current = loaded?.id ?? null;
    setProfile(loaded);
  }, []);

  // Loads the signed-in trainer's profile again, so a trial or plan that ended, or free
  // access switched on or off, takes them to the Subscribe screen or back into the app.
  // Offline, the profile already loaded stays.
  const recheckProfile = useCallback(() => {
    const userId = loadedUserId.current;
    if (!userId) return;
    fetchProfile(userId).then(
      (fresh) => {
        // Not if they signed out meanwhile.
        if (fresh && loadedUserId.current === fresh.id) setProfile(fresh);
      },
      () => {},
    );
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      // SIGNED_IN also fires when a web tab regains focus; only reload for a new user.
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && next && next.user.id !== loadedUserId.current) {
        setLoading(true);
        // They just signed in with their password, so there is no need to lock.
        setLocked(false);
        // Supabase advises against awaiting other calls inside this callback.
        setTimeout(async () => {
          await loadProfile(next);
          setLoading(false);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        loadedUserId.current = null;
        setProfile(null);
        setRecovering(false);
      } else if (event === 'TOKEN_REFRESHED') {
        // The login is renewed about once an hour while the app is open.
        setTimeout(recheckProfile, 0);
      }
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, recheckProfile]);

  // Check again each time the app comes back to the front, and when the database turned
  // something new away for lack of a plan.
  useEffect(() => {
    let last = 0;
    const appState = AppState.addEventListener('change', (state) => {
      // iPhones can say 'active' twice in a row (after Face ID, for example).
      if (state !== 'active' || Date.now() - last < 2000) return;
      last = Date.now();
      recheckProfile();
    });
    const stopListening = onAccessRefused(recheckProfile);
    return () => {
      appState.remove();
      stopListening();
    };
  }, [recheckProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const finishRecovery = useCallback(() => setRecovering(false), []);

  const signOut = useCallback(async () => {
    // Stop this device reminding the trainer about sessions once they sign out.
    await replaceReminders([]).catch(() => {});
    // Only this app signs out: the same login may also be open in the Voltrix app.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return (
    <AuthContext
      value={{ loading, session, profile, recovering, finishRecovery, refreshProfile, signOut, locked, setLocked }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
