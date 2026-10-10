import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { WorkoutPicker } from '@/components/add-to-plan-sheet';
import { DaysPicker } from '@/components/days-form';
import { GiveProgramSheet } from '@/components/give-program-sheet';
import { HeaderTextButton } from '@/components/header-button';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { daysPerWeek, slotWeeks, weekRanges } from '@/lib/plan-dates';
import { daysLabel } from '@/lib/plans';
import {
  daysLabelShort,
  DESCRIPTION_MAX,
  duplicateProgram,
  NAME_MAX,
  NOTE_MAX,
  PROGRAM_COLUMNS,
  rangeLabel,
  SLOT_COLUMNS,
  weeksLabel,
  type Program,
  type ProgramSlot,
} from '@/lib/programs';
import { addError, addFailure, saveError } from '@/lib/save-error';
import { dayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { removeUnusedVideos } from '@/lib/workout-videos';
import { workoutSummary } from '@/lib/workouts';

type Slot = ProgramSlot & {
  workouts: { name: string; workout_exercises: { sets: number; rest_seconds: number | null }[] | null } | null;
};

type Panel = { kind: 'add' } | { kind: 'slot'; id: string } | { kind: 'more' };

const MAX_WEEKS = 52;

// A program: its workouts on weekdays, week by week. Read first; Edit changes the name, weeks,
// description and each workout's days and weeks. Give to a client is the main action.
export default function ProgramPage() {
  const params = useLocalSearchParams<{ id: string; edit?: string; add?: string }>();
  const id = params.id;
  const goBack = useGoBack();
  const toast = useToast();
  const [program, setProgram] = useState<Program | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [clients, setClients] = useState(0);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState(params.edit === '1');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(params.add === '1' ? { kind: 'add' } : null);
  // The panel keeps its content while it slides away.
  const [lastPanel, setLastPanel] = useState<Panel | null>(panel);
  if (panel && panel !== lastPanel) setLastPanel(panel);
  const [giving, setGiving] = useState(false);
  // What a panel does once it has slid away: an iPhone shows one sheet or alert at a time.
  const after = useRef<(() => void) | null>(null);
  const loads = useRef(0);
  const weekSaves = useRef(0);
  const filled = useRef(false);
  const showSkeleton = useDelayed(300);

  const load = useCallback(async () => {
    const n = ++loads.current;
    const [p, s, a] = await Promise.all([
      supabase.from('programs').select(PROGRAM_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('program_slots')
        .select(`${SLOT_COLUMNS}, workouts(name, workout_exercises(sets, rest_seconds))`)
        .eq('program_id', id)
        .order('position'),
      supabase.from('plan_assignments').select('client_id').eq('program_id', id).gte('ends_on', dayKey(new Date())),
    ]);
    if (n !== loads.current) return;
    if (p.error || s.error) return setFailed(true);
    setFailed(false);
    if (!p.data) return setMissing(true);
    const found = p.data as Program;
    setProgram(found);
    setSlots((s.data ?? []) as unknown as Slot[]);
    setClients(new Set(((a.data ?? []) as { client_id: string }[]).map((r) => r.client_id)).size);
    if (!filled.current) {
      filled.current = true;
      setName(found.name);
      setDescription(found.description ?? '');
    }
  }, [id]);

  // Coming back from a workout's editor brings its changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  function closePanel() {
    setPanel(null);
    if (params.add) router.setParams({ add: undefined });
  }

  function fromPanel(action: () => void) {
    closePanel();
    // Android has no "sheet has gone" signal, and shows the next one over it fine.
    if (Platform.OS === 'android') action();
    else after.current = action;
  }

  async function saveName() {
    if (!program) return;
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Give the program a name.');
    if (trimmed === program.name) return;
    const { error } = await supabase.from('programs').update({ name: trimmed }).eq('id', id);
    if (error) return setError(saveError(error));
    setProgram((p) => (p ? { ...p, name: trimmed } : p));
  }

  async function saveDescription() {
    if (!program) return;
    const trimmed = description.trim();
    if (trimmed === (program.description ?? '')) return;
    const { error } = await supabase
      .from('programs')
      .update({ description: trimmed || null })
      .eq('id', id);
    if (error) return setError(saveError(error));
    setProgram((p) => (p ? { ...p, description: trimmed || null } : p));
  }

  async function changeWeeks(next: number) {
    if (!program || next < 1 || next > MAX_WEEKS) return;
    setProgram((p) => (p ? { ...p, weeks: next } : p));
    const n = ++weekSaves.current;
    const { error } = await supabase.from('programs').update({ weeks: next }).eq('id', id);
    if (n !== weekSaves.current) return;
    if (error) {
      haptic.warning();
      setError(saveError(error));
      load();
    }
  }

  function toggleEditing() {
    if (!program) return;
    if (editing) {
      if (!name.trim()) return setNameError('Give the program a name.');
      saveName();
      saveDescription();
    } else {
      setName(program.name);
      setDescription(program.description ?? '');
      setNameError(undefined);
    }
    setError(null);
    setEditing(!editing);
  }

  // A workout picked or made for the program goes in from week 1 on any day; its days and weeks
  // come next.
  async function addSlot(workout: { id: string; name: string }) {
    const position = (slots ?? []).reduce((max, s) => Math.max(max, s.position + 1), 0);
    const { data, error } = await supabase
      .from('program_slots')
      .insert({ program_id: id, workout_id: workout.id, week_from: 1, week_to: null, weekdays: [], position })
      .select(SLOT_COLUMNS)
      .single();
    if (error) {
      haptic.warning();
      closePanel();
      setError(await addError(error));
      return;
    }
    haptic.success();
    const slot = { ...(data as ProgramSlot), workouts: { name: workout.name, workout_exercises: null } };
    setSlots((list) => [...(list ?? []), slot]);
    setPanel({ kind: 'slot', id: slot.id });
    load();
  }

  async function saveSlot(slot: Slot, changes: Pick<ProgramSlot, 'weekdays' | 'week_from' | 'week_to' | 'note'>) {
    const { error } = await supabase.from('program_slots').update(changes).eq('id', slot.id);
    if (error) return saveError(error);
    haptic.success();
    setSlots((list) => list?.map((s) => (s.id === slot.id ? { ...s, ...changes } : s)) ?? null);
    closePanel();
    return null;
  }

  // Takes a workout out: its slot, then the program's copy when nothing else uses it.
  async function removeSlot(slot: Slot) {
    const title = slot.workouts?.name ?? 'this workout';
    const shared = (slots ?? []).some((s) => s.id !== slot.id && s.workout_id === slot.workout_id);
    const ok = await confirm(
      `Remove ${title}?`,
      shared
        ? 'It comes off these weeks. Clients who have the program keep their own copy.'
        : 'It comes out of this program. Clients who have the program keep their own copy.',
      'Remove',
    );
    if (!ok) return;
    const videos = shared
      ? null
      : await supabase
          .from('workouts')
          .select('video_path, workout_exercises(video_path)')
          .eq('id', slot.workout_id)
          .maybeSingle();
    setSlots((list) => list?.filter((s) => s.id !== slot.id) ?? null);
    const { error } = await supabase.from('program_slots').delete().eq('id', slot.id);
    if (error) {
      haptic.warning();
      setError(saveError(error));
      return load();
    }
    if (!shared) {
      const gone = await supabase.from('workouts').delete().eq('id', slot.workout_id).eq('program_id', id);
      const v = videos?.data as {
        video_path: string | null;
        workout_exercises: { video_path: string | null }[];
      } | null;
      if (!gone.error && v)
        await removeUnusedVideos([v.video_path, ...(v.workout_exercises ?? []).map((e) => e.video_path)]);
    }
  }

  async function duplicate() {
    closePanel();
    try {
      const copy = await duplicateProgram(id);
      haptic.success();
      toast('Copy made');
      router.push({ pathname: '/programs/[id]', params: { id: copy } });
    } catch (e) {
      haptic.warning();
      toast(await addFailure(e));
    }
  }

  async function remove() {
    if (!program) return;
    const ok = await confirm(`Delete ${program.name}?`, 'Clients who have it keep their own copy.', 'Delete');
    if (!ok) return;
    const { data: used } = await supabase
      .from('workouts')
      .select('video_path, workout_exercises(video_path)')
      .eq('program_id', id);
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) {
      haptic.warning();
      return setError(saveError(error));
    }
    const rows = (used ?? []) as { video_path: string | null; workout_exercises: { video_path: string | null }[] }[];
    await removeUnusedVideos(
      rows.flatMap((w) => [w.video_path, ...(w.workout_exercises ?? []).map((e) => e.video_path)]),
    );
    toast(`${program.name} deleted`);
    goBack({ pathname: '/programs', params: { tab: 'programs' } });
  }

  if (missing) {
    return (
      <EmptyState
        icon="layers-outline"
        title="Program not found"
        message="It may have been deleted."
        action={<Button title="Back to programs" variant="secondary" onPress={() => goBack('/programs')} />}
      />
    );
  }

  if (!program || !slots) {
    return (
      <View style={styles.content}>
        <Stack.Screen options={{ title: 'Program', headerTitle: '' }} />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            The program couldn’t be loaded.
          </Notice>
        ) : showSkeleton ? (
          <>
            <View style={{ gap: Spacing.two }}>
              <Skeleton width={140} height={12} />
              <Skeleton width="70%" height={30} />
              <Skeleton width={180} height={14} />
            </View>
            <Group>
              <SkeletonRows count={4} />
            </Group>
          </>
        ) : null}
      </View>
    );
  }

  const weeks = program.weeks;
  const days = daysPerWeek(slots, weeks);
  const ranges = weekRanges(slots, weeks);
  const later = slots.filter((s) => !slotWeeks(s, weeks));
  const canGive = slots.some((s) => s.week_from <= weeks);
  const shown = panel ?? lastPanel;
  const panelSlot = shown?.kind === 'slot' ? (slots.find((s) => s.id === shown.id) ?? null) : null;
  const facts = [
    days ? daysLabelShort(days) : null,
    clients ? `on ${clients} ${clients === 1 ? 'client' : 'clients'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const slotRow = (s: Slot, i: number, list: Slot[], ended?: boolean) => {
    const title = s.workouts?.name ?? 'Workout';
    const summary = s.workouts?.workout_exercises ? workoutSummary(s.workouts.workout_exercises) : null;
    const line = [daysLabel(s.weekdays), summary].filter(Boolean).join(' · ');
    return (
      <View key={s.id}>
        <ListRow
          title={title}
          titleTone={ended ? 'tertiary' : undefined}
          subtitle={
            <View style={{ gap: 2 }}>
              <Text variant="footnote" tone={ended ? 'tertiary' : 'secondary'} style={Tabular}>
                {line}
              </Text>
              {s.note ? (
                <Text variant="footnote" tone="tertiary" numberOfLines={2}>
                  {s.note}
                </Text>
              ) : null}
            </View>
          }
          leading={<IconTile icon="barbell-outline" />}
          trailing={editing ? <View style={styles.room} /> : undefined}
          chevron={editing ? false : undefined}
          onPress={
            editing
              ? () => setPanel({ kind: 'slot', id: s.id })
              : () => router.push({ pathname: '/workouts/[id]', params: { id: s.workout_id } })
          }
          accessibilityLabel={`${title}, ${line}${s.note ? `, ${s.note}` : ''}. ${
            editing ? 'Change days and weeks' : 'Open workout'
          }`}
          testID={`program-slot-${s.id}`}
          last={i === list.length - 1}
        />
        {editing ? (
          <View style={styles.rowAction} pointerEvents="box-none">
            <IconButton icon="close" tone="secondary" label={`Remove ${title}`} onPress={() => removeSlot(s)} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: program.name,
          headerTitle: '',
          headerRight: () => (
            <View style={styles.headerActions}>
              <HeaderTextButton
                title={editing ? 'Done' : 'Edit'}
                accessibilityLabel={editing ? 'Done editing' : 'Edit program'}
                onPress={toggleEditing}
                testID="program-edit"
              />
              {editing ? null : (
                <IconButton
                  icon="ellipsis-horizontal"
                  label={`More for ${program.name}`}
                  onPress={() => setPanel({ kind: 'more' })}
                  testID="program-more"
                  style={styles.headerMore}
                />
              )}
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? (
          <View style={{ gap: Spacing.three }}>
            <TextField
              label="Program name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (text.trim()) setNameError(undefined);
              }}
              error={nameError}
              onBlur={saveName}
              onSubmitEditing={saveName}
              autoCapitalize="words"
              maxLength={NAME_MAX}
            />
            <Stepper
              label="Weeks"
              value={String(weeks)}
              spoken={weeksLabel(weeks)}
              onLess={() => changeWeeks(weeks - 1)}
              onMore={() => changeWeeks(weeks + 1)}
              lessDisabled={weeks <= 1}
              moreDisabled={weeks >= MAX_WEEKS}
              testID="program-weeks"
            />
            <TextField
              label="Description"
              optional
              value={description}
              onChangeText={setDescription}
              onBlur={saveDescription}
              multiline
              maxLength={DESCRIPTION_MAX}
              autoCapitalize="sentences"
              placeholder="What it’s for and who it suits"
              style={styles.multiline}
            />
          </View>
        ) : (
          <View style={{ gap: Spacing.tight }}>
            <PageHeader eyebrow={`Program · ${weeksLabel(weeks)}`} title={program.name} />
            {facts ? (
              <Text variant="footnote" tone="secondary" style={Tabular}>
                {facts.charAt(0).toUpperCase() + facts.slice(1)}
              </Text>
            ) : null}
            {program.description ? (
              <Text variant="callout" tone="secondary">
                {program.description}
              </Text>
            ) : null}
          </View>
        )}

        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            Couldn’t refresh the program.
          </Notice>
        ) : null}
        <ErrorText>{error}</ErrorText>

        {slots.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No workouts in this program yet"
            message="Add a workout and pick its days and weeks."
            action={
              <Button
                title="Add a workout"
                variant="secondary"
                onPress={() => setPanel({ kind: 'add' })}
                testID="program-add-workout"
              />
            }
          />
        ) : (
          <>
            {ranges.map((range) => {
              const list = slots.filter((s) => {
                const r = slotWeeks(s, weeks);
                return r && r[0] === range[0] && r[1] === range[1];
              });
              return (
                <Section key={range.join('-')} title={rangeLabel(range)}>
                  <Group>{list.map((s, i) => slotRow(s, i, list))}</Group>
                </Section>
              );
            })}
            {later.length ? (
              <Section title="After the program ends">
                <Group>{later.map((s, i) => slotRow(s, i, later, true))}</Group>
                <Text variant="footnote" tone="tertiary">
                  These start after week {weeks}, so clients don’t get them. Add weeks or change their weeks.
                </Text>
              </Section>
            ) : null}
            {editing ? (
              <Button
                title="Add a workout"
                icon="add"
                variant="secondary"
                onPress={() => setPanel({ kind: 'add' })}
                testID="program-add-workout"
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {editing ? null : (
        <StickyFooter>
          <Button title="Give to a client" onPress={() => setGiving(true)} disabled={!canGive} testID="program-give" />
          {canGive ? null : (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              Add a workout to give this program.
            </Text>
          )}
        </StickyFooter>
      )}

      <Sheet
        visible={!!panel}
        onClose={closePanel}
        onClosed={() => {
          const action = after.current;
          after.current = null;
          action?.();
        }}
        title={
          shown?.kind === 'add'
            ? 'Add a workout'
            : shown?.kind === 'slot'
              ? (panelSlot?.workouts?.name ?? 'Days and weeks')
              : program.name
        }>
        {shown?.kind === 'add' ? (
          <WorkoutPicker program={id} onPick={addSlot} onClose={closePanel} />
        ) : shown?.kind === 'slot' && panelSlot ? (
          <SlotForm key={panelSlot.id} slot={panelSlot} weeks={weeks} onSave={(c) => saveSlot(panelSlot, c)} />
        ) : shown?.kind === 'more' ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="Duplicate"
              subtitle="A copy to change"
              leading={<IconTile icon="copy-outline" />}
              chevron={false}
              onPress={duplicate}
            />
            <ListRow
              title="Delete program"
              titleTone="danger"
              leading={<IconTile icon="trash-outline" color={Colors.danger} />}
              chevron={false}
              onPress={() => fromPanel(remove)}
              last
            />
          </Group>
        ) : null}
      </Sheet>

      <GiveProgramSheet
        visible={giving}
        onClose={() => setGiving(false)}
        program={{ id, name: program.name, weeks, days }}
        onGiven={load}
      />
    </KeyboardAvoidingView>
  );
}

// The weeks "To" can end on: each week from "From" up to the last, then "To the end".
function toChoices(from: number, weeks: number, current: number | null): (number | null)[] {
  const top = Math.max(weeks, from);
  const list: (number | null)[] = [];
  for (let w = from; w < top; w++) list.push(w);
  if (current != null && current >= top) list.push(current);
  list.push(null);
  return list;
}

// Which days a program workout is on, and in which weeks.
function SlotForm({
  slot,
  weeks,
  onSave,
}: {
  slot: Slot;
  weeks: number;
  onSave: (changes: Pick<ProgramSlot, 'weekdays' | 'week_from' | 'week_to' | 'note'>) => Promise<string | null>;
}) {
  const [days, setDays] = useState(slot.weekdays);
  const [from, setFrom] = useState(slot.week_from);
  const [to, setTo] = useState<number | null>(slot.week_to);
  const [note, setNote] = useState(slot.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = Math.max(weeks, slot.week_from);
  const choices = toChoices(from, weeks, to);
  const at = choices.indexOf(to);

  function stepFrom(by: number) {
    const next = Math.min(top, Math.max(1, from + by));
    setFrom(next);
    if (to != null && to < next) setTo(next >= weeks ? null : next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const problem = await onSave({ weekdays: days, week_from: from, week_to: to, note: note.trim() || null });
    setBusy(false);
    if (problem) {
      haptic.warning();
      setError(problem);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <DaysPicker
        value={days}
        onChange={setDays}
        hint={
          days.length
            ? `Clients see it on ${days.length === 1 ? 'that day' : 'those days'} in the Voltrix app.`
            : 'Clients can do it on any day, once a week.'
        }
      />
      <View style={{ gap: Spacing.two }}>
        <Stepper
          label="From week"
          value={String(from)}
          spoken={`Week ${from}`}
          onLess={() => stepFrom(-1)}
          onMore={() => stepFrom(1)}
          lessDisabled={from <= 1}
          moreDisabled={from >= top}
          testID="slot-from"
        />
        <Stepper
          label="To week"
          value={to == null ? 'The end' : String(to)}
          spoken={to == null ? `The end of the program, week ${weeks}` : `Week ${to}`}
          onLess={() => setTo(choices[Math.max(0, at - 1)] ?? null)}
          onMore={() => setTo(choices[Math.min(choices.length - 1, at + 1)] ?? null)}
          lessDisabled={at <= 0}
          moreDisabled={at >= choices.length - 1}
          testID="slot-to"
        />
        <Text variant="footnote" tone="secondary" style={Tabular}>
          {from > weeks
            ? `Week ${from} is after the program ends (week ${weeks}).`
            : `${rangeLabel([from, Math.min(to ?? weeks, weeks)])} of ${weeks}.`}
        </Text>
      </View>
      <TextField
        label="Note for clients"
        optional
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        autoCapitalize="sentences"
        placeholder="For example: Rest two minutes between sets"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} testID="slot-save" />
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The web header has no right inset of its own; the phones' headers do.
  headerMore: {
    marginRight: Platform.OS === 'web' ? Spacing.tight : 0,
  },
  multiline: {
    minHeight: 112,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  room: {
    width: 44,
    height: 44,
  },
  rowAction: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.gutter,
    justifyContent: 'center',
  },
}));
