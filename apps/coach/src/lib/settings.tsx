import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider, useNavigationContainerRef } from 'expo-router';
import { createContext, use, useCallback, useEffect, useLayoutEffect, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { ACCENTS, applyTheme, Colors, type AccentName } from '@/constants/theme';

export type Settings = {
  // 'system' follows the phone's light or dark mode.
  appearance: 'dark' | 'light' | 'system';
  accent: AccentName;
  units: 'kg' | 'lb';
};

const DEFAULTS: Settings = { appearance: 'dark', accent: 'orange', units: 'kg' };
const STORAGE_KEY = 'valtrix.settings';

type SettingsState = {
  settings: Settings;
  ready: boolean;
  update: (changes: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsState | null>(null);

// Settings are kept on this device. Changing the theme redraws every screen,
// and the open screens are put back so the trainer stays where they were.
export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const phoneScheme = useColorScheme();
  const scheme = settings.appearance === 'system' ? (phoneScheme === 'light' ? 'light' : 'dark') : settings.appearance;
  const themeKey = `${scheme}-${settings.accent}`;
  const navigation = useNavigationContainerRef();
  // The theme the screens are drawn with, and the screens that were open when it changed.
  const [applied, setApplied] = useState<{ key: string; navState: ReturnType<typeof navigation.getRootState> | null }>({
    key: themeKey,
    navState: null,
  });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Settings>;
        setSettings({
          ...DEFAULTS,
          ...saved,
          accent: saved.accent && saved.accent in ACCENTS ? saved.accent : DEFAULTS.accent,
        });
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Swap the palette before the redraw, remembering which screens were open.
  if (themeKey !== applied.key) {
    applyTheme(scheme, settings.accent);
    setApplied({ key: themeKey, navState: navigation.isReady() ? navigation.getRootState() : null });
  }

  useLayoutEffect(() => {
    if (applied.navState && navigation.isReady()) navigation.resetRoot(applied.navState);
  }, [applied, navigation]);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
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
