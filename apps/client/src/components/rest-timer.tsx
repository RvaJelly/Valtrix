import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, ProgressBar, Text } from '@/components/ui';
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { LATE_MS, useCountdown } from '@/lib/rest-timer';

type RestTimerProps = {
  endsAt: number;
  // Seconds, for the bar.
  total: number;
  sound: boolean;
  // +15 s
  onAdd: () => void;
  // Skip, the silent clear of a rest that ended while the phone slept, and the end of "Rest over".
  onSkip: () => void;
  onToggleSound: () => void;
  // Once, at zero, on time: the screen buzzes, beeps and announces it.
  onDone: () => void;
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// The rest between sets, fixed above the workout's footer: a calm countdown, a text-coloured bar and
// two quiet buttons. Nothing here is orange; the screen's one orange button stays below it.
export function RestTimer({ endsAt, total, sound, onAdd, onSkip, onToggleSound, onDone }: RestTimerProps) {
  const left = useCountdown(endsAt) ?? 0;
  const over = left === 0;
  const done = useEffectEvent(onDone);
  const skip = useEffectEvent(onSkip);

  // At zero: buzz once and show "Rest over" for 3 s. When the end is noticed late (the phone
  // or the browser tab was asleep), it is cleared without a sound instead.
  useEffect(() => {
    if (!over) return;
    if (Date.now() - endsAt > LATE_MS) {
      skip();
      return;
    }
    done();
    const timer = setTimeout(() => skip(), 3000);
    return () => clearTimeout(timer);
  }, [over, endsAt]);

  const share = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <View style={styles.bar} testID="rest-timer">
      <View style={styles.inner}>
        <View style={styles.row}>
          {/* Not a live region: it changes every second, and a screen reader would read out
              every tick. The end is announced once, by the screen (announceForAccessibility). */}
          {over ? (
            <Text variant="headline" style={styles.time}>
              Rest over
            </Text>
          ) : (
            <View style={[styles.time, styles.countdown]}>
              <Text variant="callout" tone="secondary">
                Rest
              </Text>
              <Text style={styles.clock} maxFontSizeMultiplier={1.3}>
                {clock(left)}
              </Text>
            </View>
          )}
          {over ? null : (
            <>
              <Button
                title="+15 s"
                variant="secondary"
                size="small"
                accessibilityLabel="Add 15 seconds"
                testID="rest-add"
                onPress={onAdd}
              />
              <Button
                title="Skip"
                variant="secondary"
                size="small"
                accessibilityLabel="Skip rest"
                testID="rest-skip"
                onPress={onSkip}
              />
            </>
          )}
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Rest sound"
            accessibilityState={{ checked: sound }}
            onPress={onToggleSound}
            style={({ pressed }) => [styles.bell, pressed && { backgroundColor: Colors.tint }]}>
            <Ionicons
              name={sound ? 'notifications-outline' : 'notifications-off-outline'}
              size={22}
              color={sound ? Colors.text : Colors.textTertiary}
            />
          </Pressable>
        </View>
        <ProgressBar progress={share} />
      </View>
    </View>
  );
}

const styles = themed(() => ({
  bar: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.tight,
    paddingBottom: Spacing.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  inner: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  time: {
    flex: 1,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  clock: {
    ...Tabular,
    fontFamily: Fonts.displaySemi,
    fontSize: 28,
    lineHeight: 32,
    color: Colors.text,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
