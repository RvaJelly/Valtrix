import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text as RNText,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { VMark } from '@/components/v-mark';
import { Duration, Ease, NATIVE_DRIVER, Spring, useReducedMotion } from '@/constants/motion';
import {
  BRAND,
  Colors,
  Fonts,
  mix,
  Radius,
  Spacing,
  Tabular,
  themed,
  Type,
  withAlpha,
  type TypeName,
} from '@/constants/theme';
import { haptic } from '@/lib/haptics';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// The selected segment's pill sits this far inside the track.
const SEGMENT_INSET = 3;

// Pointer cursor and hover states only mean something in a browser.
const WEB = Platform.OS === 'web';
const pointer: ViewStyle = WEB ? { cursor: 'pointer' } : {};

// Pressed and hovered look the same: hover is the web's way of saying "you can press this".
// A control that turns disabled (a button while it loads) stops hearing the pointer leave, so its
// hover ends there; it starts again the next time the pointer comes in.
function useHover(disabled?: boolean) {
  const [hovered, setHovered] = useState(false);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setHovered(false);
  }
  return {
    hovered,
    hover: WEB ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } : {},
  };
}

// ---------- Text ----------

export type Tone = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'success' | 'warning' | 'onAccent';

function toneColor(tone: Tone) {
  switch (tone) {
    case 'secondary':
      return Colors.textSecondary;
    case 'tertiary':
      return Colors.textTertiary;
    case 'danger':
      return Colors.danger;
    case 'success':
      return Colors.success;
    case 'warning':
      return Colors.warning;
    case 'onAccent':
      return Colors.onAccent;
    default:
      return Colors.text;
  }
}

// Older styles pick a weight; the bundled fonts carry the weight in their name instead.
function familyFor(weight: TextStyle['fontWeight']) {
  const w = String(weight);
  if (w === '500') return Fonts.textMedium;
  if (w === 'bold' || Number(w) >= 600) return Fonts.textSemi;
  return Fonts.text;
}

// Variants that use the display face or tiny sizes stop growing at 130 % text size.
const CAPPED: TypeName[] = ['display', 'largeTitle', 'title', 'stat', 'label', 'tab'];

const LOOSE_BODY: TextStyle = { fontFamily: Type.body.fontFamily, letterSpacing: Type.body.letterSpacing };

// Text inside a Text inherits its parent's font and colour unless it asks for its own.
const InsideText = createContext(false);

