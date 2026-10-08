import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { replaceReminders } from '@/lib/notify';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  role: 'trainer' | 'client';
  full_name: string | null;
  avatar_url?: string | null;
  // Theme, units and reminder time saved with the account.
  preferences?: Record<string, unknown> | null;
};

type AuthState = {
  // True until the stored session and the client's profile have been loaded.
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  // True after the client opens a reset-password link, until they set a new password.
  recovering: boolean;
  finishRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  // True until the client passes the Face ID or fingerprint lock (when it is turned on).
  locked: boolean;
  setLocked: (locked: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, avatar_url, preferences')
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
    if (!next) {
      loadedUserId.current = null;
      setProfile(null);
      return;
    }
    try {
      const loaded = await fetchProfile(next.user.id);
      loadedUserId.current = loaded?.id ?? null;
      setProfile(loaded);
    } catch {
      // On a bad connection keep what we already know about this person.
      setProfile((current) => (current?.id === next.user.id ? current : null));
    }
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
      }
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  // If the profile couldn't load (no signal when the app opened), try again when the app comes back.
  useEffect(() => {
    if (!session || profile) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadProfile(session);
    });
    return () => sub.remove();
  }, [session, profile, loadProfile]);

  const finishRecovery = useCallback(() => setRecovering(false), []);

  const signOut = useCallback(async () => {
    // Stop this device reminding the client about sessions once they sign out.
    await replaceReminders([]).catch(() => {});
    // Only this app signs out: the same login may also be open in Voltrix Coach.
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
