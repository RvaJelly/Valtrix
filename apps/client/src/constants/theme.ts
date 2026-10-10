import { Platform, StyleSheet, type TextStyle } from 'react-native';

// Voltrix brand colours (see the brand kit README), plus the themes a client
// can pick in Settings. Voltrix is orange on white by default.

// `color` fills buttons and chips, with `on` as the text on top. Text, icons and
// links on the page use `ink`, which stays readable on that scheme's background.
export const ACCENTS = {
  orange: {
    label: 'Voltrix orange',
    color: '#FF5B14',
    pressed: '#E04A08',
    on: '#0E0E0F',
    ink: { dark: '#FF5B14', light: '#C2410C' },
  },
  blue: {
    label: 'Blue',
    color: '#2F80FF',
    pressed: '#1D66DB',
    on: '#0E0E0F',
    ink: { dark: '#5B9BFF', light: '#1D66DB' },
  },
  green: {
    label: 'Green',
    color: '#22C55E',
    pressed: '#16A34A',
    on: '#0E0E0F',
    ink: { dark: '#22C55E', light: '#15803D' },
  },
  teal: {
    label: 'Teal',
    color: '#14B8A6',
    pressed: '#0F9488',
    on: '#0E0E0F',
    ink: { dark: '#14B8A6', light: '#0F766E' },
  },
  purple: {
    label: 'Purple',
    color: '#8B5CF6',
    pressed: '#7340E8',
    on: '#0E0E0F',
    ink: { dark: '#A78BFA', light: '#7340E8' },
  },
  pink: {
    label: 'Pink',
    color: '#EC4899',
    pressed: '#D02F7E',
    on: '#0E0E0F',
    ink: { dark: '#F472B6', light: '#BE185D' },
  },
  red: {
    label: 'Red',
    color: '#EF4444',
    pressed: '#D42C2C',
    on: '#0E0E0F',
    ink: { dark: '#F87171', light: '#C52A2A' },
  },
  yellow: {
    label: 'Yellow',
    color: '#FACC15',
    pressed: '#E0B400',
    on: '#0E0E0F',
    ink: { dark: '#FACC15', light: '#8F5A05' },
  },
} as const;

export type AccentName = keyof typeof ACCENTS;
export type Scheme = 'dark' | 'light';

// The brand kit's fixed colours. They never follow the theme: the V in the logo is always Voltrix orange.
export const BRAND = {
  orange: '#FF5B14',
  iron: '#0E0E0F',
  navy: '#0A1630',
  white: '#FFFFFF',
  stone: '#8C8A86',
} as const;

type Base = {
  // The page.
  background: string;
  // Cards, grouped lists and hero cards.
  surface: string;
  // Opaque raised blocks: image placeholders, pressed rows on older screens.
  surfaceRaised: string;
  // Sheets, menus and the selected segment.
  surfaceHigh: string;
  // A see-through fill for secondary buttons, inputs, icon tiles, pressed rows and skeletons.
  tint: string;
  tintPressed: string;
  // Hairline dividers.
  border: string;
  borderStrong: string;
  // Ring and bar tracks.
  track: string;
  text: string;
  textSecondary: string;
  // Chevrons, quiet notes and disabled labels; never the only carrier of information. Placeholders
  // use textSecondary, so they stay readable on an input's fill.
  textTertiary: string;
  danger: string;
  success: string;
  warning: string;
  toast: string;
  onToast: string;
  scrim: string;
  // A CSS box shadow for floating layers only (sheets, toasts, menus, sticky bars).
  shadowFloating: string;
  // Fills for avatars without a photo (light: slate, stone, sage, clay and plum).
  monogram: readonly string[];
  // The person's own chat bubbles (the other person's use surface). Never the accent.
  bubble: string;
  onBubble: string;
};

// Dark fills are tones of the Iron base, so a monogram never reads as a bruise.
const MONOGRAM_DARK = ['#232325', '#2B2B2D', '#303033', '#262628', '#353537'];
const MONOGRAM_LIGHT = ['#E9E6E1', '#E3E7EC', '#E2E8E3', '#EDE4DE', '#E8E3EA'];

// Client: white by default, and an Iron Black dark theme. Light surfaces are warm, tied to Stone.
const BASES: Record<Scheme, Base> = {
  dark: {
    background: '#0E0E0F',
    surface: '#1A1A1B',
    surfaceRaised: '#222223',
    surfaceHigh: '#2B2B2C',
    tint: 'rgba(255,255,255,0.08)',
    tintPressed: 'rgba(255,255,255,0.14)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    track: 'rgba(255,255,255,0.12)',
    text: '#FFFFFF',
    textSecondary: '#A3A3A4',
    textTertiary: '#8A8A8C',
    // Light enough for a red label on a tinted button inside a sheet (4.7:1 or better).
    danger: '#FF8A8A',
    success: '#3DD68C',
    warning: '#F5B83D',
    toast: '#2B2B2C',
    onToast: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.6)',
    shadowFloating: '0 12px 32px rgba(0,0,0,0.5)',
    monogram: MONOGRAM_DARK,
    bubble: '#333335',
    onBubble: '#FFFFFF',
  },
  light: {
    background: '#FFFFFF',
    surface: '#F6F5F3',
    surfaceRaised: '#EFEEEB',
    surfaceHigh: '#FFFFFF',
    tint: 'rgba(14,14,15,0.05)',
    tintPressed: 'rgba(14,14,15,0.09)',
    border: '#E7E5E1',
    borderStrong: '#D6D3CE',
    track: 'rgba(14,14,15,0.08)',
    text: '#0E0E0F',
    textSecondary: '#62605C',
    textTertiary: '#6E6B67',
    danger: '#C42126',
    success: '#1F7A4D',
    warning: '#A15C07',
    toast: '#0E0E0F',
    onToast: '#FFFFFF',
    scrim: 'rgba(14,14,15,0.4)',
    shadowFloating: '0 8px 24px rgba(14,14,15,0.08), 0 1px 2px rgba(14,14,15,0.06)',
    monogram: MONOGRAM_LIGHT,
    bubble: '#0E0E0F',
    onBubble: '#FFFFFF',
  },
};