// The app's text: a type role (`variant`, body by default) and a colour role (`tone`).
export function Text({
  variant,
  tone,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps & { variant?: TypeName; tone?: Tone }) {
  const nested = useContext(InsideText);
  let own = StyleSheet.flatten(style) as TextStyle | undefined;
  if (own && own.fontWeight != null && !own.fontFamily) {
    const { fontWeight, ...others } = own;
    own = { ...others, fontFamily: familyFor(fontWeight) };
  }
  // An older style with its own size and no line height keeps the font's natural spacing rather
  // than body's 24, so small text doesn't spread out.
  const type = variant ? Type[variant] : own?.fontSize != null && own.lineHeight == null ? LOOSE_BODY : Type.body;
  const base = nested
    ? [variant ? Type[variant] : null, tone ? { color: toneColor(tone) } : null]
    : [type, { color: toneColor(tone ?? 'primary') }];
  const multiplier = maxFontSizeMultiplier ?? (variant && CAPPED.includes(variant) ? 1.3 : undefined);
  const text = <RNText {...rest} maxFontSizeMultiplier={multiplier} style={[...base, own]} />;
  return nested ? text : <InsideText.Provider value>{text}</InsideText.Provider>;
}

export function Title(props: TextProps) {
  return <Text variant="largeTitle" accessibilityRole="header" {...props} />;
}

export function Body({ secondary, ...rest }: TextProps & { secondary?: boolean }) {
  return <Text variant="body" tone={secondary ? 'secondary' : 'primary'} {...rest} />;
}

// ---------- Buttons ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'large' | 'medium' | 'small';
  // A leading icon (outline set).
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZES = {
  large: { height: 52, padding: 24, radius: Radius.medium, font: 16, icon: 18 },
  medium: { height: 44, padding: 20, radius: Radius.medium, font: 15, icon: 18 },
  small: { height: 36, padding: 14, radius: 10, font: 14, icon: 16 },
} as const;

// One primary (orange) button per view; secondary and ghost for the rest; destructive in red.
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  icon,
  loading,
  disabled,
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const press = (to: number) =>
    Animated.spring(scale, { toValue: to, ...Spring.press, useNativeDriver: NATIVE_DRIVER }).start();
  const s = SIZES[size];
  const inactive = disabled || loading;
  const { hovered, hover } = useHover(!!inactive);
  // Disabled buttons turn neutral rather than a faded orange.
  const off = disabled && !loading;

  function fill(pressed: boolean) {
    if (off) return variant === 'ghost' ? 'transparent' : Colors.tint;
    if (variant === 'primary') return pressed ? Colors.accentPressed : Colors.accent;
    if (variant === 'ghost') return pressed ? Colors.tint : 'transparent';
    return pressed ? Colors.tintPressed : Colors.tint;
  }
  const color = off
    ? Colors.textTertiary
    : variant === 'primary'
      ? Colors.onAccent
      : variant === 'destructive'
        ? Colors.danger
        : Colors.text;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        testID={testID}
        onPress={() => {
          // The one main action of a screen answers with a light tap on a phone.
          if (variant === 'primary') haptic.tap();
          onPress();
        }}
        disabled={inactive}
        hitSlop={size === 'small' ? 4 : undefined}
        onPressIn={() => {
          if (!reduceMotion) press(0.98);
        }}
        onPressOut={() => press(1)}
        {...hover}
        style={({ pressed }) => [
          styles.button,
          pointer,
          {
            minHeight: s.height,
            paddingHorizontal: s.padding,
            borderRadius: s.radius,
            backgroundColor: fill(pressed || (hovered && !inactive)),
          },
        ]}>
        {/* While loading, the label keeps the button's width and a spinner shows in its place. */}
        <View style={[styles.buttonInner, loading && { opacity: 0 }]}>
          {icon ? <Ionicons name={icon} size={s.icon} color={color} /> : null}
          <Text variant="button" style={{ color, fontSize: s.font, textAlign: 'center' }}>
            {title}
          </Text>
        </View>
        {loading ? <ActivityIndicator color={color} style={StyleSheet.absoluteFill} /> : null}
      </Pressable>
    </Animated.View>
  );
}

// A quiet text link under a form: an optional lead-in in the secondary colour ("New here?") and the
// action in the text colour. Never as heavy as a button.
export function TextLink({ lead, label, onPress }: { lead?: string; label: string; onPress: () => void }) {
  const { hovered, hover } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lead ? `${lead} ${label}` : label}
      onPress={onPress}
      {...hover}
      style={[styles.textLink, pointer]}>
      {({ pressed }) => (
        <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
          {lead ? `${lead} ` : null}
          <Text
            tone="primary"
            style={{
              fontFamily: lead ? Fonts.textSemi : Fonts.textMedium,
              textDecorationLine: pressed || hovered ? 'underline' : 'none',
            }}>
            {label}
          </Text>
        </Text>
      )}
    </Pressable>
  );
}

// A round icon-only button. `label` is what screen readers say, so it is required.
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  tone = 'primary',
  disabled,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'plain' | 'tonal';
  // Secondary for a row action repeated down a list, such as a bin on every row, so it recedes.
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { hovered, hover } = useHover(!!disabled);
  const tonal = variant === 'tonal';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={tonal ? 2 : 0}
      {...hover}
      style={({ pressed }) => [
        tonal ? styles.iconTonal : styles.iconPlain,
        pointer,
        tonal
          ? { backgroundColor: pressed || hovered ? Colors.tintPressed : Colors.tint }
          : (pressed || hovered) && { backgroundColor: Colors.tint },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      <Ionicons name={icon} size={tonal ? 20 : 24} color={tone === 'secondary' ? Colors.textSecondary : Colors.text} />
    </Pressable>
  );
}

