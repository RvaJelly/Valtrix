import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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

// The rest between sets, fixed above the workout's footer.
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
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text style={[styles.time, over && { color: Colors.accentText }]} accessibilityLiveRegion="polite">
            {over ? 'Rest over' : `Rest ${clock(left)}`}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${share * 100}%` }]} />
          </View>
        </View>
        {over ? null : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add 15 seconds"
              testID="rest-add"
              onPress={onAdd}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <Text style={styles.buttonText}>+15 s</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip rest"
              testID="rest-skip"
              onPress={onSkip}
              style={({ pressed }) => [styles.button, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <Text style={styles.buttonText}>Skip</Text>
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Rest sound"
          accessibilityState={{ checked: sound }}
          onPress={onToggleSound}
          style={({ pressed }) => [styles.bell, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Ionicons
            name={sound ? 'notifications' : 'notifications-off-outline'}
            size={22}
            color={sound ? Colors.accentText : Colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  bar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  inner: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  time: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  track: {
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
  button: {
    minHeight: 48,
    minWidth: 60,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
