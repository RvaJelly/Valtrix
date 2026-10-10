import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Chips } from '@/components/chips';
import { Body, Button, ErrorText, Text, TextField, Toggle } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type } from '@/constants/theme';
import { fullName, type Client } from '@/lib/clients';
import {
  addDays,
  combine,
  DURATIONS,
  formatDay,
  formatTime,
  overlaps,
  SESSION_COLUMNS,
  sessionName,
  START_TIMES,
  startOfDay,
  timeKey,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export type SessionInput = {
  client_id: string | null;
  title: string | null;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  online: boolean;
};

const NO_CLIENT = 'none';

type Props = {
  // The session being edited, or the day and client to start a new one with.
  initial?: Partial<SessionInput> & { id?: string };
  day: Date;
  submitLabel: string;
  onSubmit: (input: SessionInput) => Promise<string | null>;
  // Shown above the form, like the button to join an online session.
  top?: ReactNode;
  children?: ReactNode;
};

function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function SessionForm({ initial, day: initialDay, submitLabel, onSubmit, top, children }: Props) {
  const initialStart = initial?.starts_at ? new Date(initial.starts_at) : null;
  const [clients, setClients] = useState<Pick<Client, 'id' | 'first_name' | 'last_name'>[] | null>(null);
  const [who, setWho] = useState<string | null>(initial?.client_id ?? (initial?.title ? NO_CLIENT : null));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [day, setDay] = useState(startOfDay(initialStart ?? initialDay));
  const [time, setTime] = useState<string | null>(initialStart ? timeKey(initialStart) : null);
  const [duration, setDuration] = useState<string | null>(String(initial?.duration_minutes ?? 60));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [online, setOnline] = useState(initial?.online ?? false);
  const [dayBookings, setDayBookings] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('status', 'active')
      .order('first_name')
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  // The day's other bookings, to warn about double-booking.
  useEffect(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('status', 'scheduled')
      .gte('starts_at', day.toISOString())
      .lt('starts_at', addDays(day, 1).toISOString())
      .then(({ data }) => setDayBookings(((data as unknown as Session[]) ?? []).filter((s) => s.id !== initial?.id)));
  }, [day, initial?.id]);

  const whoOptions: Record<string, string> = {};
  for (const c of clients ?? []) whoOptions[c.id] = fullName(c);
  // Keep a paused or archived client selectable when editing their session.
  if (initial?.client_id && !whoOptions[initial.client_id]) whoOptions[initial.client_id] = 'Current client';
  whoOptions[NO_CLIENT] = 'No client (block time)';

  const times = time && !START_TIMES.includes(time) ? [...START_TIMES, time].sort() : START_TIMES;
  const timeOptions = Object.fromEntries(times.map((t) => [t, t]));

  const mine =
    time && duration ? { starts_at: combine(day, time).toISOString(), duration_minutes: Number(duration) } : null;
  const clash = mine ? (dayBookings.find((s) => overlaps(mine, s)) ?? null) : null;

  async function submit() {
    setError(null);
    if (!who) return setError('Pick a client, or choose “No client”.');
    if (who === NO_CLIENT && !title.trim()) return setError('Give this time a name, like “Group class”.');
    if (!time) return setError('Pick a start time.');
    setBusy(true);
    const problem = await onSubmit({
      client_id: who === NO_CLIENT ? null : who,
      title: who === NO_CLIENT ? title.trim() : null,
      starts_at: combine(day, time).toISOString(),
      duration_minutes: Number(duration ?? 60),
      location: orNull(location),
      notes: orNull(notes),
      // A video call needs a client to call.
      online: who !== NO_CLIENT && online,
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {top}
        <Text style={styles.label}>Client</Text>
        {clients && clients.length === 0 && !initial?.client_id ? (
          <Body secondary style={{ fontSize: 14 }}>
            You have no active clients yet. Add one first, or block time without a client.
          </Body>
        ) : null}
        <View style={styles.wrap}>
          {Object.entries(whoOptions).map(([key, label]) => (
            <Choice key={key} label={label} selected={who === key} onPress={() => setWho(key)} />
          ))}
        </View>
        {who === NO_CLIENT ? (
          <TextField
            label="What is it?"
            value={title}
            onChangeText={setTitle}
            placeholder="For example: Group class"
            maxLength={120}
          />
        ) : null}

        <Text style={styles.label}>Day</Text>
        <View style={styles.dayRow}>
          <Pressable
            accessibilityLabel="Previous day"
            hitSlop={8}
            onPress={() => setDay(addDays(day, -1))}
            style={styles.dayButton}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.dayText}>{formatDay(day)}</Text>
          <Pressable
            accessibilityLabel="Next day"
            hitSlop={8}
            onPress={() => setDay(addDays(day, 1))}
            style={styles.dayButton}>
            <Ionicons name="chevron-forward" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <Text style={styles.label}>Start time</Text>
        <Chips options={timeOptions} value={time} onChange={(t) => setTime(t)} />

        <Text style={styles.label}>Length</Text>
        <Chips options={DURATIONS} value={duration} onChange={(d) => setDuration(d ?? '60')} />

        {clash ? (
          <View style={styles.warning}>
            <Ionicons name="warning" size={18} color={Colors.danger} />
            <Body style={{ flex: 1, fontSize: 14 }}>
              This overlaps with {sessionName(clash)} at {formatTime(new Date(clash.starts_at))}.
            </Body>
          </View>
        ) : null}

        {who && who !== NO_CLIENT ? (
          <View style={styles.online}>
            <Ionicons name="videocam-outline" size={22} color={Colors.textSecondary} />
            {/* The words toggle it too, so it is easy to hit. */}
            <Pressable accessible={false} onPress={() => setOnline(!online)} style={{ flex: 1 }}>
              <Text style={styles.onlineTitle}>Online (video call)</Text>
              <Body secondary style={{ fontSize: 13 }}>
                You both get a “Join video call” button 15 minutes before it starts.
              </Body>
            </Pressable>
            <Toggle accessibilityLabel="Online (video call)" value={online} onValueChange={setOnline} />
          </View>
        ) : null}

        <TextField
          label="Where"
          value={location}
          onChangeText={setLocation}
          placeholder={online && who !== NO_CLIENT ? 'Optional' : 'Optional, for example: Main gym'}
          maxLength={200}
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          maxLength={2000}
          multiline
          style={{ minHeight: 80, paddingTop: Spacing.three, textAlignVertical: 'top' }}
        />
        <ErrorText>{error}</ErrorText>
        <Button title={submitLabel} onPress={submit} loading={busy} />
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && { color: Colors.background }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.hero,
    gap: Spacing.three,
  },
  label: {
    ...Type.footnote,
    fontFamily: Fonts.textMedium,
    color: Colors.textSecondary,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // Selected chips are inverted (text-coloured), never orange.
  choice: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  choiceSelected: {
    backgroundColor: Colors.text,
  },
  choiceText: {
    ...Type.callout,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  dayText: {
    ...Type.headline,
    ...Tabular,
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
  },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  onlineTitle: {
    ...Type.rowTitle,
    color: Colors.text,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
}));
