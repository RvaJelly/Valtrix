import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed, withAlpha } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

type Props<T extends string> = {
  options: Record<T, string>;
  value: T | null;
  onChange: (value: T | null) => void;
  // When true, tapping the selected chip clears it.
  allowClear?: boolean;
  // For a filter row: a first chip with this label ("All") that is selected when nothing else is,
  // and clears the choice.
  all?: string;
  // When true, chips wrap onto more lines instead of scrolling sideways.
  wrap?: boolean;
  // The colour behind a sideways row, for the fade at its right edge: the page by default, or
  // Colors.surface for a row inside a card.
  background?: string;
  // Each chip's test id is this followed by its key ("all" for the All chip).
  testIDPrefix?: string;
};

const FADE = 24;

export function Chips<T extends string>({
  options,
  value,
  onChange,
  allowClear,
  all,
  wrap,
  background,
  testIDPrefix,
}: Props<T>) {
  const scroll = useRef<ScrollView>(null);
  // Where the selected chip sits and how wide the row is, for the one scroll on mount.
  const layout = useRef({ placed: false, visible: 0, selected: null as { x: number; width: number } | null });
  const [rowWidth, setRowWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  function choose(next: T | null) {
    if (next !== value) haptic.select();
    onChange(next);
  }

  // Once both the row and the selected chip are laid out, scroll the chip into view if it starts
  // off screen, lined up with the page's text.
  function placeSelected() {
    const l = layout.current;
    if (l.placed || !l.visible || !l.selected) return;
    l.placed = true;
    const { x, width } = l.selected;
    if (x + width > l.visible - FADE) scroll.current?.scrollTo({ x: Math.max(0, x - Spacing.gutter), animated: false });
  }

  function onSelectedLayout(e: LayoutChangeEvent) {
    layout.current.selected = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
    placeSelected();
  }

  const items: { key: string; label: string; selected: boolean; next: T | null }[] = [
    ...(all ? [{ key: '', label: all, selected: value === null, next: null }] : []),
    ...(Object.keys(options) as T[]).map((key) => {
      const selected = key === value;
      return { key, label: options[key], selected, next: selected && allowClear ? null : key };
    }),
  ];
  const chips = items.map((item) => (
    <Pressable
      key={item.key}
      accessibilityRole="button"
      accessibilityState={{ selected: item.selected }}
      onPress={() => choose(item.next)}
      onLayout={item.selected && !wrap ? onSelectedLayout : undefined}
      testID={testIDPrefix ? `${testIDPrefix}${item.key || 'all'}` : undefined}
      style={styles.target}>
      {({ pressed }) => (
        <View
          style={[styles.chip, pressed && { backgroundColor: Colors.tintPressed }, item.selected && styles.selected]}>
          <Text variant="callout" style={[styles.text, item.selected && { color: Colors.background }]}>
            {item.label}
          </Text>
        </View>
      )}
    </Pressable>
  ));
  if (wrap) return <View style={[styles.row, styles.wrap]}>{chips}</View>;

  // A sideways row runs to the screen edges (pages and cards both pad 20), so a chip cut by the
  // edge reads as "more this way"; a soft fade on the right says the same until the end is reached.
  const overflows = contentWidth > rowWidth + 1;
  const behind = background ?? Colors.background;
  const fade = `linear-gradient(to right, ${withAlpha(behind, 0)}, ${behind})`;
  const fadeStyle = (
    Platform.OS === 'web' ? { backgroundImage: fade } : { experimental_backgroundImage: fade }
  ) as ViewStyle;
  return (
    <View
      style={styles.bleed}
      onLayout={(e) => {
        layout.current.visible = e.nativeEvent.layout.width;
        setRowWidth(e.nativeEvent.layout.width);
        placeSelected();
      }}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          setAtEnd(contentOffset.x + layoutMeasurement.width >= contentSize.width - 2);
        }}
        contentContainerStyle={[styles.row, styles.bleedContent]}>
        {chips}
      </ScrollView>
      {overflows && !atEnd ? <View pointerEvents="none" style={[styles.fade, fadeStyle]} /> : null}
    </View>
  );
}

// Selected chips are inverted (text-coloured), not orange: orange is for the one main action.
// Each chip is drawn 36 high inside a 44 high touch target (hitSlop does nothing on the web).
const styles = themed(() => ({
  row: {
    columnGap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bleed: {
    marginHorizontal: -Spacing.gutter,
  },
  bleedContent: {
    paddingHorizontal: Spacing.gutter,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: FADE,
  },
  target: {
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  selected: {
    backgroundColor: Colors.text,
  },
  text: {
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
}));
