import { useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { Sheet } from '@/components/sheet';
import { Button, ErrorText, Group, IconButton, ListRow, Text, TextLink } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import type { HoursRange } from '@/lib/booking-rules';
import { hoursProblem } from '@/lib/hours';
import { weekdayName } from '@/lib/repeat-rules';

type Range = { from: string; to: string };

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const clock = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

// Every 15 minutes: starts from 05:00 to 22:45, ends after the start up to 24:00. A saved time off
// that grid is kept in the list, so it shows as chosen.
function timeOptions(first: number, last: number, keep: string): Record<string, string> {
  const times: string[] = [];
  for (let t = first; t <= last; t += 15) times.push(clock(t));
  if (keep && !times.includes(keep)) times.push(keep);
  times.sort();
  return Object.fromEntries(times.map((t) => [t, t]));
}

// A new set of hours: 06:00 to 10:00 on an empty day, else the next free 2 hours after the last ones,
// or null when the day has no room left.
function nextFree(ranges: Range[]): Range | null {
  if (!ranges.length) return { from: '06:00', to: '10:00' };
  const taken = ranges.map((r) => [minutesOf(r.from), minutesOf(r.to)] as const).sort((a, b) => a[0] - b[0]);
  const end = Math.max(...taken.map((r) => r[1]));
  const free = (from: number, to: number) => taken.every(([a, b]) => to <= a || from >= b);
  for (const start of [end + 60, end]) {
    const s = Math.ceil(start / 15) * 15;
    if (s <= 22 * 60 + 45 && free(s, Math.min(s + 120, 1440)))
      return { from: clock(s), to: clock(Math.min(s + 120, 1440)) };
  }
  for (let s = 5 * 60; s <= 22 * 60 + 45; s += 15) {
    if (free(s, s + 15)) {
      let e = s + 15;
      while (e < Math.min(s + 120, 1440) && free(s, e + 15)) e += 15;
      return { from: clock(s), to: clock(e) };
    }
  }
  return null;
}

// One weekday's booking hours: each set as a row, opened to pick its start and end; Add hours;
// Copy to every weekday. The page tidies them (sorted, touching ones joined) when the sheet closes.
export function HoursSheet({
  day,
  ranges,
  onChange,
  onCopy,
  onClose,
}: {
  // 1 Monday … 7 Sunday, or null when the sheet is closed.
  day: HoursRange['day'] | null;
  ranges: Range[];
  onChange: (ranges: Range[]) => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [shownDay, setShownDay] = useState(day);
  if (day !== null && day !== shownDay) {
    setShownDay(day);
    setOpen(null);
  }
  const problem = day ? hoursProblem(ranges.map((r) => ({ day, ...r }))) : null;
  const next = nextFree(ranges);

  function setRange(i: number, patch: Partial<Range>) {
    onChange(
      ranges.map((r, j) => {
        if (j !== i) return r;
        const changed = { ...r, ...patch };
        // A start moved past the end takes the end along, an hour later (24:00 at most).
        if (patch.from && minutesOf(changed.to) <= minutesOf(changed.from)) {
          changed.to = clock(Math.min(minutesOf(changed.from) + 60, 1440));
        }
        return changed;
      }),
    );
  }

  function remove(i: number) {
    setOpen(null);
    onChange(ranges.filter((_, j) => j !== i));
  }

  function add() {
    if (!next) return;
    setOpen(ranges.length);
    onChange([...ranges, next]);
  }

  return (
    <Sheet visible={day !== null} onClose={onClose} title={shownDay ? weekdayName(shownDay) : undefined}>
      {ranges.length ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          {ranges.map((r, i) => (
            <View key={i}>
              <ListRow
                title={`${r.from} to ${r.to}`}
                titleStyle={Tabular}
                onPress={() => setOpen(open === i ? null : i)}
                chevron={false}
                accessibilityLabel={`${r.from} to ${r.to}. ${open === i ? 'Close' : 'Change the times'}`}
                accessibilityState={{ expanded: open === i }}
                trailing={
                  <IconButton
                    icon="trash-outline"
                    tone="secondary"
                    label="Remove these hours"
                    onPress={() => remove(i)}
                    testID={`hours-remove-${i}`}
                  />
                }
                last={i === ranges.length - 1 && open !== i}
                testID={`hours-range-${i}`}
              />
              {open === i ? (
                <View style={{ gap: Spacing.two, paddingHorizontal: Spacing.gutter, paddingBottom: Spacing.three }}>
                  <Text variant="label" tone="secondary">
                    From
                  </Text>
                  <Chips
                    options={timeOptions(5 * 60, 22 * 60 + 45, r.from)}
                    value={r.from}
                    onChange={(v) => v && setRange(i, { from: v })}
                    background={Colors.tint}
                    testIDPrefix="hours-from-"
                  />
                  <Text variant="label" tone="secondary">
                    To
                  </Text>
                  <Chips
                    // Remounted with a new start, so the row opens at the chosen end again.
                    key={r.from}
                    options={timeOptions(minutesOf(r.from) + 15, 1440, r.to)}
                    value={r.to}
                    onChange={(v) => v && setRange(i, { to: v })}
                    background={Colors.tint}
                    testIDPrefix="hours-to-"
                  />
                </View>
              ) : null}
            </View>
          ))}
        </Group>
      ) : (
        <Text variant="body" tone="secondary">
          Closed. Clients can’t book this day.
        </Text>
      )}
      <ErrorText testID="hours-problem">{problem}</ErrorText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three }}>
        <Button
          title="Add hours"
          variant="ghost"
          size="medium"
          icon="add"
          onPress={add}
          disabled={!next}
          testID="hours-add"
        />
        {ranges.length ? <TextLink label="Copy to every weekday" onPress={onCopy} testID="hours-copy" /> : null}
      </View>
      <Button title="Done" variant="secondary" onPress={onClose} testID="hours-done" />
    </Sheet>
  );
}