// ---------- Inputs ----------

type FieldProps = TextInputProps & { label: string; error?: string; optional?: boolean; icon?: IconName };

// A labelled text box. The label stays above the field; focus and errors show on its border.
// Focus is drawn in the text colour, which stands out on every theme and with every accent.
export function TextField({ label, error, optional, icon, style, onFocus, onBlur, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? Colors.danger : focused ? Colors.text : 'transparent';
  const input = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={Colors.textSecondary}
      selectionColor={Colors.accent}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[icon ? styles.inputBare : [styles.input, { borderColor: border }], style]}
      {...rest}
    />
  );
  return (
    <View style={{ gap: Spacing.two }}>
      <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
        {label}
        {optional ? <Text tone="tertiary"> (optional)</Text> : null}
      </Text>
      {icon ? (
        <View style={[styles.inputBox, styles.inputRow, { borderColor: border }]}>
          <Ionicons name={icon} size={18} color={Colors.textSecondary} />
          {input}
        </View>
      ) : (
        input
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

// A search box: magnifier, placeholder and a clear button once something is typed.
export function SearchField({
  value,
  onChangeText,
  placeholder,
  style,
  ...rest
}: Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (text: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.search, style]}>
      <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={Colors.textSecondary}
        selectionColor={Colors.accent}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.searchInput}
        {...rest}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={12}
          onPress={() => onChangeText('')}
          style={pointer}>
          <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// The selected segment of a segmented control: a raised, monochrome pill on the tint track
// (never orange). Light themes lift it with a soft shadow; dark themes with a lighter fill.
export function segmentOn(): ViewStyle {
  return Colors.scheme === 'light'
    ? { backgroundColor: Colors.surfaceHigh, boxShadow: '0 1px 3px rgba(14,14,15,0.12)' }
    : { backgroundColor: Colors.tintPressed };
}

// Two to four choices in one row: Workouts / Sessions, Navy / Light / Auto. The raised pill slides
// to the new choice (instantly with reduced motion).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(index));
  useEffect(() => {
    if (reduceMotion) position.setValue(index);
    else Animated.spring(position, { toValue: index, ...Spring.move, useNativeDriver: NATIVE_DRIVER }).start();
  }, [index, position, reduceMotion]);
  // Until the row has been measured the selected segment draws its own pill.
  const segment = width > 0 ? (width - 2 * SEGMENT_INSET) / options.length : 0;
  const last = Math.max(1, options.length - 1);
  return (
    <View
      style={[styles.segmented, style]}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentPill,
            segmentOn(),
            {
              width: segment,
              transform: [
                { translateX: position.interpolate({ inputRange: [0, last], outputRange: [0, last * segment] }) },
              ],
            },
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(o.value);
            }}
            style={[styles.segment, pointer, selected && segment === 0 && segmentOn()]}>
            <Text
              variant="callout"
              tone={selected ? 'primary' : 'secondary'}
              style={{ fontFamily: Fonts.textSemi }}
              numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// An on / off switch: a monochrome track (text-coloured when on, never orange) and a white knob
// that slides across. The label next to it should also toggle it, so pass the same handler there.
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  testID,
  style,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const [knob] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) knob.setValue(value ? 1 : 0);
    else
      Animated.timing(knob, {
        toValue: value ? 1 : 0,
        duration: 150,
        easing: Ease.standard,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
  }, [knob, reduceMotion, value]);
  // On a dark theme the "on" track is white, so its knob takes the page colour instead.
  const knobColor = value && Colors.scheme === 'dark' ? Colors.background : BRAND.white;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={() => {
        haptic.select(!value);
        onValueChange(!value);
      }}
      style={[styles.toggleTarget, pointer, disabled && { opacity: 0.4 }, style]}>
      <View style={[styles.toggleTrack, { backgroundColor: value ? Colors.text : Colors.track }]}>
        <Animated.View
          style={[
            styles.toggleKnob,
            {
              backgroundColor: knobColor,
              transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

// ---------- Messages ----------

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return (
    <View style={styles.errorRow} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} style={{ marginTop: 2 }} />
      <Text variant="footnote" tone="danger" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

type NoticeTone = 'neutral' | 'warning' | 'danger' | 'success';

const NOTICE_ICONS: Record<NoticeTone, IconName> = {
  neutral: 'information-circle-outline',
  warning: 'warning-outline',
  danger: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
};

// An inline banner: an icon in the tone's colour, a short message and maybe one small action.
export function Notice({
  tone = 'neutral',
  children,
  action,
  onCard,
  style,
}: PropsWithChildren<{
  tone?: NoticeTone;
  action?: { label: string; onPress: () => void; loading?: boolean };
  // On a card the notice uses the see-through fill instead of the card colour.
  onCard?: boolean;
  style?: StyleProp<ViewStyle>;
}>) {
  const color = tone === 'neutral' ? Colors.textSecondary : Colors[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: onCard ? Colors.tint : Colors.surface }, style]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Ionicons name={NOTICE_ICONS[tone]} size={20} color={color} />
      <Text variant="callout" style={{ flex: 1 }}>
        {children}
      </Text>
      {action ? (
        <Button
          title={action.label}
          onPress={action.onPress}
          loading={action.loading}
          variant="secondary"
          size="small"
        />
      ) : null}
    </View>
  );
}

// ---------- Surfaces ----------

// Every card's content starts 20 in from its edge, the same as a row's text, so stacked cards and
// groups share one left edge. A hero card is roomier top and bottom only.
const CARD_X = Spacing.gutter;
const CARD_Y = Spacing.gutter;
const HERO_Y = Spacing.four;

// A card: the warm surface colour, no border, no shadow. Never put a card inside a card.
// With `onPress` the content is one button; `footer` (a Join button) sits under it as its own
// button, never inside the card's, so screen readers and the web reach both.
export function Card({
  children,
  style,
  hero,
  onPress,
  footer,
  pressedFill,
  accessibilityLabel,
  accessibilityHint,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  // The one big card at the top of a screen: roomier top and bottom.
  hero?: boolean;
  onPress?: () => void;
  footer?: ReactNode;
  // The pressed and hovered fill, for a card that isn't the surface colour.
  pressedFill?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>) {
  const { hovered, hover } = useHover();
  const [pressed, setPressed] = useState(false);
  const look = [styles.card, hero && styles.hero, style];
  const footerView = footer ? <View style={{ marginTop: Spacing.gutter }}>{footer}</View> : null;
  if (!onPress) {
    return (
      <View style={look}>
        {children}
        {footerView}
      </View>
    );
  }
  const y = hero ? HERO_Y : CARD_Y;
  return (
    <View style={look}>
      {pressed || hovered ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: pressedFill ?? Colors.tint }]} />
      ) : null}
      {/* The pressable area reaches the card's edges, so the padding is part of the target. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        {...hover}
        style={[
          pointer,
          {
            marginHorizontal: -CARD_X,
            paddingHorizontal: CARD_X,
            marginTop: -y,
            paddingTop: y,
            ...(footer ? null : { marginBottom: -y, paddingBottom: y }),
          },
        ]}>
        {children}
      </Pressable>
      {footerView}
    </View>
  );
}

// One card holding a list of rows separated by hairlines.
export function Group({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.group, style]}>{children}</View>;
}

// For FlatList rows that can't sit inside a Group: the first and last rows round the corners.
export function groupedItem(index: number, count: number): ViewStyle {
  return {
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...(index === 0 ? { borderTopLeftRadius: Radius.large, borderTopRightRadius: Radius.large } : null),
    ...(index === count - 1 ? { borderBottomLeftRadius: Radius.large, borderBottomRightRadius: Radius.large } : null),
  };
}

// A hairline on its own, for custom rows.
export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, { marginLeft: inset }, style]} />;
}

// A neutral square holding a row's icon.
export function IconTile({ icon, color, style }: { icon: IconName; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.iconTile, style]}>
      <Ionicons name={icon} size={20} color={color ?? Colors.textSecondary} />
    </View>
  );
}

type ListRowProps = {
  title: string;
  subtitle?: ReactNode;
  // An avatar or IconTile on the left.
  leading?: ReactNode;
  // A short status (a pill or a dot and a word). With large text it moves under the title, so the
  // title keeps its width.
  status?: ReactNode;
  trailing?: ReactNode;
  // Shown by default when the row can be pressed.
  chevron?: boolean;
  onPress?: () => void;
  // The last row of a group has no hairline under it.
  last?: boolean;
  compact?: boolean;
  titleTone?: Tone;
  titleLines?: number;
  titleStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: ComponentProps<typeof Pressable>['accessibilityState'];
  testID?: string;
};

// A row in a Group: leading, title and subtitle, status, trailing, chevron. The hairline under it
// starts where the title starts. With large text the title and subtitle may take two lines.
export function ListRow({
  title,
  subtitle,
  leading,
  status,
  trailing,
  chevron,
  onPress,
  last,
  compact,
  titleTone,
  titleLines = 1,
  titleStyle,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: ListRowProps) {
  const { hovered, hover } = useHover();
  const large = useWindowDimensions().fontScale > 1.15;
  const showChevron = chevron ?? !!onPress;
  const content = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={[styles.rowBody, { minHeight: compact ? 56 : 64 }, !last && styles.rowLine]}>
        <View style={styles.rowText}>
          <Text
            variant="rowTitle"
            tone={titleTone}
            numberOfLines={large ? Math.max(titleLines, 2) : titleLines}
            style={titleStyle}>
            {title}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text variant="footnote" tone="secondary" numberOfLines={large ? 2 : 1}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
          {status && large ? <View style={styles.rowStatusBelow}>{status}</View> : null}
        </View>
        {status && !large ? <View style={styles.rowTrailing}>{status}</View> : null}
        {trailing ? <View style={styles.rowTrailing}>{trailing}</View> : null}
        {showChevron ? <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} /> : null}
      </View>
    </>
  );
  if (!onPress)
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      testID={testID}
      onPress={onPress}
      {...hover}
      style={({ pressed }) => [styles.row, pointer, (pressed || hovered) && { backgroundColor: Colors.tint }]}>
      {content}
    </Pressable>
  );
}

// A titled block of a page: an uppercase label and maybe one quiet action on the right ("See all ›"),
// always quieter than the label it sits beside.
export function Section({
  title,
  action,
  children,
  style,
}: PropsWithChildren<{
  title: string;
  action?: { label: string; onPress: () => void; accessibilityLabel?: string };
  style?: StyleProp<ViewStyle>;
}>) {
  const { hovered, hover } = useHover();
  return (
    <View style={[{ gap: Spacing.tight }, style]}>
      <View style={styles.sectionHeader}>
        <Text variant="label" tone="secondary" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            {...hover}
            style={[styles.sectionAction, pointer]}>
            {({ pressed }) => (
              <>
                <Text
                  variant="footnote"
                  tone={pressed || hovered ? 'primary' : 'secondary'}
                  style={{ fontFamily: Fonts.textMedium }}>
                  {action.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={pressed || hovered ? Colors.text : Colors.textTertiary}
                />
              </>
            )}
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// The top of a tab screen. With an eyebrow (and the Rising V), the icon buttons share the eyebrow's
// line and the big uppercase title has the full width below; without one, the buttons sit beside
// the title.
export function PageHeader({
  eyebrow,
  title,
  brand,
  actions,
  onTitlePress,
  titleAccessibilityLabel,
}: {
  eyebrow?: string;
  title: string;
  // The Rising V before the eyebrow.
  brand?: boolean;
  actions?: ReactNode;
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
}) {
  const heading = (
    <Text variant="largeTitle" numberOfLines={2} accessibilityRole="header">
      {title}
    </Text>
  );
  const titleView = onTitlePress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titleAccessibilityLabel}
      onPress={onTitlePress}
      style={[{ alignSelf: 'flex-start' }, pointer]}>
      {heading}
    </Pressable>
  ) : (
    heading
  );
  if (!brand && !eyebrow) {
    return (
      <View style={styles.pageHeaderRow}>
        <View style={{ flex: 1 }}>{titleView}</View>
        {actions ? <View style={styles.pageActionsBeside}>{actions}</View> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.one }}>
      <View style={styles.eyebrow}>
        {brand ? <VMark height={14} /> : null}
        <Text variant="label" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {eyebrow ?? ''}
        </Text>
        {actions ? <View style={styles.pageActions}>{actions}</View> : null}
      </View>
      {titleView}
    </View>
  );
}

// A row of round shortcuts, each a tonal circle with an outline icon and a short label under it.
export function Shortcuts({
  items,
}: {
  items: { icon: IconName; label: string; onPress: () => void; accessibilityLabel?: string }[];
}) {
  return (
    <View style={styles.shortcuts}>
      {items.map((item) => (
        <Shortcut key={item.label} {...item} />
      ))}
    </View>
  );
}

function Shortcut({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { hovered, hover } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...hover}
      style={[styles.shortcut, pointer]}>
      {({ pressed }) => (
        <>
          <View style={[styles.shortcutCircle, (pressed || hovered) && { backgroundColor: Colors.tintPressed }]}>
            <Ionicons name={icon} size={22} color={Colors.text} />
          </View>
          <Text variant="footnote" numberOfLines={2} style={styles.shortcutLabel}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ---------- Status ----------

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'muted';

function statusColor(tone: StatusTone) {
  if (tone === 'neutral') return Colors.textSecondary;
  if (tone === 'muted') return Colors.textTertiary;
  return Colors[tone];
}

// A coloured dot and a word: colour is never the only signal.
export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <View style={styles.statusDotRow}>
      <View style={[styles.dot, { backgroundColor: statusColor(tone) }]} />
      <Text
        variant="footnote"
        tone="secondary"
        style={{ fontFamily: Fonts.textMedium, flexShrink: 1 }}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// A word on a tinted pill. On light themes the word is a deeper shade of its colour on a lighter
// tint, so 12 px text clears 4.5:1 against the pill.
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const color = statusColor(tone);
  const neutral = tone === 'neutral' || tone === 'muted';
  const light = Colors.scheme === 'light';
  const ink = neutral || !light ? color : mix(color, BRAND.iron, 0.15);
  const fill = neutral ? Colors.tint : withAlpha(color, light ? 0.1 : 0.14);
  return (
    <View style={[styles.pill, { backgroundColor: fill }]}>
      <Text style={[styles.pillText, { color: ink }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

// ---------- Numbers ----------

// A quiet row of numbers separated by hairlines, no cards. Labels are sentence case. With large
// text the numbers go two to a row instead of cutting their labels short.
export function StatStrip({
  items,
}: {
  // `spoken` replaces "value label" for screen readers when the short label needs more words.
  items: { value: string | number | null | undefined; label: string; spoken?: string; onPress?: () => void }[];
}) {
  const grid = useWindowDimensions().fontScale > 1.2 && items.length > 2;
  return (
    <View style={[styles.statStrip, grid && styles.statGrid]}>
      {items.map((item, i) => {
        const content = (
          <>
            <Text variant="stat" style={Tabular}>
              {item.value ?? '–'}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={2} style={{ fontFamily: Fonts.textMedium }}>
              {item.label}
            </Text>
          </>
        );
        const look = [styles.statItem, grid && styles.statItemGrid, (grid ? i % 2 === 1 : i > 0) && styles.statDivider];
        return item.onPress ? (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.spoken ?? `${item.value ?? 'No'} ${item.label}`}
            onPress={item.onPress}
            style={({ pressed }) => [look, pointer, pressed && { backgroundColor: Colors.tint }]}>
            {content}
          </Pressable>
        ) : (
          <View
            key={item.label}
            style={look}
            accessible
            accessibilityLabel={item.spoken ?? `${item.value ?? 'No'} ${item.label}`}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

// A thin bar for progress. Text-coloured unless it is the screen's main number. The fill grows
// with a transform, so no layout runs while it moves.
export function ProgressBar({
  progress,
  color,
  height = 4,
}: {
  // 0 to 1; more than 1 shows a full bar.
  progress: number;
  color?: string;
  height?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [share] = useState(() => new Animated.Value(0));
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  useEffect(() => {
    if (reduceMotion) share.setValue(p);
    else
      Animated.timing(share, {
        toValue: p,
        duration: Duration.enter,
        easing: Ease.standard,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
  }, [p, reduceMotion, share]);
  return (
    <View style={[styles.bar, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color ?? Colors.text,
          transformOrigin: 'left',
          transform: [{ scaleX: share }],
        }}
      />
    </View>
  );
}

// ---------- Motion ----------

// The first appearance of a card or group: up 8 and fade in, once, on mount. Only the first six are
// staggered. With reduced motion it only fades.
export function EnterUp({
  index = 0,
  children,
  style,
}: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(shown, {
      toValue: 1,
      duration: Duration.enter,
      delay: Math.min(index, 5) * 40,
      easing: Ease.enter,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [index, shown]);
  const rise = shown.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 8, 0] });
  return (
    <Animated.View style={[{ opacity: shown, transform: [{ translateY: rise }] }, style]}>{children}</Animated.View>
  );
}

// ---------- Loading ----------

// False until `ms` has passed, so fast loads show nothing instead of a flash of skeleton.
export function useDelayed(ms = 300) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return shown;
}

// Every skeleton on screen pulses together from one shared loop, which runs only while one shows.
const pulse = new Animated.Value(1);
const pulsing = { count: 0, loop: null as Animated.CompositeAnimation | null };

function joinPulse() {
  pulsing.count += 1;
  if (pulsing.count > 1) return;
  const half = { duration: Duration.pulse / 2, easing: Ease.standard, useNativeDriver: NATIVE_DRIVER };
  pulsing.loop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, ...half }),
      Animated.timing(pulse, { toValue: 1, ...half }),
    ]),
  );
  pulsing.loop.start();
}

function leavePulse() {
  pulsing.count -= 1;
  if (pulsing.count > 0) return;
  pulsing.loop?.stop();
  pulsing.loop = null;
  pulse.setValue(1);
}

// A placeholder block that gently pulses while the real thing loads (still with reduced motion).
export function Skeleton({
  width,
  height,
  radius = Radius.small,
  style,
}: {
  width?: ViewStyle['width'];
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    joinPulse();
    return leavePulse;
  }, [reduceMotion]);
  return (
    <Animated.View
      style={[
        { width: width ?? '100%', height, borderRadius: radius, backgroundColor: Colors.tint },
        { opacity: reduceMotion ? 0.75 : pulse },
        style,
      ]}
    />
  );
}

// Placeholder rows shaped like ListRows, inside a Group.
export function SkeletonRows({ count, avatar }: { count: number; avatar?: boolean }) {
  return (
    <Group>
      <View accessible accessibilityLabel="Loading">
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.row}>
            {avatar ? (
              <View style={styles.rowLeading}>
                <Skeleton width={44} height={44} radius={22} />
              </View>
            ) : null}
            <View style={[styles.rowBody, { minHeight: 64 }, i < count - 1 && styles.rowLine]}>
              <View style={{ flex: 1, gap: Spacing.two }}>
                <Skeleton width="45%" height={12} radius={6} />
                <Skeleton width="70%" height={10} radius={5} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Group>
  );
}

// ---------- Empty states ----------

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  action?: ReactNode;
  // One row inside a page ("Nothing booked today") instead of a centred block.
  compact?: boolean;
};

// Says what the state is, what will appear, and gives one action.
export function EmptyState({ icon, title, message, action, compact }: EmptyStateProps) {
  if (compact) {
    return (
      <Group>
        <ListRow title={title} subtitle={message} leading={<IconTile icon={icon} />} trailing={action} last />
      </Group>
    );
  }
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={Colors.textSecondary} />
      </View>
      <Text variant="headline" style={{ textAlign: 'center', marginTop: Spacing.three }}>
        {title}
      </Text>
      <Text variant="callout" tone="secondary" style={styles.emptyMessage}>
        {message}
      </Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = themed(() => ({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  textLink: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: Spacing.two,
  },
  iconPlain: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTonal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.tint,
    color: Colors.text,
    ...Type.body,
    paddingHorizontal: Spacing.three,
  },
  // The same box as `input` without the text styles, for the row that holds an icon and the field.
  inputBox: {
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: Colors.tint,
    paddingHorizontal: Spacing.three,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  inputBare: {
    flex: 1,
    alignSelf: 'stretch',
    color: Colors.text,
    ...Type.body,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.tight,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  searchInput: {
    flex: 1,
    alignSelf: 'stretch',
    color: Colors.text,
    ...Type.body,
  },
  segmented: {
    flexDirection: 'row',
    minHeight: 40,
    padding: SEGMENT_INSET,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  segmentPill: {
    position: 'absolute',
    top: SEGMENT_INSET,
    bottom: SEGMENT_INSET,
    left: SEGMENT_INSET,
    borderRadius: 10,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  // 44 high for the finger around a 50 x 30 track.
  toggleTarget: {
    minHeight: 44,
    minWidth: 50,
    justifyContent: 'center',
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 2,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    paddingVertical: Spacing.tight,
    paddingHorizontal: CARD_X,
    borderRadius: Radius.medium,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    paddingHorizontal: CARD_X,
    paddingVertical: CARD_Y,
    overflow: 'hidden',
  },
  hero: {
    paddingVertical: HERO_Y,
  },
  group: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: CARD_X,
  },
  rowLeading: {
    justifyContent: 'center',
    marginRight: Spacing.tight,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    paddingVertical: 10,
    paddingRight: CARD_X,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTrailing: {
    flexShrink: 1,
    maxWidth: '45%',
    alignItems: 'flex-end',
  },
  rowStatusBelow: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  rowLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 22,
  },
  // 44 high for the finger, drawn in the 22 of the header row.
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    marginVertical: -11,
    paddingLeft: Spacing.tight,
    paddingRight: Spacing.two,
    marginRight: -Spacing.two,
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
  },
  // The 44 buttons take only the 32 of the eyebrow line, so the title doesn't move down.
  pageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginRight: -10,
    marginVertical: -6,
  },
  pageActionsBeside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  shortcutCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  shortcutLabel: {
    fontFamily: Fonts.textMedium,
    textAlign: 'center',
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: Fonts.textMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  statStrip: {
    flexDirection: 'row',
  },
  statGrid: {
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  statItem: {
    flex: 1,
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  statItemGrid: {
    flex: 0,
    flexBasis: '50%',
  },
  statDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.border,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  bar: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.track,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.hero,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMessage: {
    textAlign: 'center',
    maxWidth: 320,
    marginTop: Spacing.two,
  },
  emptyAction: {
    minWidth: 200,
    marginTop: Spacing.four,
  },
}));
