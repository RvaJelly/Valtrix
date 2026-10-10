import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { HeaderTextButton } from '@/components/header-button';
import { Sheet } from '@/components/sheet';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Section,
  Skeleton,
  SkeletonRows,
  Text,
  TextField,
} from '@/components/ui';
import { WorkoutVideo } from '@/components/workout-video';
import { Colors, Fonts, Spacing, Tabular, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { removeWorkoutVideos, VIDEO_TIP } from '@/lib/workout-videos';
import {
  MUSCLE_GROUPS,
  WORKOUT_COLUMNS,
  WORKOUT_EXERCISE_COLUMNS,
  workoutSummary,
  type Workout,
  type WorkoutExercise,
} from '@/lib/workouts';

type Editable = Pick<WorkoutExercise, 'sets' | 'reps' | 'weight' | 'weight_unit' | 'rest_seconds'>;

// "2 min rest", "90 s rest", "No rest".
function restLabel(seconds: number | null) {
  if (seconds == null) return null;
  if (seconds === 0) return 'No rest';
  if (seconds % 60 === 0) return `${seconds / 60} min rest`;
  return `${seconds} s rest`;
}

export default function WorkoutEditor() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<WorkoutExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Edit mode: rename, reorder and remove. The rest of the time the page reads like the client's.
  const [editing, setEditing] = useState(false);
  // The exercise whose sets and reps are open, the one whose menu is open, and the videos sheet.
  const [detail, setDetail] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [videos, setVideos] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  // What the row menu does once it has slid away: an iPhone shows one sheet or alert at a time.
  const afterMenu = useRef<(() => void) | null>(null);
  const { settings } = useSettings();

  // A weight keeps the unit it was written in, so switching Settings > Weight units
  // doesn't change what clients already see. New weights use the current setting.
  const unitOf = (item: Pick<WorkoutExercise, 'weight' | 'weight_unit'>) =>
    item.weight ? (item.weight_unit ?? settings.units) : settings.units;

  // "4 × 6–8 · 70 kg · 2 min rest"
  const line = (item: WorkoutExercise) =>
    [`${item.sets} × ${item.reps}`, item.weight ? `${item.weight} ${unitOf(item)}` : null, restLabel(item.rest_seconds)]
      .filter(Boolean)
      .join(' · ');

  const load = useCallback(async () => {
    const [w, rows] = await Promise.all([
      supabase.from('workouts').select(WORKOUT_COLUMNS).eq('id', id).maybeSingle(),
      supabase.from('workout_exercises').select(WORKOUT_EXERCISE_COLUMNS).eq('workout_id', id).order('position'),
    ]);
    if (w.error || rows.error) return setError(plainError(w.error ?? rows.error));
    if (!w.data) return setError('This workout could not be found.');
    setWorkout(w.data as Workout);
    setName((current) => current || w.data!.name);
    setItems(rows.data as unknown as WorkoutExercise[]);
  }, [id]);

  // Reload when coming back from the exercise picker.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function saveName() {
    const trimmed = name.trim();
    // An empty name is never saved, and says so, rather than quietly putting the old one back.
    if (workout && !trimmed) return setNameError('Give the workout a name.');
    if (!workout || trimmed === workout.name) return;
    const { error } = await supabase.from('workouts').update({ name: trimmed }).eq('id', id);
    if (error) setError(plainError(error));
    else setWorkout({ ...workout, name: trimmed });
  }

  async function saveWorkoutVideo(path: string | null) {
    const { error } = await supabase.from('workouts').update({ video_path: path }).eq('id', id);
    if (error) return plainError(error);
    setWorkout((w) => (w ? { ...w, video_path: path } : w));
    return null;
  }

  async function saveItemVideo(itemId: string, path: string | null) {
    const { error } = await supabase.from('workout_exercises').update({ video_path: path }).eq('id', itemId);
    if (error) return plainError(error);
    setItems((list) => list?.map((it) => (it.id === itemId ? { ...it, video_path: path } : it)) ?? null);
    return null;
  }

  async function saveItem(itemId: string, changes: Partial<Editable>) {
    const { error } = await supabase.from('workout_exercises').update(changes).eq('id', itemId);
    if (error) return plainError(error);
    setItems((list) => list?.map((it) => (it.id === itemId ? { ...it, ...changes } : it)) ?? null);
    return null;
  }

  async function move(index: number, direction: -1 | 1) {
    if (!items) return;
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    haptic.select();
    const a = items[index];
    const b = items[other];
    const next = [...items];
    next[index] = { ...b, position: a.position };
    next[other] = { ...a, position: b.position };
    setItems(next);
    const results = await Promise.all([
      supabase.from('workout_exercises').update({ position: b.position }).eq('id', a.id),
      supabase.from('workout_exercises').update({ position: a.position }).eq('id', b.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed) setError(plainError(failed.error));
  }

  async function remove(itemId: string) {
    const item = items?.find((it) => it.id === itemId);
    const video = item?.video_path;
    const what = `${item?.exercises.name ?? 'It'} comes out of this workout`;
    const message = video ? `${what}, and its demo video is deleted.` : `${what}.`;
    if (!(await confirm('Remove exercise?', message, 'Remove'))) return;
    setItems((list) => list?.filter((it) => it.id !== itemId) ?? null);
    const { error } = await supabase.from('workout_exercises').delete().eq('id', itemId);
    if (error) setError(plainError(error));
    else await removeWorkoutVideos([video]);
  }

  async function deleteWorkout() {
    const message = 'It also comes off any client plans it is in. This cannot be undone.';
    if (!(await confirm('Delete workout?', message, 'Delete'))) return;
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) return setError(plainError(error));
    await removeWorkoutVideos([workout?.video_path, ...(items ?? []).map((it) => it.video_path)]);
    goBack('/programs');
  }

  if (!workout || !items) {
    return error ? (
      <EmptyState
        icon="barbell-outline"
        title="Workout not found"
        message={error}
        action={<Button title="Back to programs" variant="secondary" onPress={() => goBack('/programs')} />}
      />
    ) : (
      <View style={styles.content}>
        <View style={{ gap: Spacing.two }}>
          <Skeleton width="60%" height={26} />
          <Skeleton width={140} height={14} />
        </View>
        <Group>
          <SkeletonRows count={4} />
        </Group>
      </View>
    );
  }

  const addExercise = () => router.push({ pathname: '/exercises', params: { workoutId: id } });
  const withVideo = items.filter((it) => it.video_path || it.exercises.video_path).length;
  const anyVideo = !!workout.video_path || withVideo > 0;
  const detailItem = items.find((it) => it.id === detail) ?? null;
  const menuIndex = items.findIndex((it) => it.id === menu);
  const menuItem = menuIndex >= 0 ? items[menuIndex] : null;

  function fromMenu(action: () => void) {
    setMenu(null);
    // Android has no "sheet has gone" signal, and shows the next one over it fine.
    if (Platform.OS === 'android') action();
    else afterMenu.current = action;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: workout.name,
          headerTitle: '',
          headerRight: () => (
            <HeaderTextButton
              title={editing ? 'Done' : 'Edit'}
              accessibilityLabel={editing ? 'Done editing' : 'Edit workout'}
              onPress={() => {
                if (editing && !name.trim()) return setNameError('Give the workout a name.');
                if (editing) saveName();
                setEditing(!editing);
              }}
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {editing ? (
          <TextField
            label="Workout name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (text.trim()) setNameError(undefined);
            }}
            error={nameError}
            onBlur={saveName}
            onSubmitEditing={saveName}
            autoCapitalize="words"
            maxLength={120}
          />
        ) : (
          <View style={{ gap: Spacing.one }}>
            <Text variant="title" numberOfLines={3} accessibilityRole="header">
              {workout.name}
            </Text>
            {items.length ? (
              <Text variant="footnote" tone="secondary" style={Tabular}>
                {workoutSummary(items)}
              </Text>
            ) : null}
          </View>
        )}
        <ErrorText>{error}</ErrorText>

        {items.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No exercises yet"
            message="Add exercises from the library, then set the sets, reps and rest for each."
            action={<Button title="Add exercise" onPress={addExercise} />}
          />
        ) : (
          <Section title="Exercises">
            <Group>
              {items.map((item, index) => (
                <ListRow
                  key={item.id}
                  title={item.exercises.name}
                  titleLines={2}
                  subtitle={
                    <Text variant="footnote" tone="secondary" numberOfLines={2}>
                      {line(item)}
                    </Text>
                  }
                  leading={
                    <Text variant="headline" tone="tertiary" style={styles.number}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  }
                  trailing={
                    // One menu button per row keeps every row the same height; moving is in the menu.
                    editing ? (
                      <IconButton
                        icon="ellipsis-horizontal"
                        tone="secondary"
                        label={`More for ${item.exercises.name}`}
                        onPress={() => setMenu(item.id)}
                      />
                    ) : null
                  }
                  onPress={editing ? undefined : () => setDetail(item.id)}
                  accessibilityLabel={`${index + 1}. ${item.exercises.name}, ${line(item)}. Change sets and reps`}
                  last={index === items.length - 1}
                />
              ))}
            </Group>
          </Section>
        )}

        {items.length ? (
          <Section title="Videos">
            <Group>
              <ListRow
                title={anyVideo ? 'Videos' : 'Add videos'}
                subtitle={
                  anyVideo
                    ? [
                        workout.video_path ? 'Workout video' : null,
                        `${withVideo} of ${items.length} ${items.length === 1 ? 'demo' : 'demos'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Follow-along and demos'
                }
                leading={<IconTile icon="videocam-outline" />}
                onPress={() => setVideos(true)}
                last
              />
            </Group>
          </Section>
        ) : null}

        {items.length ? (
          <View style={{ gap: Spacing.tight }}>
            <Button title="Add exercise" icon="add" variant="secondary" onPress={addExercise} />
            <Button title="Delete workout" variant="destructive" onPress={deleteWorkout} />
          </View>
        ) : (
          <Button title="Delete workout" variant="destructive" onPress={deleteWorkout} />
        )}
      </ScrollView>

      <Sheet visible={!!detailItem} onClose={() => setDetail(null)} title={detailItem?.exercises.name}>
        {detailItem ? (
          <ExerciseDetails
            key={detailItem.id}
            item={detailItem}
            unit={unitOf(detailItem)}
            onSave={async (changes) => {
              const problem = await saveItem(detailItem.id, changes);
              if (!problem) setDetail(null);
              return problem;
            }}
          />
        ) : null}
      </Sheet>

      <Sheet
        visible={!!menuItem}
        onClose={() => setMenu(null)}
        onClosed={() => {
          const action = afterMenu.current;
          afterMenu.current = null;
          action?.();
        }}
        title={menuItem?.exercises.name}>
        {menuItem ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="Change sets and reps"
              leading={<IconTile icon="create-outline" />}
              compact
              onPress={() => {
                const itemId = menuItem.id;
                fromMenu(() => setDetail(itemId));
              }}
            />
            {menuIndex > 0 ? (
              <ListRow
                title="Move up"
                leading={<IconTile icon="arrow-up" />}
                chevron={false}
                compact
                accessibilityLabel={`Move ${menuItem.exercises.name} up`}
                onPress={() => {
                  setMenu(null);
                  move(menuIndex, -1);
                }}
              />
            ) : null}
            {menuIndex < items.length - 1 ? (
              <ListRow
                title="Move down"
                leading={<IconTile icon="arrow-down" />}
                chevron={false}
                compact
                accessibilityLabel={`Move ${menuItem.exercises.name} down`}
                onPress={() => {
                  setMenu(null);
                  move(menuIndex, 1);
                }}
              />
            ) : null}
            <ListRow
              title="Remove from workout"
              titleTone="danger"
              leading={<IconTile icon="trash-outline" color={Colors.danger} />}
              chevron={false}
              compact
              last
              onPress={() => {
                const itemId = menuItem.id;
                fromMenu(() => remove(itemId));
              }}
            />
          </Group>
        ) : null}
      </Sheet>

      <Sheet visible={videos} onClose={() => setVideos(false)} title="Videos">
        <View style={{ gap: Spacing.one }}>
          <Text variant="callout" tone="secondary">
            Clients with this workout in their plan can watch these in the Voltrix app.
          </Text>
          {/* The size limit, said once for every video below. */}
          <Text variant="footnote" tone="secondary">
            {VIDEO_TIP}
          </Text>
        </View>
        <Card style={styles.videoCard}>
          <WorkoutVideo
            label="Workout video"
            path={workout.video_path}
            onChange={saveWorkoutVideo}
            title={workout.name}
            hint={false}
          />
        </Card>
        <Text variant="label" tone="secondary" accessibilityRole="header" style={{ marginTop: Spacing.two }}>
          Demos
        </Text>
        <Card style={[styles.videoCard, { gap: Spacing.one }]}>
          {items.map((item, index) => (
            <View key={item.id} style={index > 0 ? styles.videoLine : undefined}>
              <WorkoutVideo
                label={item.exercises.name}
                path={item.video_path}
                onChange={(path) => saveItemVideo(item.id, path)}
                fallback={
                  item.exercises.video_path ? { path: item.exercises.video_path, note: 'From the exercise' } : null
                }
                title={item.exercises.name}
                hint={false}
              />
            </View>
          ))}
        </Card>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

// Sets, reps, weight and rest for one exercise, saved together.
function ExerciseDetails({
  item,
  unit,
  onSave,
}: {
  item: WorkoutExercise;
  unit: 'kg' | 'lb';
  onSave: (changes: Partial<Editable>) => Promise<string | null>;
}) {
  const [sets, setSets] = useState(String(item.sets));
  const [reps, setReps] = useState(item.reps);
  const [weight, setWeight] = useState(item.weight ?? '');
  const [rest, setRest] = useState(item.rest_seconds == null ? '' : String(item.rest_seconds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    const parsedRest = parseInt(rest, 10);
    const cleanWeight = weight.trim().slice(0, 30) || null;
    const problem = await onSave({
      sets: Math.min(20, Math.max(1, parseInt(sets, 10) || 1)),
      reps: reps.trim().slice(0, 30) || '10',
      weight: cleanWeight,
      weight_unit: cleanWeight ? unit : null,
      rest_seconds: Number.isNaN(parsedRest) ? null : Math.min(900, Math.max(0, parsedRest)),
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Text variant="footnote" tone="secondary">
        {MUSCLE_GROUPS[item.exercises.muscle_group]}
      </Text>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <TextField label="Sets" value={sets} onChangeText={setSets} keyboardType="number-pad" maxLength={2} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Reps" value={reps} onChangeText={setReps} placeholder="For example 8–10" maxLength={30} />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <TextField
            label={`Weight in ${unit}`}
            optional
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            maxLength={30}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Rest in seconds"
            optional
            value={rest}
            onChangeText={setRest}
            keyboardType="number-pad"
            placeholder="For example 90"
            maxLength={3}
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  number: {
    ...Tabular,
    width: 28,
    fontFamily: Fonts.displaySemi,
  },
  // Two fields side by side; their boxes line up even when one label takes two lines.
  pair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.tight,
  },
  videoCard: {
    paddingVertical: Spacing.two,
    backgroundColor: Colors.tint,
  },
  videoLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
}));
