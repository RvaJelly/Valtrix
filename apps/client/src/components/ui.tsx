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
  Platform,
  Pressable,
  Text as RNText,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { VMark } from '@/components/v-mark';
import { Duration, Ease, Spring } from '@/constants/motion';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type, withAlpha, type TypeName } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

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
  const base = nested
    ? [variant ? Type[variant] : null, tone ? { color: toneColor(tone) } : null]
    : [Type[variant ?? 'body'], { color: toneColor(tone ?? 'primary') }];
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
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
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
    <Animated.View style={[pressStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        testID={testID}
        onPress={onPress}
        disabled={inactive}
        hitSlop={size === 'small' ? 4 : undefined}
        onPressIn={() => {
          if (!reduceMotion) scale.set(withSpring(0.98, Spring.press));
        }}
        onPressOut={() => scale.set(withSpring(1, Spring.press))}
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

// A round icon-only button. `label` is what screen readers say, so it is required.
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  disabled,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'plain' | 'tonal';
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
      <Ionicons name={icon} size={tonal ? 20 : 24} color={Colors.text} />
    </Pressable>
  );
}

// ---------- Inputs ----------

type FieldProps = TextInputProps & { label: string; error?: string; optional?: boolean; icon?: IconName };

// A labelled text box. The label stays above the field; focus and errors show on its border.
export function TextField({ label, error, optional, icon, style, onFocus, onBlur, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? Colors.danger : focused ? Colors.accent : 'transparent';
  const input = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={Colors.textTertiary}
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
        <View style={[styles.input, styles.inputRow, { borderColor: border }]}>
          <Ionicons name={icon} size={18} color={Colors.textTertiary} />
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
      <Ionicons name="search-outline" size={18} color={Colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={Colors.textTertiary}
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

// A card: the warm surface colour, no border, no shadow. Never put a card inside a card.
export function Card({
  children,
  style,
  hero,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  // The one big card at the top of a screen: rounder and roomier.
  hero?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>) {
  const { hovered, hover } = useHover();
  const look = [styles.card, hero && styles.hero, style];
  if (!onPress) return <View style={look}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      {...hover}
      style={[look, pointer]}>
      {({ pressed }) => (
        <>
          {pressed || hovered ? <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tint }]} /> : null}
          {children}
        </>
      )}
    </Pressable>
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
};

// A row in a Group: leading, title and subtitle, trailing, chevron. The hairline under it starts
// where the title starts.
export function ListRow({
  title,
  subtitle,
  leading,
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
}: ListRowProps) {
  const { hovered, hover } = useHover();
  const showChevron = chevron ?? !!onPress;
  const content = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={[styles.rowBody, { minHeight: compact ? 56 : 64 }, !last && styles.rowLine]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle" tone={titleTone} numberOfLines={titleLines} style={titleStyle}>
            {title}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>
        {trailing}
        {showChevron ? <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      onPress={onPress}
      {...hover}
      style={({ pressed }) => [styles.row, pointer, (pressed || hovered) && { backgroundColor: Colors.tint }]}>
      {content}
    </Pressable>
  );
}

// A titled block of a page: an uppercase label and maybe one action on the right.
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
            hitSlop={12}
            style={[styles.sectionAction, pointer]}>
            {({ pressed }) => (
              <>
                <Text variant="callout" tone={pressed ? 'secondary' : 'primary'} style={{ fontFamily: Fonts.textSemi }}>
                  {action.label}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
              </>
            )}
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// The top of a tab screen: a small eyebrow line, a big uppercase title and icon buttons on the right.
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
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, gap: Spacing.one }}>
        {brand || eyebrow ? (
          <View style={styles.eyebrow}>
            {brand ? <VMark height={14} /> : null}
            {eyebrow ? (
              <Text variant="label" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {eyebrow}
              </Text>
            ) : null}
          </View>
        ) : null}
        {onTitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel}
            onPress={onTitlePress}
            style={[{ alignSelf: 'flex-start' }, pointer]}>
            {heading}
          </Pressable>
        ) : (
          heading
        )}
      </View>
      {actions ? <View style={styles.pageActions}>{actions}</View> : null}
    </View>
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
      <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const color = statusColor(tone);
  const neutral = tone === 'neutral' || tone === 'muted';
  return (
    <View style={[styles.pill, { backgroundColor: neutral ? Colors.tint : withAlpha(color, 0.14) }]}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

// ---------- Numbers ----------

// A quiet row of numbers separated by hairlines, no cards.
export function StatStrip({
  items,
}: {
  items: { value: string | number | null | undefined; label: string; onPress?: () => void }[];
}) {
  return (
    <View style={styles.statStrip}>
      {items.map((item, i) => {
        const content = (
          <>
            <Text variant="stat" style={Tabular}>
              {item.value ?? '–'}
            </Text>
            <Text variant="label" tone="secondary" numberOfLines={1}>
              {item.label}
            </Text>
          </>
        );
        const look = [styles.statItem, i > 0 && styles.statDivider];
        return item.onPress ? (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={`${item.value ?? 'No'} ${item.label}`}
            onPress={item.onPress}
            style={({ pressed }) => [look, pointer, pressed && { backgroundColor: Colors.tint }]}>
            {content}
          </Pressable>
        ) : (
          <View key={item.label} style={look} accessible accessibilityLabel={`${item.value ?? 'No'} ${item.label}`}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

// A thin bar for progress. Text-coloured unless it is the screen's main number.
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
  const share = useSharedValue(0);
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  useEffect(() => {
    share.set(reduceMotion ? p : withTiming(p, { duration: 300, easing: Ease.standard }));
  }, [p, reduceMotion, share]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${share.get() * 100}%` }));
  return (
    <View style={[styles.bar, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color ?? Colors.text }, fillStyle]} />
    </View>
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

// A placeholder block that gently pulses while the real thing loads.
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
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      opacity.set(0.75);
      return;
    }
    const half = { duration: Duration.pulse / 2, easing: Easing.inOut(Easing.ease) };
    opacity.set(withRepeat(withSequence(withTiming(0.55, half), withTiming(1, half)), -1));
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[{ width: width ?? '100%', height, borderRadius: radius, backgroundColor: Colors.tint }, pulse, style]}
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
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.tint,
    color: Colors.text,
    ...Type.body,
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
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.gutter,
    overflow: 'hidden',
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
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
    paddingLeft: Spacing.three,
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
    paddingRight: Spacing.three,
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
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 16,
  },
  pageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginRight: -Spacing.two,
    marginTop: -2,
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
  statItem: {
    flex: 1,
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
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
