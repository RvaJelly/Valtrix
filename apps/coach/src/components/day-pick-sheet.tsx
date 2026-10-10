import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { IconButton, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { longDate, monthYear } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { dayKey } from '@/lib/sessions';
import { dayFromKey } from '@/lib/zones';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthStart(key: string) {
  const d = dayFromKey(key);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

// The day whose month the sheet opens on: the chosen day, else today, kept between `from` and `to`.
function opensOn(value: string | null, from: string, to: string) {
  const day = value ?? dayKey(new Date());
  return day < from ? from : day > to ? to : day;
}

// A month to pick one day from ('YYYY-MM-DD'), between `from` and `to`. Used for Until on a repeat,
// "Paid on" another day, and a pack's end.
export function DayPickSheet({
  visible,
  title,
  from,
  to,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  from: string;
  to: string;
  value: string | null;
  onPick: (day: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() => monthStart(opensOn(value, from, to)));
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setMonth(monthStart(opensOn(value, from, to)));
  }

  const first = monthStart(from);
  const last = monthStart(to);
  const canBack = month > first;
  const canOn = month < last;
  // Monday-first grid: blanks before the 1st, then each day.
  const lead = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const today = dayKey(new Date());

  function move(by: number) {
    haptic.select();
    setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1, 12));
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.head}>
        <IconButton
          icon="chevron-back"
          variant="tonal"
          label="Previous month"
          onPress={() => move(-1)}
          disabled={!canBack}
        />
        <Text variant="headline" style={{ flex: 1, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {monthYear(month)}
        </Text>
        <IconButton
          icon="chevron-forward"
          variant="tonal"
          label="Next month"
          onPress={() => move(1)}
          disabled={!canOn}
        />
      </View>
      <View>
        <View style={styles.week}>
          {LETTERS.map((l, i) => (
            <Text key={i} variant="footnote" tone="tertiary" style={styles.letter} importantForAccessibility="no">
              {l}
            </Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={styles.week}>
            {cells.slice(row * 7, row * 7 + 7).map((key, i) => {
              if (!key) return <View key={i} style={styles.cell} />;
              const allowed = key >= from && key <= to;
              const chosen = key === value;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={longDate(dayFromKey(key))}
                  accessibilityState={{ selected: chosen, disabled: !allowed }}
                  disabled={!allowed}
                  onPress={() => {
                    haptic.select();
                    onPick(key);
                  }}
                  testID={`day-${key}`}
                  style={[styles.cell, allowed && Platform.OS === 'web' ? { cursor: 'pointer' as const } : null]}>
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.dot,
                        key === today && styles.today,
                        pressed && { backgroundColor: Colors.tintPressed },
                        chosen && { backgroundColor: Colors.text, borderColor: Colors.text },
                      ]}>
                      <Text
                        variant="callout"
                        tone={allowed ? 'primary' : 'tertiary'}
                        style={[
                          Tabular,
                          { fontFamily: chosen ? Fonts.textSemi : Fonts.text },
                          chosen && { color: Colors.background },
                          !allowed && { opacity: 0.5 },
                        ]}>
                        {Number(key.slice(8))}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const styles = themed(() => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  week: {
    flexDirection: 'row',
  },
  letter: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: Spacing.one,
  },
  cell: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  today: {
    borderColor: Colors.borderStrong,
  },
}));
