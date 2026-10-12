import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { TERMS_VERSION } from '@/components/legal/legal-content';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// The Terms everyone accepts before they use the app (the same file in Voltrix and Voltrix Coach).
//
// - The current version comes from the server (current_terms_version(), kept on the phone for next
//   time). A database without that function, or no connection, means this build's own version, so
//   nobody is locked out. A build older than the server's version asks to be updated.
// - Signing up: the sign-up screen keeps the ticks in memory, for that sign-up only and for at most
//   15 minutes, and sends them with it (options.data.terms); the database records them as it makes
//   the account. Nothing is ever credited to another account, and nothing is kept for a sign-in.
// - Signed in: an account whose version is older than the current one sees the acceptance screen
//   with empty boxes. accept_terms() records the answer. Offline, it waits on the phone
//   (`voltrix.termsPending`) and is sent when the app opens, comes back to the front, or the person
//   signs in; the person carries on meanwhile, for 24 hours. After that the screen asks again until
//   the record is sent. A database without accept_terms (an older one) keeps the phone's record.

export type AppId = 'coach' | 'client';
export const APP_NAMES: Record<AppId, string> = { coach: 'Voltrix Coach', client: 'Voltrix' };

export type CheckId = 'age' | 'terms' | 'health';
export type TermsChecks = Record<CheckId, boolean>;
type DevicePlatform = 'ios' | 'android' | 'web' | 'other';

// What the database is sent: the same object at sign-up and in accept_terms(p_terms).
export type TermsPayload = {
  version: string;
  app: AppId;
  checks: TermsChecks;
  platform: DevicePlatform;
  accepted_at: string;
};

// A record waiting to be sent for one account. since: when the first unsent acceptance of this version
// was made (asking again doesn't restart the 24 hours). olderDb: the database has no accept_terms.
type Pending = {
  userId: string;
  version: string;
  acceptedAt: string;
  since: string;
  app: AppId;
  platform: DevicePlatform;
  checks: TermsChecks;
  olderDb?: boolean;
};

// The acceptance the person can see in Settings. recorded: the database has it.
export type AcceptedInfo = { version: string; at: Date; recorded: boolean };

// 'update': this build is older than the current version. 'accept': show the acceptance screen.
// 'in': carry on (signed in and accepted). 'out': signed out (Welcome, sign-in and sign-up).
export type TermsStatus = 'loading' | 'update' | 'accept' | 'in' | 'out';

// What the acceptance screen's button did. 'stuck': the record has waited more than 24 hours and still
// couldn't be sent, so the person stays on the screen.
export type AcceptResult = 'sent' | 'waiting' | 'stuck';

const PENDING_KEY = 'voltrix.termsPending';
const KNOWN_KEY = 'voltrix.termsKnown';
const CURRENT_KEY = 'voltrix.termsCurrent';
// The first Terms build kept a ticked box on the phone for whoever signed in next.
const OLD_DEVICE_KEY = 'voltrix.terms';
const ALL_TICKED: TermsChecks = { age: true, terms: true, health: true };
const DAY_MS = 86_400_000;
// How long a sign-up's ticks count for.
export const SIGN_UP_TICKS_MS = 15 * 60_000;
const VERSION = /^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$/;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const platformName = (): DevicePlatform =>
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other';

// '2026-10-11' as '11 October 2026' (a second version on the same day: '11 October 2026 (b)').
export function versionDate(version: string) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})([a-z]?)$/.exec(version);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return version;
  return `${Number(m[3])} ${month} ${m[1]}${m[4] ? ` (${m[4]})` : ''}`;
}

// A sign-up's acceptance, made when its boxes are ticked.
export function termsPayload(app: AppId, at: Date): TermsPayload {
  return {
    version: TERMS_VERSION,
    app,
    checks: { ...ALL_TICKED },
    platform: platformName(),
    accepted_at: at.toISOString(),
  };
}

function allTicked(checks: Partial<TermsChecks> | undefined): checks is TermsChecks {
  return !!checks && checks.age === true && checks.terms === true && checks.health === true;
}

