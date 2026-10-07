import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  role: 'trainer' | 'client';
  full_name: string | null;
  business_name: string | null;
  trial_ends_at: string | null;
  subscription_status: 'none' | 'active' | 'past_due' | 'cancelled' | 'expired';
  subscription_expires_at: string | null;
};

type AuthState = {
  // True until the stored session and the trainer's profile have been loaded.
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, business_name, trial_ends_at, subscription_status, subscription_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (next: Session | null) => {
    const loaded = next ? await fetchProfile(next.user.id).catch(() => null) : null;
    loadedUserId.current = loaded?.id ?? null;
    setProfile(loaded);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      // SIGNED_IN also fires when a web tab regains focus; only reload for a new user.
      if (event === 'SIGNED_IN' && next && next.user.id !== loadedUserId.current) {
        setLoading(true);
        // Supabase advises against awaiting other calls inside this callback.
        setTimeout(async () => {
          await loadProfile(next);
          setLoading(false);
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        loadedUserId.current = null;
        setProfile(null);
      }
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext value={{ loading, session, profile, refreshProfile, signOut }}>{children}</AuthContext>
  );
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
