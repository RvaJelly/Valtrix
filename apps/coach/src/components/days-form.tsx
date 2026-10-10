import { useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Button, ErrorText, Text, TextField } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { WEEKDAYS } from '@/lib/plans';

const NOTE_MAX = 500;

// Monday to Sunday as pills; none chosen is "Any day" (once a week).
export function DaysPicker({
  value,
  onChange,
  hint,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  hint?: string;
}) {
  function toggle(day: number) {
    haptic.select();
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b));
  }
  return (
    <View style={{ gap: Spacing.two }}>
      <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
        Which days?
      </Text>
      <View style={styles.days}>
        <DayChip
          label="Any day"
          selected={value.length === 0}
          onPress={() => {
            if (value.length) haptic.select();
            onChange([]);
          }}
        />
        {WEEKDAYS.map((d) => (
          <DayChip
            key={d.day}
            label={d.short}
            accessibilityLabel={d.long}
            selected={value.includes(d.day)}
            onPress={() => toggle(d.day)}
          />
        ))}
      </View>
      {hint ? (
        <Text variant="footnote" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// "Cara can do it on any day, once a week." / "Cara sees it on those days in the Voltrix app."
export function daysHint(days: number[], name: string) {
  return days.length === 0
    ? `${name} can do it on any day, once a week.`
    : `${name} sees it on ${days.length === 1 ? 'that day' : 'those days'} in the Voltrix app.`;
}

// Which days, and a note for the client. `children` sits between the days and the note (the
// program page puts its weeks there).
export function DaysForm({
  days: startDays,
  note: startNote,
  clientName,
  submitLabel,
  onSubmit,
  backLabel,
  onBack,
  onRemove,
  removeLabel = 'Remove from plan',
  children,
  testID,
}: {
  days?: number[];
  note?: string | null;
  clientName: string;
  submitLabel: string;
  onSubmit: (weekdays: number[], note: string | null) => Promise<string | null>;
  backLabel?: string;
  onBack?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  children?: ReactNode;
  testID?: string;
}) {
  const [days, setDays] = useState<number[]>(startDays ?? []);
  const [note, setNote] = useState(startNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    const problem = await onSubmit(days, note.trim() || null);
    setBusy(false);
    if (problem) {
      haptic.warning();
      setError(problem);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <DaysPicker value={days} onChange={setDays} hint={daysHint(days, clientName)} />
      {children}
      <TextField
        label={`Note for ${clientName}`}
        optional
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        autoCapitalize="sentences"
        placeholder="For example: Go light this week"
      />
      <ErrorText>{error}</ErrorText>
      <Button title={submitLabel} onPress={submit} loading={busy} testID={testID} />
      {onBack ? <Button title={backLabel ?? 'Back'} variant="secondary" onPress={onBack} disabled={busy} /> : null}
      {onRemove ? <Button title={removeLabel} variant="destructive" onPress={onRemove} disabled={busy} /> : null}
    </View>
  );
}

// A day to train on: a pill like the filter chips, filled with the text colour when chosen.
function DayChip({
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.dayTarget}>
      {({ pressed }) => (
        <View style={[styles.day, pressed && { backgroundColor: Colors.tintPressed }, selected && styles.daySelected]}>
          <Text variant="callout" style={[styles.dayText, selected && { color: Colors.background }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = themed(() => ({
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  dayTarget: {
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  day: {
    minHeight: 36,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  daySelected: {
    backgroundColor: Colors.text,
  },
  dayText: {
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
}));
