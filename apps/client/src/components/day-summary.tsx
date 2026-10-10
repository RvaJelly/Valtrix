import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { Card, EnterUp, ProgressBar, Text } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { formatGrams, formatKcal, formatNumber, type Targets, type Totals } from '@/lib/food';

type Props = {
  totals: Totals;
  // A trainer's targets, or null when nobody set any.
  targets: Targets | null;
};

// Calories eaten against the daily target in a ring, with protein, carbs and fat below. The ring
// is the screen's main progress, so it is the one orange mark; the macro bars are text-coloured.
export function DaySummary({ totals, targets }: Props) {
  const target = targets?.kcal ?? null;
  const left = target === null ? null : Math.round(target) - Math.round(totals.kcal);
  const over = left !== null && left < 0;
  const summary =
    target === null
      ? `${formatKcal(totals.kcal)} eaten. No daily target set.`
      : `${formatKcal(totals.kcal)} eaten of ${formatKcal(target)}. ${formatKcal(Math.abs(left!))} ${over ? 'over' : 'left'}.`;

  return (
    <EnterUp>
      <Card hero style={{ gap: Spacing.four }}>
        <View style={styles.top} accessible accessibilityLabel={summary}>
          <Ring
            size={136}
            thickness={10}
            progress={target ? totals.kcal / target : 0}
            color={over ? Colors.warning : Colors.accent}
            track={Colors.track}>
            <Text variant="stat" style={Tabular}>
              {formatNumber(left === null ? totals.kcal : Math.abs(left))}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {left === null ? 'kcal eaten' : over ? 'kcal over' : 'kcal left'}
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: Spacing.three }}>
            {target !== null ? (
              <View style={{ gap: 2 }}>
                <Text variant="label" tone="secondary">
                  Eaten
                </Text>
                <Text variant="headline" style={Tabular}>
                  {formatKcal(totals.kcal)}
                </Text>
              </View>
            ) : null}
            <View style={{ gap: 2 }}>
              <Text variant="label" tone="secondary">
                Target
              </Text>
              {target === null ? (
                <Text variant="callout" tone="secondary">
                  Not set yet
                </Text>
              ) : (
                <Text variant="headline" style={Tabular}>
                  {formatKcal(target)}
                </Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.macros}>
          <MacroBar label="Protein" grams={totals.protein} target={targets?.protein_g ?? null} />
          <MacroBar label="Carbs" grams={totals.carbs} target={targets?.carbs_g ?? null} />
          <MacroBar label="Fat" grams={totals.fat} target={targets?.fat_g ?? null} />
        </View>
      </Card>
    </EnterUp>
  );
}

function MacroBar({ label, grams, target }: { label: string; grams: number; target: number | null }) {
  return (
    <View
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${label}: ${formatGrams(grams)}${target ? ` of ${target} g` : ''}`}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      {/* On a narrow phone the target moves under the amount instead of being cut off. */}
      <View style={styles.macroValueRow}>
        <Text variant="rowTitle" style={Tabular}>
          {formatGrams(grams).replace(' g', '')}
        </Text>
        <Text variant="footnote" tone="secondary" style={Tabular}>
          {target ? `/ ${target} g` : 'g'}
        </Text>
      </View>
      {target ? (
        <View style={{ marginTop: Spacing.two }}>
          <ProgressBar progress={grams / target} color={grams > target * 1.05 ? Colors.warning : Colors.text} />
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
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: Spacing.one,
  },
}));
