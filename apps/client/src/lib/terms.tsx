import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { TERMS_VERSION } from '@/components/legal/legal-content';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// The Terms everyone accepts before they use the app (the same file in Voltrix and Voltrix Coach).
//
// - On this device: the acceptance is kept in AsyncStorage (`voltrix.terms`) as soon as the boxes are
//   ticked, signed in or not, so the gate never asks twice on the same device for the same version.
// - Signed out: it goes with the sign-up (options.data.terms) and the database records it as the
//   account is made. The first account that signs in after it takes it as theirs ("claims" it); a
//   different account on the same device later accepts for themselves.
// - Signed in: accept_terms() records it. Offline, or on a database without the Terms yet (no
//   accept_terms, no terms columns: an older database), the record waits on the device
//   (`voltrix.termsPending`) and is sent when the app opens, comes back to the front, or the person
//   signs in. Nobody is kept out while it waits: they did accept.

export type AppId = 'coach' | 'client';
export const APP_NAMES: Record<AppId, string> = { coach: 'Voltrix Coach', client: 'Voltrix' };

export type CheckId = 'age' | 'terms' | 'health';
export type TermsChecks = Record<CheckId, boolean>;
type DevicePlatform = 'ios' | 'android' | 'web' | 'other';

type Acceptance = { version: string; acceptedAt: string; app: AppId; platform: DevicePlatform; checks: TermsChecks };
// What this device remembers. claimedBy: the account that took it as theirs (null until one signs in).
type DeviceRecord = Acceptance & { claimedBy: string | null };
// A record waiting to be sent for an account.
type Pending = Acceptance & { userId: string };

// What the database is sent: the same object at sign-up and in accept_terms(p_terms).
export type TermsPayload = {
  version: string;
  app: AppId;
  checks: TermsChecks;
  platform: DevicePlatform;
  accepted_at: string;
};

// The acceptance the person can see in Settings. recorded: the database has it.
export type AcceptedInfo = { version: string; at: Date; recorded: boolean };

const DEVICE_KEY = 'voltrix.terms';
const PENDING_KEY = 'voltrix.termsPending';
const ALL_TICKED: TermsChecks = { age: true, terms: true, health: true };

const platformName = (): DevicePlatform =>
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other';

function payloadOf(a: Acceptance): TermsPayload {
  return { version: a.version, app: a.app, checks: a.checks, platform: a.platform, accepted_at: a.acceptedAt };
}

function allTicked(checks: Partial<TermsChecks> | undefined): checks is TermsChecks {
  return !!checks && checks.age === true && checks.terms === true && checks.health === true;
}

