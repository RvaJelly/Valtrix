import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { segmentOn, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, withAlpha } from '@/constants/theme';
import { dayMonth, weekdayLong, weekdayShort } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { dayFromKey } from '@/lib/zones';

// One day in the strip: its 'YYYY-MM-DD' key on the trainer's clock and how many open times it has
// (null while they are still loading).
export type StripDay = { key: string; count: number | null };

const PILL_WIDTH = 52;

// The days to book on, sideways, today first: weekday over day number, the chosen one raised like a
// segmented control's choice (never orange). A day with no open time is muted and can't be picked. On a
// wide window the days wrap, two weeks to a row, so 14 show without scrolling. `onNearEnd` asks for more
// days' times when the strip is scrolled close to its end.
export function DayStrip({
  days,
  value,
  onChange,
  onNearEnd,
}: {
  days: StripDay[];
  value: string | null;
  onChange: (key: string) => void;
  onNearEnd?: () => void;
}) {
  const wide = useWindowDimensions().width >= 768;
  const scroll = useRef<ScrollView>(null);
  const placed = useRef(false);
  const [atEnd, setAtEnd] = useState(false);

  const pills = days.map((d) => {
    const date = dayFromKey(d.key);
    const selected = d.key === value;
    const empty = d.count === 0;
    return (
      <Pressable
        key={d.key}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: empty }}
        accessibilityLabel={`${weekdayLong(date)} ${dayMonth(date)}, ${
          d.count == null ? 'loading times' : d.count === 0 ? 'no times' : d.count === 1 ? '1 time' : `${d.count} times`
        }`}
        disabled={empty}
        testID={`book-day-${d.key}`}
        onPress={() => {
          if (selected) return;
          haptic.select();
          onChange(d.key);
        }}
        onLayout={(e) => {
          // Opens scrolled to the chosen day, with the day before it in view.
          if (!selected || placed.current || wide) return;
          placed.current = true;
          const x = e.nativeEvent.layout.x;
          if (x > PILL_WIDTH * 3)
            scroll.current?.scrollTo({ x: Math.max(0, x - PILL_WIDTH - Spacing.gutter), animated: false });
        }}
        style={[styles.pill, wide && styles.pillWide, Platform.OS === 'web' && !empty && { cursor: 'pointer' }]}>
        {({ pressed }) => (
          <View
            style={[
              styles.pillInner,
              selected ? segmentOn() : pressed && !empty ? { backgroundColor: Colors.tintPressed } : null,
            ]}>
            <Text
              variant="footnote"
              tone={empty ? 'tertiary' : selected ? 'primary' : 'secondary'}
              style={{ fontFamily: Fonts.textMedium }}
              maxFontSizeMultiplier={1.3}>
              {weekdayShort(date)}
            </Text>
            <Text
              variant="callout"
              tone={empty ? 'tertiary' : 'primary'}
              style={[Tabular, { fontFamily: selected ? Fonts.textSemi : Fonts.textMedium }]}
              maxFontSizeMultiplier={1.3}>
              {date.getDate()}
            </Text>
          </View>
        )}
      </Pressable>
    );
  });

  if (wide) {
    return <View style={[styles.track, styles.wrap]}>{pills}</View>;
  }

  const behind = Colors.background;
  const fade = `linear-gradient(to right, ${withAlpha(behind, 0)}, ${behind})`;
  const fadeStyle = (
    Platform.OS === 'web' ? { backgroundImage: fade } : { experimental_backgroundImage: fade }
  ) as ViewStyle;
  return (
    <View style={styles.bleed}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const right = contentOffset.x + layoutMeasurement.width;
          setAtEnd(right >= contentSize.width - 2);
          if (right >= contentSize.width - PILL_WIDTH * 4) onNearEnd?.();
        }}
        contentContainerStyle={styles.bleedContent}>
        <View style={styles.track}>{pills}</View>
      </ScrollView>
      {atEnd ? null : <View pointerEvents="none" style={[styles.fade, fadeStyle]} />}
    </View>
  );
}

const styles = themed(() => ({
  bleed: {
    marginHorizontal: -Spacing.gutter,
  },
  bleedContent: {
    paddingHorizontal: Spacing.gutter,
  },
  // The segmented control's track: a tint fill holding the day pills.
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  pill: {
    width: PILL_WIDTH,
  },
  // Two weeks to a row on a wide window.
  pillWide: {
    width: `${100 / 14}%`,
  },
  pillInner: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    borderRadius: 10,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: Spacing.four,
  },
}));
