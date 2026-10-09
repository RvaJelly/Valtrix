import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import {
  daysLabel,
  doneThisWeek,
  PLAN_COLUMNS,
  timesPerWeek,
  WEEKDAYS,
  weekProgress,
  type PlanItem,
} from '@/lib/plans';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { addDays, dayKey, startOfWeek } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type WorkoutChoice = { id: string; name: string };

// The bottom sheet: choosing a workout to add, then its days and note.
type Sheet = { step: 'pick' } | { step: 'days'; workout: WorkoutChoice; item?: PlanItem };

const NOTE_MAX = 500;

// A client's workout plan on their page: workouts from the trainer's library on
// chosen days, in order, with a note each, and how many they did this week.
export function ClientWorkoutPlan({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<PlanItem[] | null>(null);
  // Days ticked off this week, by plan item.
  const [ticks, setTicks] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('plan_items')
      .select(PLAN_COLUMNS)
      .eq('client_id', clientId)
      .order('position')
      .order('created_at');
    if (error) return setError(error.message);
    const list = (data ?? []) as unknown as PlanItem[];
    const week = startOfWeek(new Date());
    const done = list.length
      ? await supabase
          .from('plan_completions')
          .select('plan_item_id, done_on')
          .in(
            'plan_item_id',
            list.map((i) => i.id),
          )
          .gte('done_on', dayKey(week))
          .lte('done_on', dayKey(addDays(week, 6)))
      : { data: [] };
    const byItem = new Map<string, string[]>();
    for (const row of (done.data ?? []) as { plan_item_id: string; done_on: string }[]) {
      byItem.set(row.plan_item_id, [...(byItem.get(row.plan_item_id) ?? []), row.done_on]);
    }
    setError(null);
    setItems(list);
    setTicks(byItem);
  }, [clientId]);

  // Reload when coming back, for example after building a new workout, and when the app
  // or browser window comes back, so ticks the client made meanwhile show.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useRefreshOnReturn(load);

  async function add(workout: WorkoutChoice, weekdays: number[], note: string | null) {
    const position = (items ?? []).reduce((max, i) => Math.max(max, i.position + 1), 0);
    const { error } = await supabase
      .from('plan_items')
      .insert({ client_id: clientId, workout_id: workout.id, position, weekdays, note });
    if (error) return error.message;
    setSheet(null);
    await load();
    return null;
  }

  async function save(item: PlanItem, weekdays: number[], note: string | null) {
    const { error } = await supabase.from('plan_items').update({ weekdays, note }).eq('id', item.id);
    if (error) return error.message;
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, weekdays, note } : i)) ?? null);
    setSheet(null);
    return null;
  }

  async function remove(item: PlanItem) {
    const name = item.workouts?.name ?? 'This workout';
    if (!(await confirm('Remove from plan?', `${name} comes off ${clientName}’s plan.`, 'Remove'))) return false;
    const { error } = await supabase.from('plan_items').delete().eq('id', item.id);
    if (error) {
      setError(error.message);
      return false;
    }
    setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
    return true;
  }

  // Swaps two workouts, then numbers the whole list in its new order. Removing a
  // workout leaves a gap in the numbers, so only renumbering every row keeps the
  // saved order (and the client's) the same as on screen.
  async function move(index: number, direction: -1 | 1) {
    if (!items) return;
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    const swapped = [...items];
    swapped[index] = items[other];
    swapped[other] = items[index];
    const next = swapped.map((item, position) => ({ ...item, position }));
    const changed = next.filter((item) => items.find((i) => i.id === item.id)?.position !== item.position);
    setItems(next);
    const results = await Promise.all(
      changed.map((item) => supabase.from('plan_items').update({ position: item.position }).eq('id', item.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      // Show the order that was really saved.
      await load();
      setError(failed.error!.message);
    }
  }

  const progress = items ? weekProgress(items, ticks) : null;

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.header}>
        <Text style={[styles.section, { flex: 1 }]}>Workout plan</Text>
        {progress && items?.length ? (
          <Text style={styles.progress}>
            Done {progress.done} of {progress.planned} this week
          </Text>
        ) : null}
      </View>
      <ErrorText>{error}</ErrorText>
      {!items && !error ? <ActivityIndicator color={Colors.accentText} /> : null}
      {items && items.length === 0 ? (
        <Card>
          <Body secondary style={{ fontSize: 14 }}>
            No workouts in {clientName}’s plan yet. Add workouts from your library and pick the days.
          </Body>
        </Card>
      ) : null}
      {items?.map((item, index) => {
        const name = item.workouts?.name ?? 'Workout';
        const done = doneThisWeek(item, ticks.get(item.id));
        const times = timesPerWeek(item);
        return (
          <View key={item.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${daysLabel(item.weekdays)}. Change days or note`}
              onPress={() => setSheet({ step: 'days', workout: { id: item.workout_id, name }, item })}
              style={({ pressed }) => [{ flex: 1, gap: Spacing.one }, pressed && { opacity: 0.7 }]}>
              <Text style={styles.name}>{name}</Text>
              <View style={styles.meta}>
                <Ionicons name="calendar-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{daysLabel(item.weekdays)}</Text>
              </View>
              {item.note ? (
                <Text style={styles.note} numberOfLines={3}>
                  “{item.note}”
                </Text>
              ) : null}
              <View style={styles.meta}>
                <Ionicons
                  name={done >= times ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={done ? Colors.accentText : Colors.textSecondary}
                />
                <Text style={[styles.metaText, done >= times && { color: Colors.accentText }]}>
                  {times === 1
                    ? done
                      ? 'Done this week'
                      : 'Not done yet this week'
                    : `${done} of ${times} done this week`}
                </Text>
              </View>
            </Pressable>
            <View style={styles.tools}>
              <IconButton icon="chevron-up" label="Move up" disabled={index === 0} onPress={() => move(index, -1)} />
              <IconButton
                icon="chevron-down"
                label="Move down"
                disabled={index === items.length - 1}
                onPress={() => move(index, 1)}
              />
              <IconButton icon="trash-outline" label={`Remove ${name}`} onPress={() => remove(item)} />
            </View>
          </View>
        );
      })}
      {items ? <Button title="Add workout" variant="secondary" onPress={() => setSheet({ step: 'pick' })} /> : null}

      <PlanSheet
        sheet={sheet}
        clientName={clientName}
        planned={new Set(items?.map((i) => i.workout_id))}
        onClose={() => setSheet(null)}
        onPick={(workout) => setSheet({ step: 'days', workout })}
        onBack={() => setSheet({ step: 'pick' })}
        onAdd={add}
        onSave={save}
        onRemove={async (item) => {
          if (await remove(item)) setSheet(null);
        }}
      />
    </View>
  );
}

function PlanSheet({
  sheet,
  clientName,
  planned,
  onClose,
  onPick,
  onBack,
  onAdd,
  onSave,
  onRemove,
}: {
  sheet: Sheet | null;
  clientName: string;
  planned: Set<string>;
  onClose: () => void;
  onPick: (workout: WorkoutChoice) => void;
  onBack: () => void;
  onAdd: (workout: WorkoutChoice, weekdays: number[], note: string | null) => Promise<string | null>;
  onSave: (item: PlanItem, weekdays: number[], note: string | null) => Promise<string | null>;
  onRemove: (item: PlanItem) => void;
}) {
  return (
    <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {sheet?.step === 'pick' ? <WorkoutPicker planned={planned} onPick={onPick} onClose={onClose} /> : null}
          {sheet?.step === 'days' ? (
            <DaysForm
              key={sheet.item?.id ?? sheet.workout.id}
              workout={sheet.workout}
              item={sheet.item}
              clientName={clientName}
              onSubmit={(weekdays, note) =>
                sheet.item ? onSave(sheet.item, weekdays, note) : onAdd(sheet.workout, weekdays, note)
              }
              onBack={sheet.item ? onClose : onBack}
              onRemove={sheet.item ? () => onRemove(sheet.item!) : undefined}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The trainer's workouts to choose from.
function WorkoutPicker({
  planned,
  onPick,
  onClose,
}: {
  planned: Set<string>;
  onPick: (workout: WorkoutChoice) => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const [workouts, setWorkouts] = useState<WorkoutChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('workouts')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setWorkouts((data ?? []) as WorkoutChoice[]);
      });
  }, []);

  return (
    <>
      <Text style={styles.sheetTitle}>Add a workout</Text>
      <ErrorText>{error}</ErrorText>
      {!workouts && !error ? <ActivityIndicator color={Colors.accentText} /> : null}
      {workouts && workouts.length === 0 ? (
        <View style={{ gap: Spacing.three }}>
          <Body secondary>You have no workouts yet. Build one first, then add it here.</Body>
          <Button
            title="Build a workout"
            onPress={() => {
              onClose();
              router.push('/workouts/new');
            }}
          />
        </View>
      ) : null}
      <ScrollView style={{ maxHeight: height * 0.55 }}>
        {workouts?.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={`Add ${w.name}`}
            onPress={() => onPick(w)}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="barbell-outline" size={22} color={Colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionLabel}>{w.name}</Text>
              {planned.has(w.id) ? <Text style={styles.optionDetail}>Already in the plan</Text> : null}
            </View>
            <Ionicons name="add" size={22} color={Colors.accentText} />
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

// Which days, and a note for the client.
function DaysForm({
  workout,
  item,
  clientName,
  onSubmit,
  onBack,
  onRemove,
}: {
  workout: WorkoutChoice;
  item?: PlanItem;
  clientName: string;
  onSubmit: (weekdays: number[], note: string | null) => Promise<string | null>;
  onBack: () => void;
  onRemove?: () => void;
}) {
  const [days, setDays] = useState<number[]>(item?.weekdays ?? []);
  const [note, setNote] = useState(item?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b),
    );
  }

  async function submit() {
    setError(null);
    setBusy(true);
    const problem = await onSubmit(days, note.trim() || null);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Text style={styles.sheetTitle} numberOfLines={2}>
        {workout.name}
      </Text>
      <Text style={styles.label}>Which days?</Text>
      <View style={styles.days}>
        <DayChip label="Any day" selected={days.length === 0} onPress={() => setDays([])} wide />
        {WEEKDAYS.map((d) => (
          <DayChip
            key={d.day}
            label={d.short}
            accessibilityLabel={d.long}
            selected={days.includes(d.day)}
            onPress={() => toggle(d.day)}
          />
        ))}
      </View>
      <Body secondary style={{ fontSize: 13 }}>
        {days.length === 0
          ? `${clientName} can do it on any day, once a week.`
          : `${clientName} sees it on ${days.length === 1 ? 'that day' : 'those days'} in the Voltrix app.`}
      </Body>
      <TextField
        label={`Note for ${clientName}`}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        placeholder="Optional, for example: Go light this week"
      />
      <ErrorText>{error}</ErrorText>
      <Button title={item ? 'Save' : 'Add to plan'} onPress={submit} loading={busy} />
      <Button title={item ? 'Cancel' : 'Back'} variant="secondary" onPress={onBack} disabled={busy} />
      {onRemove ? <Button title="Remove from plan" variant="ghost" onPress={onRemove} disabled={busy} /> : null}
    </View>
  );
}

function DayChip({
  label,
  accessibilityLabel,
  selected,
  onPress,
  wide,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.day, wide && styles.dayWide, selected && styles.daySelected]}>
      <Text style={[styles.dayText, selected && { color: Colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && { opacity: disabled ? 0.3 : 0.6 }]}>
      <Ionicons name={icon} size={20} color={Colors.text} />
    </Pressable>
  );
}

const styles = themed(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progress: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    color: Colors.text,
    fontSize: 14,
    fontStyle: 'italic',
  },
  tools: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    gap: Spacing.three,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  optionLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  optionDetail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  day: {
    minWidth: 52,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayWide: {
    paddingHorizontal: Spacing.three,
  },
  daySelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  dayText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
}));
