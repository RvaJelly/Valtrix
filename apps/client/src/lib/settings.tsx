import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider, useNavigationContainerRef } from 'expo-router';
import { createContext, use, useCallback, useEffect, useLayoutEffect, useState, type PropsWithChildren } from 'react';
import { Appearance, useColorScheme, type ColorSchemeName } from 'react-native';

import { ACCENTS, applyTheme, Colors, type AccentName, type Scheme } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { DEFAULT_REMINDER, REMINDER_OPTIONS } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';

export type Settings = {
  // 'system' follows the phone's light or dark mode.
  appearance: 'dark' | 'light' | 'system';
  accent: AccentName;
  units: 'kg' | 'lb';
  // Minutes before a booked session to send a reminder. 0 turns reminders off.
  reminder: number;
  // Ask for Face ID or a fingerprint when the app opens. Kept on this phone only,
  // so a new phone has to turn it on again.
  biometric: boolean;
};

const DEFAULTS: Settings = {
  appearance: 'dark',
  accent: 'orange',
  units: 'kg',
  reminder: DEFAULT_REMINDER,
  biometric: false,
};
const STORAGE_KEY = 'valtrix.settings';

// The settings saved with the account, so they come back on a new phone.
type Synced = Pick<Settings, 'appearance' | 'accent' | 'units' | 'reminder'>;

// Keep only valid values from stored or synced settings.
function clean(saved: Record<string, unknown> | null | undefined): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!saved) return out;
  if (saved.appearance === 'dark' || saved.appearance === 'light' || saved.appearance === 'system')
    out.appearance = saved.appearance;
  if (typeof saved.accent === 'string' && saved.accent in ACCENTS) out.accent = saved.accent as AccentName;
  if (saved.units === 'kg' || saved.units === 'lb') out.units = saved.units;
  if (String(saved.reminder) in REMINDER_OPTIONS) out.reminder = Number(saved.reminder);
  if (typeof saved.biometric === 'boolean') out.biometric = saved.biometric;
  return out;
}

function synced(settings: Settings): Synced {
  return {
    appearance: settings.appearance,
    accent: settings.accent,
    units: settings.units,
    reminder: settings.reminder,
  };
}

type SettingsState = {
  settings: Settings;
  ready: boolean;
  update: (changes: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsState | null>(null);

function schemeFor(settings: Settings, phoneScheme: ColorSchemeName | null | undefined): Scheme {
  if (settings.appearance === 'system') return phoneScheme === 'light' ? 'light' : 'dark';
  return settings.appearance;
}

// Settings are kept on this device and, apart from the fingerprint lock, with the
// account. Changing the theme redraws every screen, and the open screens are put
// back so the client stays where they were.
export function SettingsProvider({ children }: PropsWithChildren) {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const phoneScheme = useColorScheme();
  const scheme = schemeFor(settings, phoneScheme);
  const themeKey = `${scheme}-${settings.accent}`;
  const navigation = useNavigationContainerRef();
  // The theme the screens are drawn with, and the screens that were open when it changed.
  const [applied, setApplied] = useState<{ key: string; navState: ReturnType<typeof navigation.getRootState> | null }>({
    key: themeKey,
    navState: null,
  });
  // The account whose saved settings have been brought onto this phone.
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const next: Settings = { ...DEFAULTS, ...clean(JSON.parse(raw)) };
        // Apply the saved theme before any screen is drawn, so there is nothing to redraw or put back.
        const nextScheme = schemeFor(next, Appearance.getColorScheme());
        applyTheme(nextScheme, next.accent);
        setSettings(next);
        setApplied({ key: `${nextScheme}-${next.accent}`, navState: null });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // After sign-in, take the settings saved with the account.
  if (ready && profile && syncedFor !== profile.id) {
    setSyncedFor(profile.id);
    const fromAccount = clean(profile.preferences);
    delete fromAccount.biometric;
    if (Object.keys(fromAccount).length) setSettings({ ...settings, ...fromAccount });
  }

  // Keep this phone's copy and the account's copy up to date. An account with
  // nothing saved yet gets this phone's settings.
  const stored = JSON.stringify(settings);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, stored).catch(() => {});
  }, [ready, stored]);

  const profileId = profile?.id;
  const forAccount = JSON.stringify(synced(settings));
  useEffect(() => {
    if (!profileId || syncedFor !== profileId) return;
    supabase
      .from('profiles')
      .update({ preferences: JSON.parse(forAccount) })
      .eq('id', profileId)
      .then(() => {});
  }, [profileId, syncedFor, forAccount]);

  // Swap the palette before the redraw, remembering which screens were open.
  if (themeKey !== applied.key) {
    applyTheme(scheme, settings.accent);
    setApplied({ key: themeKey, navState: navigation.isReady() ? navigation.getRootState() : null });
  }

  useLayoutEffect(() => {
    if (applied.navState && navigation.isReady()) navigation.resetRoot(applied.navState);
  }, [applied, navigation]);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }));
  }, []);

  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: Colors.accent,
      background: Colors.background,
      card: Colors.background,
      text: Colors.text,
      border: Colors.border,
    },
  };

  return (
    <SettingsContext value={{ settings, ready, update }}>
      <ThemeProvider value={navTheme}>
        {/* The key redraws every screen with the new palette. */}
        <ThemeKeyed key={applied.key}>{children}</ThemeKeyed>
      </ThemeProvider>
    </SettingsContext>
  );
}

function ThemeKeyed({ children }: PropsWithChildren) {
  return children;
}

export function useSettings() {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
