import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { dayMonthShort } from '@/lib/format';

// A small line chart drawn with plain Views (lines are thin rotated boxes), so it works the
// same on Android, iPhone and the web without a drawing library. The line and its dots are in the
// text colour: the accent belongs to the one main action on the screen.

export type LinePoint = { day: string; value: number }; // value already in the unit shown

type LineChartProps = {
  // Oldest first.
  points: LinePoint[];
  height?: number;
  // Labels on the y axis.
  format: (value: number) => string;
  // A dashed line, like a goal.
  target?: number | null;
  // What a screen reader says, e.g. 'Body weight from 82.5 kg to 79.9 kg'.
  accessibilityLabel: string;
};

const GUTTER = 44;
const INSET = 4;

// Noon UTC, so a day is the same moment wherever the phone is.
function dayTime(day: string) {
  return Date.parse(`${day}T12:00:00Z`);
}

// '9 Oct', from the day itself (local noon), whatever the phone's time zone.
function shortDate(day: string) {
  return dayMonthShort(new Date(`${day}T12:00:00`));
}

function isoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

// More than 60 points: each week (Monday to Sunday) becomes its average, drawn on its middle
// day. The last week keeps its own points, so the newest value is shown as it is.
function thinned(points: LinePoint[]): LinePoint[] {
  if (points.length <= 60) return points;
  const weekOf = (day: string) => {
    const time = dayTime(day);
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    return isoDay(time - weekday * 86_400_000);
  };
  const lastWeek = weekOf(points[points.length - 1].day);
  const weeks = new Map<string, { sum: number; count: number }>();
  const recent: LinePoint[] = [];
  for (const p of points) {
    const week = weekOf(p.day);
    if (week === lastWeek) {
      recent.push(p);
      continue;
    }
    const w = weeks.get(week) ?? { sum: 0, count: 0 };
    w.sum += p.value;
    w.count += 1;
    weeks.set(week, w);
  }
  const averaged = [...weeks.entries()].map(([week, w]) => ({
    day: isoDay(dayTime(week) + 3 * 86_400_000),
    value: w.sum / w.count,
  }));
  return [...averaged, ...recent];
}

export function LineChart({ points, height = 160, format, target, accessibilityLabel }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const shown = thinned(points.filter((p) => Number.isFinite(p.value)));
  const plotWidth = Math.max(0, width - INSET * 2);
  const plotHeight = Math.max(1, height - INSET * 2);

  const values = shown.map((p) => p.value);
  if (target != null && Number.isFinite(target)) values.push(target);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || Math.max(1, Math.abs(max) * 0.05);
  const pad = span * 0.1;
  const lo = min - pad;
  const hi = max + pad;
  const yOf = (value: number) => INSET + ((hi - value) / (hi - lo)) * plotHeight;

  const first = shown.length ? dayTime(shown[0].day) : 0;
  const last = shown.length ? dayTime(shown[shown.length - 1].day) : 0;
  const xOf = (day: string) =>
    last === first ? INSET + plotWidth / 2 : INSET + ((dayTime(day) - first) / (last - first)) * plotWidth;
  const xy = shown.map((p) => ({ x: xOf(p.day), y: yOf(p.value) }));

  // Three grid lines: top, middle and bottom of the plot.
  const grid = [hi - pad / 2, (hi + lo) / 2, lo + pad / 2].map((value) => ({ value, y: yOf(value) }));
  const dashes = target != null && Number.isFinite(target) && width > 0 ? Math.floor(plotWidth / 10) : 0;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ gap: Spacing.one }}>
      <View
        style={[styles.frame, { height }]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        <View style={styles.gutter}>
          {shown.length
            ? grid.map((g, i) => (
                <Text
                  key={`label-${i}`}
                  tone="secondary"
                  style={[styles.label, { top: g.y - 8 }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}>
                  {format(g.value)}
                </Text>
              ))
            : null}
        </View>
        <View style={styles.plot} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
          {width > 0 && shown.length ? (
            <>
              {grid.map((g, i) => (
                <View key={`grid-${i}`} style={[styles.grid, { top: g.y }]} />
              ))}
              {Array.from({ length: dashes }, (_, i) => (
                <View key={`dash-${i}`} style={[styles.dash, { left: INSET + i * 10, top: yOf(target ?? 0) - 1 }]} />
              ))}
              {xy.slice(1).map((b, i) => {
                const a = xy[i];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                return (
                  <View
                    key={`line-${i}`}
                    style={[
                      styles.line,
                      {
                        width: length,
                        left: (a.x + b.x) / 2 - length / 2,
                        top: (a.y + b.y) / 2 - 1,
                        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                      },
                    ]}
                  />
                );
              })}
              {xy.map((p, i) =>
                xy.length <= 30 || i === xy.length - 1 ? (
                  <View key={`dot-${i}`} style={[styles.dot, { left: p.x - 3, top: p.y - 3 }]} />
                ) : null,
              )}
            </>
          ) : null}
          {!shown.length ? (
            <Text variant="footnote" tone="secondary" style={styles.empty}>
              Nothing logged yet.
            </Text>
          ) : null}
        </View>
      </View>
      {shown.length ? (
        <View style={styles.dates} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text variant="footnote" tone="secondary" maxFontSizeMultiplier={1.3}>
            {shortDate(shown[0].day)}
          </Text>
          {shown.length > 1 && last !== first ? (
            <Text variant="footnote" tone="secondary" maxFontSizeMultiplier={1.3}>
              {shortDate(shown[shown.length - 1].day)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  frame: {
    flexDirection: 'row',
  },
  gutter: {
    width: GUTTER,
  },
  label: {
    ...Tabular,
    position: 'absolute',
    left: 0,
    right: Spacing.one,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'right',
  },
  plot: {
    flex: 1,
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.border,
  },
  dash: {
    position: 'absolute',
    width: 6,
    height: 2,
    backgroundColor: Colors.textTertiary,
  },
  line: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.text,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.text,
  },
  empty: {
    marginTop: Spacing.five,
    textAlign: 'center',
  },
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: GUTTER,
  },
}));