function palette(scheme: Scheme, accent: AccentName) {
  const a = ACCENTS[accent];
  return {
    ...BASES[scheme],
    accent: a.color as string,
    accentPressed: a.pressed as string,
    onAccent: a.on as string,
    accentText: a.ink[scheme] as string,
    scheme,
  };
}

export type Palette = ReturnType<typeof palette>;

// The live palette. Screens read it while rendering; ThemeProvider swaps its
// values and redraws the app when the client picks a new theme.
export const Colors: Palette = palette('light', 'orange');

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

// '#FF5B14' at 14 % → 'rgba(255, 91, 20, 0.14)', for tinted status pills.
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

// Moves `hex` toward `toward` by `amount` (0 to 1): a status colour deepened for small text on a light pill.
export function mix(hex: string, toward: string, amount: number): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null;
  };
  const a = parse(hex);
  const b = parse(toward);
  if (!a || !b) return hex;
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

// ---------- Type ----------

// The fonts in assets/fonts (see constants/fonts.ts). The weight lives in the family name, so
// never set fontWeight together with these. On the web each one falls back to the system font.
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const family = (name: string) => (Platform.OS === 'web' ? `${name}, ${SANS}` : name);

export const Fonts = {
  display: family('ChakraPetch-Bold'),
  displaySemi: family('ChakraPetch-SemiBold'),
  text: family('Inter-Regular'),
  textMedium: family('Inter-Medium'),
  textSemi: family('Inter-SemiBold'),
};

// Android adds space above and below the glyphs; without it buttons and pills centre truly.
const tight: TextStyle = Platform.OS === 'android' ? { includeFontPadding: false } : {};

export type TypeName =
  | 'display'
  | 'largeTitle'
  | 'title'
  | 'stat'
  | 'headline'
  | 'rowTitle'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'label'
  | 'button'
  | 'tab'
  | 'timer';

// Chakra Petch (display, largeTitle, title, stat) is for short uppercase words and static numbers
// only. Everything else is Inter.
export const Type: Record<TypeName, TextStyle> = {
  display: {
    fontFamily: Fonts.display,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    ...tight,
  },
  largeTitle: {
    fontFamily: Fonts.displaySemi,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    ...tight,
  },
  title: {
    fontFamily: Fonts.displaySemi,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    ...tight,
  },
  stat: { fontFamily: Fonts.displaySemi, fontSize: 28, lineHeight: 32, letterSpacing: 0, ...tight },
  headline: { fontFamily: Fonts.textSemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  rowTitle: { fontFamily: Fonts.textMedium, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: Fonts.text, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  callout: { fontFamily: Fonts.text, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  footnote: { fontFamily: Fonts.text, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  label: {
    fontFamily: Fonts.textSemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...tight,
  },
  button: { fontFamily: Fonts.textSemi, fontSize: 16, lineHeight: 20, letterSpacing: -0.1, ...tight },
  // 15 so g, p and y keep their descenders in the tab bar.
  tab: { fontFamily: Fonts.textMedium, fontSize: 11, lineHeight: 15, letterSpacing: 0.1, ...tight },
  timer: {
    fontFamily: Fonts.textSemi,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
};

// Times and counts that change in place (session times, kcal) keep their width.
export const Tabular: TextStyle = { fontVariant: ['tabular-nums'] };

// ---------- Space and shape ----------

// 4-pt grid, 8-pt rhythm.
export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  // The premium rhythm. Prefer these names in new code.
  tight: 12, // between items in a card, section label to content
  gutter: 20, // page side padding on phones, card padding
  section: 32, // between sections on a page
  hero: 48, // empty-state padding, welcome blocks
} as const;

export const Layout = {
  rowHeight: 64, // list row with a 40-44 avatar
  rowHeightCompact: 56, // text-only row
  touch: 44, // minimum hit area (use hitSlop when the visible control is smaller)
  maxClient: 640, // client screens on a wide window
  maxCoach: 720, // coach screens on a wide window
  maxWelcome: 480, // welcome, sign-in and sign-up column
  maxForm: 560,
  sidebar: 232, // tab sidebar width at 1024 px and wider
  wide: 1024, // the breakpoint for the sidebar
} as const;

export const Radius = {
  small: 8, // tags, skeleton text bars, small thumbnails
  medium: 12, // buttons, inputs, icon tiles, thumbnails, notices, toasts
  large: 16, // cards, hero cards and grouped lists: one radius for everything stacked on a page
  xl: 24, // sheets (top corners)
  pill: 999, // chips, status pills, badges
} as const;
