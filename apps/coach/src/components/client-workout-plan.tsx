import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Sheet as BottomSheet } from '@/components/sheet';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  SkeletonRows,
  StatusPill,
  Text,
  TextField,
} from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
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
import { addError } from '@/lib/save-error';
import { addDays, dayKey, startOfWeek } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type WorkoutChoice = { id: string; name: string };

// The bottom sheet: choosing a workout to add, then its days and note.
type Sheet = { step: 'pick' } | { step: 'days'; workout: WorkoutChoice; item?: PlanItem };

const NOTE_MAX = 500;

// How far along a workout is this week, in words.
function doneText(done: number, times: number) {
  if (times === 1) return done ? 'Done this week' : 'Not done yet this week';
  return `${done} of ${times} done this week`;
}

// A client's workout plan on their page: workouts from the trainer's library on
// chosen days, in order, with a note each, and how many they did this week.
export function ClientWorkoutPlan({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<PlanItem[] | null>(null);
  // Days ticked off this week, by plan item.
  const [ticks, setTicks] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // The sheet keeps showing its last step while it slides away.
  const [lastSheet, setLastSheet] = useState<Sheet | null>(null);
  if (sheet && sheet !== lastSheet) setLastSheet(sheet);
  // Reordering and removing happen in edit mode, so the plan reads calmly the rest of the time.
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('plan_items')
      .select(PLAN_COLUMNS)
      .eq('client_id', clientId)
      .order('position')
      .order('created_at');
    if (error) return setError(plainError(error));
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
  // A workout the client finished in Voltrix ticks the plan off too, so the week's count here
  // keeps up with the workout log below it while the page stays open.
  useChatEvents((event) => {
    if (
      (event.type === 'progress' && event.client_id === clientId && event.kind === 'workout') ||
      event.type === 'reconnected'
    )
      load();
  });

  async function add(workout: WorkoutChoice, weekdays: number[], note: string | null) {
    const position = (items ?? []).reduce((max, i) => Math.max(max, i.position + 1), 0);
    const { error } = await supabase
      .from('plan_items')
      .insert({ client_id: clientId, workout_id: workout.id, position, weekdays, note });
    if (error) return addError(error);
    haptic.success();
    setSheet(null);
    await load();
    return null;
  }

  async function save(item: PlanItem, weekdays: number[], note: string | null) {
    const { error } = await supabase.from('plan_items').update({ weekdays, note }).eq('id', item.id);
    if (error) return plainError(error);
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, weekdays, note } : i)) ?? null);
    setSheet(null);
    return null;
  }

  async function remove(item: PlanItem) {
    const name = item.workouts?.name ?? 'This workout';
    if (!(await confirm('Remove from plan?', `${name} comes off ${clientName}’s plan.`, 'Remove'))) return false;
    const { error } = await supabase.from('plan_items').delete().eq('id', item.id);
    if (error) {
      setError(plainError(error));
      return false;
    }
    const left = items?.filter((i) => i.id !== item.id) ?? null;
    setItems(left);
    if (!left?.length) setEditing(false);
    return true;
  }

  // Swaps two workouts, then numbers the whole list in its new order. Removing a
  // workout leaves a gap in the numbers, so only renumbering every row keeps the
  // saved order (and the client's) the same as on screen.
  async function move(index: number, direction: -1 | 1) {
    if (!items) return;
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    haptic.select();
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
      setError(plainError(failed.error));
    }
  }

  const progress = items ? weekProgress(items, ticks) : null;
  const shown = sheet ?? lastSheet;

  return (
    <View style={{ gap: Spacing.tight }}>
      <View style={styles.header}>
        <Text variant="label" tone="secondary" style={{ flex: 1 }} accessibilityRole="header">
          Workout plan
        </Text>
        {items?.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Done editing the plan' : 'Edit the plan order'}
            onPress={() => setEditing((e) => !e)}
            style={styles.edit}>
            {({ pressed }) => (
              <Text
                variant="footnote"
                tone={pressed ? 'primary' : 'secondary'}
                style={{ fontFamily: editing ? Fonts.textSemi : Fonts.textMedium }}>
                {editing ? 'Done' : 'Edit'}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {progress && items?.length ? (
        <Text variant="footnote" tone="secondary">
          Done {progress.done} of {progress.planned} this week
        </Text>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {!items && !error ? (
        <Group>
          <SkeletonRows count={2} />
        </Group>
      ) : null}
      {items && items.length === 0 ? (
        <Card>
          <Text variant="callout" tone="secondary">
            No workouts in {clientName}’s plan yet. Add workouts from your library and pick the days.
          </Text>
        </Card>
      ) : null}
      {items?.length ? (
        <Group>
          {items.map((item, index) => {
            const name = item.workouts?.name ?? 'Workout';
            const done = doneThisWeek(item, ticks.get(item.id));
            const times = timesPerWeek(item);
            const finished = done >= times;
            const last = index === items.length - 1;
            return (
              <ListRow
                key={item.id}
                title={name}
                titleLines={2}
                leading={<IconTile icon="barbell-outline" />}
                subtitle={
                  <View style={{ gap: 2 }}>
                    <Text variant="footnote" tone="secondary">
                      {daysLabel(item.weekdays)}
                    </Text>
                    {item.note ? (
                      <Text variant="footnote" numberOfLines={2}>
                        “{item.note}”
                      </Text>
                    ) : null}
                  </View>
                }
                status={
                  editing ? null : finished ? (
                    <StatusPill tone="success" label="Done" />
                  ) : times > 1 && done > 0 ? (
                    <StatusPill tone="neutral" label={`${done} of ${times}`} />
                  ) : null
                }
                trailing={
                  editing ? (
                    <View style={styles.tools}>
                      <IconButton
                        icon="chevron-up"
                        label={`Move ${name} up`}
                        tone="secondary"
                        disabled={index === 0}
                        onPress={() => move(index, -1)}
                      />
                      <IconButton
                        icon="chevron-down"
                        label={`Move ${name} down`}
                        tone="secondary"
                        disabled={last}
                        onPress={() => move(index, 1)}
                      />
                      <IconButton
                        icon="trash-outline"
                        label={`Remove ${name}`}
                        tone="secondary"
                        onPress={() => remove(item)}
                      />
                    </View>
                  ) : null
                }
                onPress={
                  editing ? undefined : () => setSheet({ step: 'days', workout: { id: item.workout_id, name }, item })
                }
                accessibilityLabel={`${name}, ${daysLabel(item.weekdays)}, ${doneText(done, times)}. Change days or note`}
                last={last}
              />
            );
          })}
        </Group>
      ) : null}
      {items && !editing ? (
        <Button
          title="Add workout"
          icon="add"
          variant="secondary"
          size="medium"
          onPress={() => setSheet({ step: 'pick' })}
          style={{ marginTop: Spacing.one }}
        />
      ) : null}

      <BottomSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        title={shown?.step === 'days' ? shown.workout.name : 'Add a workout'}>
        {shown?.step === 'pick' ? (
          <WorkoutPicker
            planned={new Set(items?.map((i) => i.workout_id))}
            onPick={(workout) => {
              // A workout already in the plan opens its days instead of going in twice.
              const item = items?.find((i) => i.workout_id === workout.id);
              setSheet(item ? { step: 'days', workout, item } : { step: 'days', workout });
            }}
            onClose={() => setSheet(null)}
          />
        ) : null}
        {shown?.step === 'days' ? (
          <DaysForm
            key={shown.item?.id ?? shown.workout.id}
            item={shown.item}
            clientName={clientName}
            onSubmit={(weekdays, note) =>
              shown.item ? save(shown.item, weekdays, note) : add(shown.workout, weekdays, note)
            }
            onBack={shown.item ? () => setSheet(null) : () => setSheet({ step: 'pick' })}
            onRemove={
              shown.item
                ? async () => {
                    if (await remove(shown.item!)) setSheet(null);
                  }
                : undefined
            }
          />
        ) : null}
      </BottomSheet>
    </View>
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
  const [workouts, setWorkouts] = useState<WorkoutChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('workouts')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(plainError(error));
        else setWorkouts((data ?? []) as WorkoutChoice[]);
      });
  }, []);

  return (
    <>
      <ErrorText>{error}</ErrorText>
      {!workouts && !error ? (
        <Group>
          <SkeletonRows count={3} />
        </Group>
      ) : null}
      {workouts && workouts.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="No workouts yet"
          message="Build one first, then add it here."
          action={
            <Button
              title="Build a workout"
              onPress={() => {
                onClose();
                router.push('/workouts/new');
              }}
            />
          }
        />
      ) : null}
      {workouts?.length ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          {workouts.map((w, index) => (
            <ListRow
              key={w.id}
              title={w.name}
              subtitle={planned.has(w.id) ? 'In the plan: change its days' : undefined}
              leading={<IconTile icon="barbell-outline" />}
              onPress={() => onPick(w)}
              accessibilityLabel={planned.has(w.id) ? `${w.name}, in the plan. Change its days` : `Add ${w.name}`}
              compact
              last={index === workouts.length - 1}
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

// Which days, and a note for the client.
function DaysForm({
  item,
  clientName,
  onSubmit,
  onBack,
  onRemove,
}: {
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
    haptic.select();
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
      <View style={{ gap: Spacing.two }}>
        <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
          Which days?
        </Text>
        <View style={styles.days}>
          <DayChip
            label="Any day"
            selected={days.length === 0}
            onPress={() => {
              if (days.length) haptic.select();
              setDays([]);
            }}
          />
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
        <Text variant="footnote" tone="secondary">
          {days.length === 0
            ? `${clientName} can do it on any day, once a week.`
            : `${clientName} sees it on ${days.length === 1 ? 'that day' : 'those days'} in the Voltrix app.`}
        </Text>
      </View>
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
      <Button title={item ? 'Save' : 'Add to plan'} onPress={submit} loading={busy} />
      <Button title={item ? 'Cancel' : 'Back'} variant="secondary" onPress={onBack} disabled={busy} />
      {onRemove ? <Button title="Remove from plan" variant="destructive" onPress={onRemove} disabled={busy} /> : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 20,
  },
  // A 44 high target around a short word, pulled back so the word lines up with the page edge.
  edit: {
    minHeight: 44,
    minWidth: 44,
    marginVertical: -12,
    marginRight: -Spacing.two,
    paddingHorizontal: Spacing.two,
    alignItems: 'flex-end',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  tools: {
    flexDirection: 'row',
    marginRight: -Spacing.two,
  },
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
