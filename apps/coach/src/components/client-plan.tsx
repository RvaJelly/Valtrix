import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { AddToPlanSheet } from '@/components/add-to-plan-sheet';
import { DaysForm } from '@/components/days-form';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  ProgressBar,
  SkeletonRows,
  StatusPill,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonthShort, longDate, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { addDaysTo, daysBetween, mondayOf, programWeek, runsOn, timesThisWeek } from '@/lib/plan-dates';
import { PLAN_COLUMNS, WEEKDAYS, weekProgress, type PlanItem } from '@/lib/plans';
import { ASSIGNMENT_COLUMNS, NAME_MAX, saveAsProgram, type PlanAssignment } from '@/lib/programs';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { addFailure } from '@/lib/save-error';
import { dayKey, fromDayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type PlanClient = { id: string; first_name: string; last_name: string | null };

type SheetState =
  | { kind: 'more'; a: PlanAssignment }
  | { kind: 'end'; a: PlanAssignment }
  | { kind: 'rename'; a: PlanAssignment }
  | { kind: 'save'; a: PlanAssignment }
  | { kind: 'past' }
  | { kind: 'row'; item: PlanItem }
  | { kind: 'days'; item: PlanItem };

const WEEKS_BACK = 8;
const WEEKS_AHEAD = 52;

// "12 – 18 Oct", "28 Sep – 4 Oct".
function weekLabel(monday: string) {
  const from = fromDayKey(monday);
  const to = fromDayKey(addDaysTo(monday, 6));
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()} – ${dayMonthShort(to)}`
    : `${dayMonthShort(from)} – ${dayMonthShort(to)}`;
}

// A client's plan on their page: the programs on it as cards, then the plan a week at a time
// (each day's workouts, then any-day ones), and Add to plan.
export function ClientPlan({
  client,
  linked,
  onInvite,
}: {
  client: PlanClient;
  linked: boolean;
  // Not linked: the notice offers the invite.
  onInvite?: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  // Days ticked in the shown week, by plan row.
  const [ticks, setTicks] = useState<Map<string, string[]>>(new Map());
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [lastSheet, setLastSheet] = useState<SheetState | null>(null);
  if (sheet && sheet !== lastSheet) setLastSheet(sheet);
  const [adding, setAdding] = useState(false);
  // What a menu does once it has slid away: an iPhone shows one sheet or alert at a time.
  const after = useRef<(() => void) | null>(null);
  const loads = useRef(0);
  const showSkeleton = useDelayed(300);

  const today = dayKey(new Date());
  const thisMonday = mondayOf(today);
  const monday = addDaysTo(thisMonday, offset * 7);

  const load = useCallback(async () => {
    const id = ++loads.current;
    const week = addDaysTo(mondayOf(dayKey(new Date())), offset * 7);
    const [plan, programs] = await Promise.all([
      supabase.from('plan_items').select(PLAN_COLUMNS).eq('client_id', client.id).order('position').order('created_at'),
      supabase.from('plan_assignments').select(ASSIGNMENT_COLUMNS).eq('client_id', client.id).order('starts_on'),
    ]);
    if (id !== loads.current) return;
    if (plan.error) return setError(plainError(plan.error));
    const list = (plan.data ?? []) as unknown as PlanItem[];
    const done = list.length
      ? await supabase
          .from('plan_completions')
          .select('plan_item_id, done_on')
          .in(
            'plan_item_id',
            list.map((i) => i.id),
          )
          .gte('done_on', week)
          .lte('done_on', addDaysTo(week, 6))
      : { data: [] };
    if (id !== loads.current) return;
    const byItem = new Map<string, string[]>();
    for (const row of (done.data ?? []) as { plan_item_id: string; done_on: string }[]) {
      byItem.set(row.plan_item_id, [...(byItem.get(row.plan_item_id) ?? []), row.done_on]);
    }
    setError(null);
    setItems(list);
    // An older database has no programs on plans.
    setAssignments(programs.error ? [] : ((programs.data ?? []) as PlanAssignment[]));
    setTicks(byItem);
  }, [client.id, offset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useRefreshOnReturn(load);
  useChatEvents((event) => {
    if (
      (event.type === 'progress' && event.client_id === client.id && event.kind === 'workout') ||
      event.type === 'reconnected'
    )
      load();
  });

  function openAfter(action: () => void) {
    setSheet(null);
    if (Platform.OS === 'android') action();
    else after.current = action;
  }

  function move(by: number) {
    haptic.select();
    setOffset((o) => Math.max(-WEEKS_BACK, Math.min(WEEKS_AHEAD, o + by)));
  }

  const ends = new Map(assignments.map((a) => [a.id, a.ends_on]));
  const endOf = (item: PlanItem) => (item.assignment_id ? ends.get(item.assignment_id) : null);
  const current = assignments.filter((a) => a.ends_on >= today);
  const past = assignments.filter((a) => a.ends_on < today);
  const singles = (items ?? []).filter((i) => !i.assignment_id);
  const thisWeek = (items ?? []).filter((i) => timesThisWeek(i, monday, endOf(i)) > 0);
  const progress = items && offset === 0 ? weekProgress(thisWeek, ticks, monday, ends) : null;

  // Each day's workouts, then the any-day ones.
  const days = WEEKDAYS.map((d) => {
    const day = addDaysTo(monday, d.day - 1);
    return {
      key: String(d.day),
      label: d.long,
      day,
      rows: thisWeek.filter((i) => i.weekdays.includes(d.day) && runsOn(i, day, endOf(i))),
    };
  }).filter((d) => d.rows.length);
  const anyDay = thisWeek.filter((i) => !i.weekdays.length);

  async function rename(a: PlanAssignment, name: string) {
    const { error } = await supabase.from('plan_assignments').update({ name }).eq('id', a.id);
    if (error) return plainError(error, 'Couldn’t rename it. Try again.');
    haptic.success();
    setAssignments((list) => list.map((x) => (x.id === a.id ? { ...x, name } : x)));
    setSheet(null);
    toast('Renamed');
    return null;
  }

  async function saveTemplate(a: PlanAssignment, name: string) {
    try {
      const id = await saveAsProgram(a.id, name);
      haptic.success();
      setSheet(null);
      toast('Saved to your programs', {
        action: { label: 'View', onPress: () => router.push({ pathname: '/programs/[id]', params: { id } }) },
      });
      return null;
    } catch (e) {
      return addFailure(e);
    }
  }

  async function endProgram(a: PlanAssignment, on: string) {
    const ok = await confirm(
      `End ${a.name} for ${client.first_name}?`,
      `Workouts after that come off ${client.first_name}’s plan. What they’ve done stays.`,
      'End program',
    );
    if (!ok) return;
    const { error } = await supabase.from('plan_assignments').update({ ends_on: on }).eq('id', a.id);
    if (error) {
      haptic.warning();
      return toast(plainError(error, 'Couldn’t end the program. Try again.'));
    }
    toast(`${a.name} ends ${shortDate(fromDayKey(on))}`);
    load();
  }

  async function takeOff(a: PlanAssignment) {
    const ok = await confirm(
      `Take ${a.name} off ${client.first_name}’s plan?`,
      `Its workouts and the ticks on them go too. Workouts ${client.first_name} logged stay in their history.`,
      'Take off',
    );
    if (!ok) return;
    const { error } = await supabase.from('plan_assignments').delete().eq('id', a.id);
    if (error) {
      haptic.warning();
      return toast(plainError(error, 'Couldn’t take it off. Try again.'));
    }
    toast(`${a.name} taken off`);
    load();
  }

  async function saveDays(item: PlanItem, weekdays: number[], note: string | null) {
    const { error } = await supabase.from('plan_items').update({ weekdays, note }).eq('id', item.id);
    if (error) return plainError(error);
    haptic.success();
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, weekdays, note } : i)) ?? null);
    setSheet(null);
    return null;
  }

  async function remove(item: PlanItem) {
    const name = item.workouts?.name ?? 'This workout';
    const ok = await confirm(`Remove ${name} from ${client.first_name}’s plan?`, 'Ticks on it go too.', 'Remove');
    if (!ok) return;
    const { error } = await supabase.from('plan_items').delete().eq('id', item.id);
    if (error) {
      haptic.warning();
      return toast(plainError(error, 'Couldn’t remove it. Try again.'));
    }
    // The client's own copy goes too when nothing else on the plan uses it. Its video files stay:
    // a copy shares them with the workout it came from.
    const used = (items ?? []).some((i) => i.id !== item.id && i.workout_id === item.workout_id);
    if (item.workouts?.client_id === client.id && !used) {
      await supabase.from('workouts').delete().eq('id', item.workout_id);
    }
    setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
    toast(`${name} removed`);
  }

  // Swaps two single workouts, then numbers the singles in their new order.
  async function reorder(item: PlanItem, by: -1 | 1) {
    const index = singles.findIndex((i) => i.id === item.id);
    const other = index + by;
    if (index < 0 || other < 0 || other >= singles.length) return;
    haptic.select();
    const swapped = [...singles];
    swapped[index] = singles[other];
    swapped[other] = singles[index];
    const results = await Promise.all(
      swapped.map((i, position) =>
        i.position === position ? null : supabase.from('plan_items').update({ position }).eq('id', i.id),
      ),
    );
    const failed = results.find((r) => r?.error);
    if (failed?.error) toast(plainError(failed.error, 'Couldn’t move it. Try again.'));
    load();
  }

  const shown = sheet ?? lastSheet;
  const empty = !!items && items.length === 0 && current.length === 0;

  if (!items) {
    return (
      <View style={{ gap: Spacing.tight }}>
        <ErrorText>{error}</ErrorText>
        {!error && showSkeleton ? (
          <Group>
            <SkeletonRows count={3} />
          </Group>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.section }}>
      {!linked ? (
        <Notice action={onInvite ? { label: 'Invite', onPress: onInvite } : undefined}>
          {client.first_name} sees this once they join.
        </Notice>
      ) : null}
      <ErrorText>{error}</ErrorText>

      {empty ? (
        <EmptyState
          icon="barbell-outline"
          title="No plan yet"
          message={`Give ${client.first_name} a program or a few workouts. They see them in Voltrix and tick them off.`}
          action={<Button title="Add to plan" onPress={() => setAdding(true)} testID="plan-add" />}
        />
      ) : (
        <>
          {current.length ? (
            <View style={{ gap: Spacing.tight }}>
              {current.map((a) => (
                <ProgramCard
                  key={a.id}
                  a={a}
                  today={today}
                  onSave={() => setSheet({ kind: 'save', a })}
                  onMore={() => setSheet({ kind: 'more', a })}
                />
              ))}
            </View>
          ) : null}

          <View style={{ gap: Spacing.tight }}>
            <View style={styles.week}>
              <IconButton
                icon="chevron-back"
                label="Previous week"
                onPress={() => move(-1)}
                disabled={offset <= -WEEKS_BACK}
                testID="plan-week-prev"
              />
              <Text variant="headline" style={[Tabular, styles.weekLabel]} accessibilityRole="header">
                {offset === 0 ? 'This week' : weekLabel(monday)}
              </Text>
              <IconButton
                icon="chevron-forward"
                label="Next week"
                onPress={() => move(1)}
                disabled={offset >= WEEKS_AHEAD}
                testID="plan-week-next"
              />
            </View>
            <Text variant="footnote" tone="secondary" style={[Tabular, { textAlign: 'center' }]}>
              {offset === 0
                ? [
                    weekLabel(monday),
                    linked && progress?.planned ? `${progress.done} of ${progress.planned} done` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : offset < 0
                  ? 'A past week'
                  : 'A week ahead'}
            </Text>
          </View>

          {days.length || anyDay.length ? (
            <View style={{ gap: Spacing.four }}>
              {days.map((d) => (
                <View key={d.key} style={{ gap: Spacing.two }}>
                  <Text variant="label" tone="secondary" accessibilityRole="header">
                    {d.label}
                  </Text>
                  <Group>
                    {d.rows.map((item, i) => (
                      <PlanRow
                        key={item.id}
                        item={item}
                        done={linked && !!ticks.get(item.id)?.includes(d.day)}
                        last={i === d.rows.length - 1}
                        onMenu={item.assignment_id ? undefined : () => setSheet({ kind: 'row', item })}
                      />
                    ))}
                  </Group>
                </View>
              ))}
              {anyDay.length ? (
                <View style={{ gap: Spacing.two }}>
                  <Text variant="label" tone="secondary" accessibilityRole="header">
                    Any day
                  </Text>
                  <Group>
                    {anyDay.map((item, i) => (
                      <PlanRow
                        key={item.id}
                        item={item}
                        done={linked && !!ticks.get(item.id)?.length}
                        last={i === anyDay.length - 1}
                        onMenu={item.assignment_id ? undefined : () => setSheet({ kind: 'row', item })}
                      />
                    ))}
                  </Group>
                </View>
              ) : null}
            </View>
          ) : (
            <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              Nothing planned this week.
            </Text>
          )}

          <Button title="Add to plan" onPress={() => setAdding(true)} testID="plan-add" />
        </>
      )}

      {past.length ? (
        <Group>
          <ListRow
            title={`Past programs (${past.length})`}
            leading={<IconTile icon="time-outline" />}
            onPress={() => setSheet({ kind: 'past' })}
            last
          />
        </Group>
      ) : null}

      <Sheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        onClosed={() => {
          const action = after.current;
          after.current = null;
          action?.();
        }}
        title={sheetTitle(shown, client.first_name)}>
        {shown?.kind === 'more' ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="Rename"
              leading={<IconTile icon="create-outline" />}
              chevron={false}
              compact
              onPress={() => setSheet({ kind: 'rename', a: shown.a })}
            />
            {shown.a.starts_on <= today ? (
              <ListRow
                title="End program"
                leading={<IconTile icon="stop-circle-outline" />}
                chevron={false}
                compact
                onPress={() => setSheet({ kind: 'end', a: shown.a })}
              />
            ) : null}
            <ListRow
              title="Take off plan"
              titleTone="danger"
              leading={<IconTile icon="trash-outline" color={Colors.danger} />}
              chevron={false}
              compact
              last
              onPress={() => openAfter(() => takeOff(shown.a))}
            />
          </Group>
        ) : null}
        {shown?.kind === 'end' ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            {addDaysTo(thisMonday, 6) < shown.a.ends_on ? (
              <ListRow
                title={`End after this week (${shortDate(fromDayKey(addDaysTo(thisMonday, 6)))})`}
                chevron={false}
                compact
                onPress={() => openAfter(() => endProgram(shown.a, addDaysTo(thisMonday, 6)))}
              />
            ) : null}
            <ListRow
              title="End today"
              chevron={false}
              compact
              last
              onPress={() => openAfter(() => endProgram(shown.a, today))}
            />
          </Group>
        ) : null}
        {shown?.kind === 'rename' ? (
          <NameForm
            key={`rename-${shown.a.id}`}
            label="Name"
            start={shown.a.name}
            submitLabel="Save"
            onSubmit={(name) => rename(shown.a, name)}
          />
        ) : null}
        {shown?.kind === 'save' ? (
          <NameForm
            key={`save-${shown.a.id}`}
            label="Program name"
            start={`${shown.a.name} (${client.first_name})`}
            hint={`A new program in your programs, with ${client.first_name}’s version of the workouts, weeks and days.`}
            submitLabel="Save"
            onSubmit={(name) => saveTemplate(shown.a, name)}
          />
        ) : null}
        {shown?.kind === 'past' ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            {past.map((a, i) => (
              <ListRow
                key={a.id}
                title={a.name}
                subtitle={`${shortDate(fromDayKey(a.starts_on))} to ${shortDate(fromDayKey(a.ends_on))}`}
                trailing={
                  <Button
                    title="Save as template"
                    variant="secondary"
                    size="small"
                    onPress={() => setSheet({ kind: 'save', a })}
                  />
                }
                chevron={false}
                last={i === past.length - 1}
              />
            ))}
          </Group>
        ) : null}
        {shown?.kind === 'row' ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="Days and note"
              leading={<IconTile icon="calendar-outline" />}
              chevron={false}
              compact
              onPress={() => setSheet({ kind: 'days', item: shown.item })}
            />
            {singles.length > 1 ? (
              <>
                <ListRow
                  title="Move up"
                  leading={<IconTile icon="arrow-up" />}
                  chevron={false}
                  compact
                  onPress={() => {
                    setSheet(null);
                    reorder(shown.item, -1);
                  }}
                />
                <ListRow
                  title="Move down"
                  leading={<IconTile icon="arrow-down" />}
                  chevron={false}
                  compact
                  onPress={() => {
                    setSheet(null);
                    reorder(shown.item, 1);
                  }}
                />
              </>
            ) : null}
            <ListRow
              title="Remove from plan"
              titleTone="danger"
              leading={<IconTile icon="trash-outline" color={Colors.danger} />}
              chevron={false}
              compact
              last
              onPress={() => openAfter(() => remove(shown.item))}
            />
          </Group>
        ) : null}
        {shown?.kind === 'days' ? (
          <DaysForm
            key={shown.item.id}
            days={shown.item.weekdays}
            note={shown.item.note}
            clientName={client.first_name}
            submitLabel="Save"
            onSubmit={(weekdays, note) => saveDays(shown.item, weekdays, note)}
            backLabel="Cancel"
            onBack={() => setSheet(null)}
          />
        ) : null}
      </Sheet>

      <AddToPlanSheet
        visible={adding}
        onClose={() => setAdding(false)}
        client={{ id: client.id, first_name: client.first_name, last_name: client.last_name }}
        onAdded={load}
      />
    </View>
  );
}

function sheetTitle(sheet: SheetState | null, first: string) {
  switch (sheet?.kind) {
    case 'more':
      return sheet.a.name;
    case 'end':
      return `End ${sheet.a.name}`;
    case 'rename':
      return 'Rename';
    case 'save':
      return 'Save as template';
    case 'past':
      return 'Past programs';
    case 'row':
    case 'days':
      return sheet.item.workouts?.name ?? 'Workout';
    default:
      return `${first}’s plan`;
  }
}

// A program on the plan: where it is, a bar of the weeks gone, Save as template and More.
function ProgramCard({
  a,
  today,
  onSave,
  onMore,
}: {
  a: PlanAssignment;
  today: string;
  onSave: () => void;
  onMore: () => void;
}) {
  const where = programWeek(a, today);
  const ends = shortDate(fromDayKey(a.ends_on));
  const line = !where.started
    ? `Starts ${longDate(fromDayKey(a.starts_on))}`
    : where.last
      ? `Last week · ends ${ends}`
      : `Week ${where.week} of ${where.weeks} · ends ${ends}`;
  const total = Math.max(1, daysBetween(a.starts_on, a.ends_on) + 1);
  const gone = where.started ? Math.min(1, (daysBetween(a.starts_on, today) + 1) / total) : 0;
  return (
    <View testID={`plan-program-${a.id}`}>
      <Card>
        <View style={{ gap: Spacing.two }}>
          <Text variant="title" numberOfLines={2}>
            {a.name}
          </Text>
          <Text variant="footnote" tone="secondary" style={Tabular}>
            {line}
          </Text>
          <ProgressBar progress={gone} />
          <View style={styles.cardActions}>
            <Button
              title="Save as template"
              variant="secondary"
              size="small"
              onPress={onSave}
              testID="plan-save-template"
            />
            <View style={{ flex: 1 }} />
            <IconButton
              icon="ellipsis-horizontal"
              tone="secondary"
              label={`More for ${a.name}`}
              onPress={onMore}
              testID="plan-program-more"
            />
          </View>
        </View>
      </Card>
    </View>
  );
}

// One workout in the week: its name, its note, Done once ticked, and a menu for single workouts.
function PlanRow({ item, done, last, onMenu }: { item: PlanItem; done: boolean; last: boolean; onMenu?: () => void }) {
  const name = item.workouts?.name ?? 'Workout';
  return (
    <View>
      <ListRow
        title={name}
        titleLines={2}
        subtitle={item.note ? `“${item.note}”` : undefined}
        status={done ? <StatusPill tone="success" label="Done" /> : null}
        // The menu takes the chevron's place, as on the Programs tab's rows.
        trailing={onMenu ? <View style={styles.room} /> : null}
        chevron={onMenu ? false : undefined}
        onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.workout_id } })}
        accessibilityLabel={`${name}${item.note ? `, note: ${item.note}` : ''}${done ? ', done' : ''}`}
        last={last}
      />
      {onMenu ? (
        <View style={styles.menu} pointerEvents="box-none">
          <IconButton icon="ellipsis-horizontal" tone="secondary" label={`Options for ${name}`} onPress={onMenu} />
        </View>
      ) : null}
    </View>
  );
}

// A name to save: rename a program on the plan, or save it as a new program.
function NameForm({
  label,
  start,
  hint,
  submitLabel,
  onSubmit,
}: {
  label: string;
  start: string;
  hint?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(start.slice(0, NAME_MAX));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give it a name.');
    setBusy(true);
    setError(null);
    const problem = await onSubmit(trimmed);
    setBusy(false);
    if (problem) {
      haptic.warning();
      setError(problem);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <TextField label={label} value={name} onChangeText={setName} maxLength={NAME_MAX} autoCapitalize="words" />
      {hint ? (
        <Text variant="footnote" tone="secondary">
          {hint}
        </Text>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button title={submitLabel} onPress={submit} loading={busy} />
    </View>
  );
}

const styles = themed(() => ({
  week: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
    marginRight: -Spacing.two,
  },
  room: {
    width: 44,
    height: 44,
  },
  menu: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.gutter,
    justifyContent: 'center',
  },
}));
