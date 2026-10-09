import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { formatGrams, formatKcal, formatNumber, type Targets, type Totals } from '@/lib/food';

type Props = {
  totals: Totals;
  // A trainer's targets, or null when nobody set any.
  targets: Targets | null;
};

// Calories eaten against the daily target in a ring, with protein, carbs and fat below.
export function DaySummary({ totals, targets }: Props) {
  const target = targets?.kcal ?? null;
  const left = target === null ? null : Math.round(target) - Math.round(totals.kcal);
  const over = left !== null && left < 0;
  const summary =
    target === null
      ? `${formatKcal(totals.kcal)} eaten. No daily target set.`
      : `${formatKcal(totals.kcal)} eaten of ${formatKcal(target)}. ${formatKcal(Math.abs(left!))} ${over ? 'over' : 'left'}.`;

  return (
    <View style={styles.card}>
      <View style={styles.top} accessible accessibilityLabel={summary}>
        <Ring
          size={128}
          thickness={12}
          progress={target ? totals.kcal / target : 0}
          color={over ? Colors.danger : Colors.accent}
          track={Colors.surfaceRaised}>
          <Text style={styles.big}>{formatNumber(left === null ? totals.kcal : Math.abs(left))}</Text>
          <Text style={styles.small}>{left === null ? 'kcal eaten' : over ? 'kcal over' : 'kcal left'}</Text>
        </Ring>
        <View style={{ flex: 1, gap: Spacing.three }}>
          <View>
            <Text style={styles.label}>Eaten</Text>
            <Text style={styles.value}>{formatKcal(totals.kcal)}</Text>
          </View>
          <View>
            <Text style={styles.label}>Daily target</Text>
            <Text style={[styles.value, target === null && { color: Colors.textSecondary }]}>
              {target === null ? 'Not set yet' : formatKcal(target)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.macros}>
        <MacroBar label="Protein" grams={totals.protein} target={targets?.protein_g ?? null} />
        <MacroBar label="Carbs" grams={totals.carbs} target={targets?.carbs_g ?? null} />
        <MacroBar label="Fat" grams={totals.fat} target={targets?.fat_g ?? null} />
      </View>
    </View>
  );
}

function MacroBar({ label, grams, target }: { label: string; grams: number; target: number | null }) {
  const share = target ? Math.min(1, grams / target) : 0;
  return (
    <View
      style={{ flex: 1, gap: Spacing.one }}
      accessible
      accessibilityLabel={`${label}: ${formatGrams(grams)}${target ? ` of ${target} g` : ''}`}>
      <Text style={styles.label}>{label}</Text>
      {/* On a narrow phone the target moves under the amount instead of being cut off. */}
      <View style={styles.macroValueRow}>
        <Text style={styles.macroValue}>{formatGrams(grams).replace(' g', '')}</Text>
        <Text style={styles.macroTarget}>{target ? `/ ${target} g` : 'g'}</Text>
      </View>
      {target ? (
        <View style={styles.bar}>
          <View
            style={[
              styles.fill,
              { width: `${share * 100}%` },
              grams > target * 1.05 && { backgroundColor: Colors.danger },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

type RingProps = PropsWithChildren<{
  size: number;
  thickness: number;
  // 0 to 1; anything above 1 shows a full ring.
  progress: number;
  color: ColorValue;
  track: ColorValue;
}>;

// A progress ring drawn with plain views, so it works the same on phones and the web.
// Each half of the ring is a half-coloured circle turned into place inside a clip.
function Ring({ size, thickness, progress, color, track, children }: RingProps) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const half = size / 2;
  const circle = {
    position: 'absolute' as const,
    top: 0,
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: thickness,
    borderColor: 'transparent',
  };
  const clip = { position: 'absolute' as const, top: 0, width: half, height: size, overflow: 'hidden' as const };
  return (
    <View style={{ width: size, height: size }}>
      <View style={[circle, { left: 0, borderColor: track }]} />
      {p > 0 ? (
        <View style={[clip, { left: half }]}>
          <View
            style={[
              circle,
              {
                left: -half,
                borderLeftColor: color,
                borderBottomColor: color,
                transform: [{ rotate: `${45 + Math.min(p, 0.5) * 360}deg` }],
              },
            ]}
          />
        </View>
      ) : null}
      {p > 0.5 ? (
        <View style={[clip, { left: 0 }]}>
          <View
            style={[
              circle,
              {
                left: 0,
                borderTopColor: color,
                borderRightColor: color,
                transform: [{ rotate: `${45 + (p - 0.5) * 360}deg` }],
              },
            ]}
          />
        </View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = themed(() => ({
  card: {
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  big: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  small: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  value: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  macros: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  macroValueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 3,
  },
  macroValue: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  macroTarget: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  bar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
}));
