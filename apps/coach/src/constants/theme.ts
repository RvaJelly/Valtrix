import { StyleSheet } from 'react-native';

// Valtrix brand colours (see the brand kit README), plus the themes a trainer
// can pick in Settings. Valtrix orange on black is the default.

export const ACCENTS = {
  orange: { label: 'Valtrix orange', color: '#FF5B14', pressed: '#E04A08', on: '#0E0E0F' },
  blue: { label: 'Blue', color: '#2F80FF', pressed: '#1D66DB', on: '#FFFFFF' },
  green: { label: 'Green', color: '#22C55E', pressed: '#16A34A', on: '#0E0E0F' },
  teal: { label: 'Teal', color: '#14B8A6', pressed: '#0F9488', on: '#0E0E0F' },
  purple: { label: 'Purple', color: '#8B5CF6', pressed: '#7340E8', on: '#FFFFFF' },
  pink: { label: 'Pink', color: '#EC4899', pressed: '#D02F7E', on: '#FFFFFF' },
  red: { label: 'Red', color: '#EF4444', pressed: '#D42C2C', on: '#FFFFFF' },
  yellow: { label: 'Yellow', color: '#FACC15', pressed: '#E0B400', on: '#0E0E0F' },
} as const;

export type AccentName = keyof typeof ACCENTS;
export type Scheme = 'dark' | 'light';

const BASES = {
  dark: {
    background: '#0E0E0F',
    surface: '#18181A',
    surfaceRaised: '#222225',
    border: '#2E2E32',
    text: '#FFFFFF',
    textSecondary: '#8C8A86',
    danger: '#FF4D4F',
  },
  light: {
    background: '#F5F4F2',
    surface: '#FFFFFF',
    surfaceRaised: '#ECEBE8',
    border: '#DDDBD7',
    text: '#0E0E0F',
    textSecondary: '#6B6965',
    danger: '#D92D30',
  },
} as const;

function palette(scheme: Scheme, accent: AccentName) {
  const a = ACCENTS[accent];
  return { ...BASES[scheme], accent: a.color, accentPressed: a.pressed, onAccent: a.on, scheme };
}

export type Palette = ReturnType<typeof palette>;

// The live palette. Screens read it while rendering; ThemeProvider swaps its
// values and redraws the app when the trainer picks a new theme.
export const Colors: Palette = palette('dark', 'orange');

let version = 0;

export function applyTheme(scheme: Scheme, accent: AccentName) {
  Object.assign(Colors, palette(scheme, accent));
  version++;
}

// Like StyleSheet.create, but rebuilt for the current theme the first time it
// is read after a theme change.
export function themed<T extends StyleSheet.NamedStyles<T>>(make: () => T): T {
  let built: T | null = null;
  let builtFor = -1;
  return new Proxy({} as T, {
    get(_, key) {
      if (builtFor !== version) {
        built = StyleSheet.create(make());
        builtFor = version;
      }
      return built![key as keyof T];
    },
  });
}

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
} as const;