function isPending(x: unknown): x is Pending {
  const a = x as Partial<Pending> | null;
  return (
    !!a &&
    typeof a.userId === 'string' &&
    typeof a.version === 'string' &&
    VERSION.test(a.version) &&
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

function payloadOf(p: Pending): TermsPayload {
  return { version: p.version, app: p.app, checks: p.checks, platform: p.platform, accepted_at: p.acceptedAt };
}

// Sends one waiting record. 'done': recorded (with the account's newest version); 'missing': the
// database has no accept_terms (an older one); 'later': offline, a login that ran out, anything else.
async function send(
  record: Pending,
): Promise<{ kind: 'done'; version: string; at: string } | { kind: 'missing' } | { kind: 'later' }> {
  try {
    const { data, error } = await supabase.rpc('accept_terms', { p_terms: payloadOf(record) });
    if (error) return error.code === 'PGRST202' ? { kind: 'missing' } : { kind: 'later' };
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

// The server's version: a version, 'none' (an older database without current_terms_version, or no
// version set), or null (no answer: offline).
async function fetchCurrent(): Promise<string | 'none' | null> {
  try {
    const { data, error } = await supabase.rpc('current_terms_version');
    if (error) return error.code === 'PGRST202' ? 'none' : null;
    return typeof data === 'string' && VERSION.test(data) ? data : 'none';
  } catch {
    return null;
  }
}

type Known = { userId: string; version: string | null };
type Stored = { known: Known | null; current: string | null };

type TermsState = {
  app: AppId;
  appName: string;
  // False until the phone's records (and, the first time, the server's version) have been read.
  ready: boolean;
  status: TermsStatus;
  // The version everyone must have accepted: the server's, or this build's when the server doesn't say.
  current: string;
  signedIn: boolean;
  // What the signed-in person accepted last, for Settings.
  accepted: AcceptedInfo | null;
  // The acceptance screen's button, for the signed-in account.
  accept: (checks: TermsChecks) => Promise<AcceptResult>;
  // After a sign-up the database accepted: what went with it waits for that account only, and is sent
  // again at its first sign-in, in case an older database didn't record it with the sign-up.
  rememberSignUp: (userId: string, payload: TermsPayload) => void;
  // Asks the server for its version again.
  checkVersion: () => Promise<void>;
};

const TermsContext = createContext<TermsState | null>(null);

export function TermsProvider({ app, children }: PropsWithChildren<{ app: AppId }>) {
  const { session, profile } = useAuth();
  const [stored, setStored] = useState<Stored | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [server, setServer] = useState<string | null>(null);
  // The first answer (or none within 3 seconds) from the server about its version.
  const [askedOnce, setAskedOnce] = useState(false);
  // What accept_terms answered, per account, so the screen doesn't wait for the profile to reload.
  const [recorded, setRecorded] = useState<{ userId: string; version: string; at: string } | null>(null);
  // The time the 24 hours are measured against, refreshed when a wait runs out or the app returns.
  const [now, setNow] = useState(() => Date.now());
  const pendingRef = useRef<Pending[]>([]);
  const sending = useRef(false);
  // Something was added while a send was running: that run sends it too before it stops.
  const again = useRef(false);
  // The server has answered, so the version kept on the phone is older news.
  const heard = useRef(false);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    let live = true;
    Promise.all([readJson(PENDING_KEY), readJson(KNOWN_KEY), readJson(CURRENT_KEY)]).then(([p, k, c]) => {
      if (!live) return;
      const list = Array.isArray(p)
        ? p.filter(isPending).map((x) => ({ ...x, since: typeof x.since === 'string' ? x.since : x.acceptedAt }))
        : [];
      const known = k as Partial<Known> | null;
      const cached = typeof c === 'string' && VERSION.test(c) ? c : null;
      pendingRef.current = list;
      setPending(list);
      if (!heard.current) setServer(cached);
      setStored({
        known:
          known && typeof known.userId === 'string' ? { userId: known.userId, version: known.version ?? null } : null,
        current: cached,
      });
    });
    AsyncStorage.removeItem(OLD_DEVICE_KEY).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // What the server said about its version. Offline (null), the version kept on the phone stands; with
  // no version on the server (an older database), this build's version is the current one.
  const applyCurrent = useCallback((answer: string | 'none' | null) => {
    if (answer === null) return;
    heard.current = true;
    setServer(answer === 'none' ? null : answer);
    if (answer === 'none') AsyncStorage.removeItem(CURRENT_KEY).catch(() => {});
    else writeJson(CURRENT_KEY, answer);
  }, []);

  const checkVersion = useCallback(() => fetchCurrent().then(applyCurrent), [applyCurrent]);

  // Ask at start, waiting at most 3 seconds when the phone has never had an answer.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => setAskedOnce(true), 3000);
    fetchCurrent().then((answer) => {
      if (!live) return;
      applyCurrent(answer);
      setAskedOnce(true);
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [applyCurrent]);

  const savePending = useCallback((next: Pending[]) => {
    // A year's worth at most, newest last.
    const cutoff = Date.now() - 366 * DAY_MS;
    const kept = next.filter((x) => Date.parse(x.acceptedAt) > cutoff).slice(-10);
    pendingRef.current = kept;
    setPending(kept);
    writeJson(PENDING_KEY, kept);
  }, []);

  // Sends what waits for the signed-in account, one at a time. True once nothing waits for them.
  const flush = useCallback(async () => {
    const me = (await supabase.auth.getSession()).data.session?.user.id;
    if (!me) return false;
    if (sending.current) {
      again.current = true;
      return false;
    }
    sending.current = true;
    try {
      for (;;) {
        again.current = false;
        for (const record of pendingRef.current.filter((x) => x.userId === me)) {
          const answer = await send(record);
          if (answer.kind === 'later') return false;
          if (answer.kind === 'missing') {
            // An older database: the phone's record stands, and is sent once the database has the Terms.
            if (!record.olderDb) {
              savePending(pendingRef.current.map((x) => (x === record ? { ...x, olderDb: true } : x)));
            }
            return false;
          }
          savePending(pendingRef.current.filter((x) => x !== record));
          setRecorded({ userId: me, version: answer.version, at: answer.at });
        }
        if (!again.current) return true;
      }
    } finally {
      sending.current = false;
    }
  }, [savePending]);

  // Signing in: send what waits for this account, and ask the server for its version again.
  useEffect(() => {
    if (!stored || !userId) return;
    flush();
    fetchCurrent().then(applyCurrent);
  }, [stored, userId, flush, applyCurrent]);

  // Try again, and measure the 24 hours again, each time the app comes back to the front.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNow(Date.now());
      flush();
      fetchCurrent().then(applyCurrent);
    });
    return () => sub.remove();
  }, [flush, applyCurrent]);

  // The account's version: what accept_terms just answered, else the profile, else (the profile
  // couldn't load, for example offline) what the phone last knew. undefined: nobody says.
  const profileLoaded = !!profile && profile.id === userId;
  const profileVersion = profileLoaded ? profile.terms_version : undefined;
  const knownVersion =
    !profileLoaded && stored?.known && stored.known.userId === userId ? stored.known.version : undefined;
  const accountVersion =
    recorded && recorded.userId === userId
      ? recorded.version
      : profileVersion !== undefined
        ? profileVersion
        : knownVersion;

  // Keep what the account has accepted on the phone, for a start without a connection.
  useEffect(() => {
    if (!userId || accountVersion === undefined) return;
    writeJson(KNOWN_KEY, { userId, version: accountVersion });
  }, [userId, accountVersion]);

  const current = server ?? TERMS_VERSION;
  const mine = useMemo(() => pending.filter((x) => x.userId === userId), [pending, userId]);

  // When a 24-hour wait runs out, look again.
  useEffect(() => {
    const ends = mine
      .filter((x) => !x.olderDb)
      .map((x) => Date.parse(x.since) + DAY_MS)
      .filter((t) => t > now);
    if (!ends.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.min(...ends) - now + 50, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [mine, now]);

  const ready = !!stored && (stored.current !== null || askedOnce);
  const signedIn = !!session;
  const status = useMemo((): TermsStatus => {
    if (!ready) return 'loading';
    if (TERMS_VERSION < current) return 'update';
    if (!userId) return 'out';
    if (accountVersion && accountVersion >= current) return 'in';
    const waiting = mine.some((x) => x.version >= current && (x.olderDb || now - Date.parse(x.since) < DAY_MS));
    return waiting ? 'in' : 'accept';
  }, [ready, current, userId, accountVersion, mine, now]);

  const accept = useCallback(
    async (checks: TermsChecks): Promise<AcceptResult> => {
      if (!allTicked(checks) || !userId) return 'stuck';
      const at = new Date().toISOString();
      const earlier = pendingRef.current.find((x) => x.userId === userId && x.version === TERMS_VERSION);
      const record: Pending = {
        userId,
        version: TERMS_VERSION,
        acceptedAt: at,
        since: earlier?.since ?? at,
        app,
        platform: platformName(),
        checks: { ...ALL_TICKED },
        olderDb: earlier?.olderDb,
      };
      savePending([...pendingRef.current.filter((x) => !(x.userId === userId && x.version === TERMS_VERSION)), record]);
      const sent = await flush();
      const time = Date.now();
      setNow(time);
      if (sent) return 'sent';
      const still = pendingRef.current.find((x) => x.userId === userId && x.version === TERMS_VERSION);
      return still && !still.olderDb && time - Date.parse(still.since) >= DAY_MS ? 'stuck' : 'waiting';
    },
    [app, userId, savePending, flush],
  );

  const rememberSignUp = useCallback(
    (id: string, payload: TermsPayload) => {
      if (!allTicked(payload.checks)) return;
      savePending([
        ...pendingRef.current.filter((x) => !(x.userId === id && x.version === payload.version)),
        {
          userId: id,
          version: payload.version,
          acceptedAt: payload.accepted_at,
          since: payload.accepted_at,
          app: payload.app,
          platform: payload.platform,
          checks: { ...ALL_TICKED },
        },
      ]);
      // Signed in straight away (no email to confirm): send it now.
      flush();
    },
    [savePending, flush],
  );

  const accountAcceptedAt = profileLoaded ? (profile.terms_accepted_at ?? null) : null;
  const accepted = useMemo((): AcceptedInfo | null => {
    if (!userId) return null;
    if (recorded && recorded.userId === userId)
      return { version: recorded.version, at: new Date(recorded.at), recorded: true };
    const waiting = mine.at(-1);
    if (accountVersion && accountAcceptedAt && (!waiting || accountVersion >= waiting.version)) {
      return { version: accountVersion, at: new Date(accountAcceptedAt), recorded: true };
    }
    if (waiting) return { version: waiting.version, at: new Date(waiting.acceptedAt), recorded: false };
    return null;
  }, [userId, recorded, mine, accountVersion, accountAcceptedAt]);

  const value = useMemo(
    (): TermsState => ({
      app,
      appName: APP_NAMES[app],
      ready,
      status,
      current,
      signedIn,
      accepted,
      accept,
      rememberSignUp,
      checkVersion,
    }),
    [app, ready, status, current, signedIn, accepted, accept, rememberSignUp, checkVersion],
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