function isAcceptance(x: unknown): x is Acceptance {
  const a = x as Partial<Acceptance> | null;
  return (
    !!a &&
    typeof a.version === 'string' &&
    typeof a.acceptedAt === 'string' &&
    !Number.isNaN(Date.parse(a.acceptedAt)) &&
    (a.app === 'coach' || a.app === 'client') &&
    (a.platform === 'ios' || a.platform === 'android' || a.platform === 'web' || a.platform === 'other') &&
    allTicked(a.checks)
  );
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  return AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// Sends one waiting record. 'done': recorded (with the account's newest version); 'later': try again
// another time (offline, an older database, a login that ran out, anything else).
async function send(record: Pending): Promise<{ kind: 'done'; version: string; at: string } | { kind: 'later' }> {
  try {
    const { data, error } = await supabase.rpc('accept_terms', { p_terms: payloadOf(record) });
    if (error) return { kind: 'later' };
    const answer = (data ?? {}) as { version?: string | null; accepted_at?: string | null };
    return {
      kind: 'done',
      version: answer.version ?? record.version,
      at: answer.accepted_at ?? new Date().toISOString(),
    };
  } catch {
    return { kind: 'later' };
  }
}

type TermsState = {
  app: AppId;
  appName: string;
  // False until this device's record has been read.
  ready: boolean;
  // Show the acceptance screen now, before anything else.
  gated: boolean;
  signedIn: boolean;
  // What the person accepted last, for Settings and the sign-up screen.
  accepted: AcceptedInfo | null;
  // The sign-up screen asks for the Terms again when this device's acceptance already belongs to an
  // account (someone else may be signing up).
  needsFreshForSignUp: boolean;
  // The acceptance screen's button. Never fails: the record waits on the device when it can't be sent.
  accept: (checks: TermsChecks) => Promise<void>;
  // For supabase.auth.signUp's options.data.terms (null when this device hasn't accepted this version).
  signUpPayload: () => TermsPayload | null;
  // After a sign-up the database accepted: the acceptance belongs to that account now (and is sent again
  // at its first sign-in, in case the database didn't record it with the sign-up).
  claimForSignUp: (userId: string) => void;
};

const TermsContext = createContext<TermsState | null>(null);

export function TermsProvider({ app, children }: PropsWithChildren<{ app: AppId }>) {
  const { session, profile } = useAuth();
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [ready, setReady] = useState(false);
  // What accept_terms answered, per account, so the screen doesn't wait for the profile to reload.
  const [recorded, setRecorded] = useState<{ userId: string; version: string; at: string } | null>(null);
  const pendingRef = useRef<Pending[]>([]);
  const sending = useRef(false);

  const userId = session?.user.id ?? null;
  // undefined: the database didn't say (an older database, or the profile couldn't load).
  const accountVersion =
    recorded && recorded.userId === userId
      ? recorded.version
      : profile && profile.id === userId
        ? profile.terms_version
        : undefined;

  useEffect(() => {
    let live = true;
    Promise.all([readJson(DEVICE_KEY), readJson(PENDING_KEY)]).then(([d, p]) => {
      if (!live) return;
      if (isAcceptance(d)) {
        const claimedBy = (d as Partial<DeviceRecord>).claimedBy;
        setDevice({ ...d, claimedBy: typeof claimedBy === 'string' ? claimedBy : null });
      }
      const list = Array.isArray(p)
        ? (p as Pending[]).filter((x) => isAcceptance(x) && typeof x.userId === 'string')
        : [];
      pendingRef.current = list;
      setPending(list);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const savePending = useCallback((next: Pending[]) => {
    // A year's worth at most, newest last.
    const cutoff = Date.now() - 366 * 86_400_000;
    const kept = next.filter((x) => Date.parse(x.acceptedAt) > cutoff).slice(-10);
    pendingRef.current = kept;
    setPending(kept);
    writeJson(PENDING_KEY, kept);
  }, []);

  const saveDevice = useCallback((next: DeviceRecord) => {
    setDevice(next);
    writeJson(DEVICE_KEY, next);
  }, []);

  // Sends what waits for the signed-in account, one at a time.
  const flush = useCallback(async () => {
    const me = (await supabase.auth.getSession()).data.session?.user.id;
    if (!me || sending.current) return;
    sending.current = true;
    try {
      for (const record of pendingRef.current.filter((x) => x.userId === me)) {
        const answer = await send(record);
        if (answer.kind === 'later') break;
        savePending(pendingRef.current.filter((x) => x !== record));
        setRecorded({ userId: me, version: answer.version, at: answer.at });
      }
    } finally {
      sending.current = false;
    }
  }, [savePending]);

  // Signing in: the account takes this device's acceptance as theirs (as it is saved on the device),
  // and it is recorded for them when the database doesn't have it yet.
  useEffect(() => {
    if (!ready || !userId) return;
    let live = true;
    (async () => {
      const saved = await readJson(DEVICE_KEY);
      if (!live) return;
      if (isAcceptance(saved) && saved.version === TERMS_VERSION && !(saved as Partial<DeviceRecord>).claimedBy) {
        const { version, acceptedAt, app: from, platform, checks } = saved;
        saveDevice({ version, acceptedAt, app: from, platform, checks, claimedBy: userId });
        const known = pendingRef.current.some((x) => x.userId === userId && x.version === version);
        if (accountVersion !== TERMS_VERSION && !known) {
          savePending([...pendingRef.current, { version, acceptedAt, app: from, platform, checks, userId }]);
        }
      }
      await flush();
    })();
    return () => {
      live = false;
    };
  }, [ready, userId, accountVersion, saveDevice, savePending, flush]);

  // Try again each time the app comes back to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  const signedIn = !!session;
  const gated = useMemo(() => {
    if (!ready) return false;
    if (!userId) return device?.version !== TERMS_VERSION;
    if (accountVersion === TERMS_VERSION) return false;
    if (pending.some((x) => x.userId === userId && x.version === TERMS_VERSION)) return false;
    if (device?.version === TERMS_VERSION && (device.claimedBy === null || device.claimedBy === userId)) return false;
    return true;
  }, [ready, userId, accountVersion, pending, device]);

  const accept = useCallback(
    async (checks: TermsChecks) => {
      if (!allTicked(checks)) return;
      const acceptance: Acceptance = {
        version: TERMS_VERSION,
        acceptedAt: new Date().toISOString(),
        app,
        platform: platformName(),
        checks: { ...ALL_TICKED },
      };
      if (!userId) {
        saveDevice({ ...acceptance, claimedBy: null });
        return;
      }
      saveDevice({ ...acceptance, claimedBy: userId });
      savePending([
        ...pendingRef.current.filter((x) => !(x.userId === userId && x.version === TERMS_VERSION)),
        { ...acceptance, userId },
      ]);
      await flush();
    },
    [app, userId, saveDevice, savePending, flush],
  );

  const signUpPayload = useCallback(
    () => (device && device.version === TERMS_VERSION ? payloadOf(device) : null),
    [device],
  );

  const claimForSignUp = useCallback(
    (id: string) => {
      if (!device || device.version !== TERMS_VERSION) return;
      saveDevice({ ...device, claimedBy: id });
      // Sent again when the new account first signs in: a database without the Terms yet didn't record it
      // with the sign-up (accepting the same version again adds nothing).
      const { version, acceptedAt, app: from, platform, checks } = device;
      savePending([
        ...pendingRef.current.filter((x) => !(x.userId === id && x.version === version)),
        { version, acceptedAt, app: from, platform, checks, userId: id },
      ]);
    },
    [device, saveDevice, savePending],
  );

  const accountAcceptedAt = profile && profile.id === userId ? (profile.terms_accepted_at ?? null) : null;
  const accepted = useMemo((): AcceptedInfo | null => {
    if (userId) {
      if (recorded && recorded.userId === userId)
        return { version: recorded.version, at: new Date(recorded.at), recorded: true };
      const waiting = pending.filter((x) => x.userId === userId).at(-1);
      if (accountVersion && accountAcceptedAt && (!waiting || accountVersion >= waiting.version)) {
        return { version: accountVersion, at: new Date(accountAcceptedAt), recorded: true };
      }
      if (waiting) return { version: waiting.version, at: new Date(waiting.acceptedAt), recorded: false };
      if (device && device.claimedBy === userId)
        return { version: device.version, at: new Date(device.acceptedAt), recorded: false };
      return null;
    }
    return device ? { version: device.version, at: new Date(device.acceptedAt), recorded: false } : null;
  }, [userId, recorded, pending, accountVersion, accountAcceptedAt, device]);

  const value = useMemo(
    (): TermsState => ({
      app,
      appName: APP_NAMES[app],
      ready,
      gated,
      signedIn,
      accepted,
      needsFreshForSignUp: !userId && !!device && device.version === TERMS_VERSION && device.claimedBy !== null,
      accept,
      signUpPayload,
      claimForSignUp,
    }),
    [app, ready, gated, userId, signedIn, accepted, device, accept, signUpPayload, claimForSignUp],
  );

  return <TermsContext value={value}>{children}</TermsContext>;
}

export function useTerms() {
  const value = use(TermsContext);
  if (!value) throw new Error('useTerms must be used inside TermsProvider');
  return value;
}

// "{app}" in the legal text shows as this app's name.
export function fillApp(text: string, appName: string) {
  return text.split('{app}').join(appName);
}
