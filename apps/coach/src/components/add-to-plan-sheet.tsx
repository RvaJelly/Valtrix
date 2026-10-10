import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { DaysForm } from '@/components/days-form';
import { ClientPicker, GiveProgramFlow, type ClientChoice } from '@/components/give-program-sheet';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  SearchField,
  Section,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { duplicateWorkout, giveWorkout } from '@/lib/programs';
import { addFailure } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';
import { startFromTemplate, templateSubtitle, type Template } from '@/lib/templates';
import { libraryOnly, workoutSummary } from '@/lib/workouts';

export type WorkoutChoice = { id: string; name: string };

type Step = 'choose' | 'client' | 'program' | 'workout' | 'days';

// Add to a client's plan: a program (the Give a program steps) or one workout on chosen days.
// Without a client (Programs › Workouts › Give to a client) the client comes first; with a
// workout, the days step follows.
export function AddToPlanSheet({
  visible,
  onClose,
  client,
  workout,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  client?: ClientChoice | null;
  workout?: WorkoutChoice | null;
  onAdded?: () => void;
}) {
  const [opened, setOpened] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpened((n) => n + 1);
  }
  return (
    <AddBody
      key={opened}
      visible={visible}
      onClose={onClose}
      client={client ?? null}
      workout={workout ?? null}
      onAdded={onAdded}
    />
  );
}

function AddBody({
  visible,
  onClose,
  client: knownClient,
  workout: knownWorkout,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  client: ClientChoice | null;
  workout: WorkoutChoice | null;
  onAdded?: () => void;
}) {
  const toast = useToast();
  const [client, setClient] = useState(knownClient);
  const [workout, setWorkout] = useState(knownWorkout);
  const [step, setStep] = useState<Step>(!knownClient ? 'client' : knownWorkout ? 'days' : 'choose');

  async function add(weekdays: number[], note: string | null) {
    if (!client || !workout) return null;
    try {
      await giveWorkout(workout.id, client.id, weekdays, note);
    } catch (e) {
      return addFailure(e);
    }
    haptic.success();
    onClose();
    onAdded?.();
    toast(`${workout.name} added to ${client.first_name}’s plan`, {
      action: {
        label: 'View',
        onPress: () => router.push({ pathname: '/clients/[id]', params: { id: client.id, tab: 'plan' } }),
      },
    });
    return null;
  }

  const title =
    step === 'client'
      ? workout
        ? `Give ${workout.name}`
        : 'Choose a client'
      : step === 'program'
        ? 'Give a program'
        : step === 'workout'
          ? 'Add a workout'
          : step === 'days' && workout
            ? workout.name
            : `Add to ${client?.first_name ?? 'their'}’s plan`;

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {step === 'client' ? (
        <ClientPicker
          title={workout ? `Who gets ${workout.name}? They get their own copy to change.` : undefined}
          onPick={(c) => {
            setClient(c);
            setStep(workout ? 'days' : 'choose');
          }}
        />
      ) : null}
      {step === 'choose' && client ? (
        <View style={{ gap: Spacing.three }}>
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="A program"
              subtitle="Weeks of workouts on set days"
              leading={<IconTile icon="layers-outline" />}
              onPress={() => setStep('program')}
              testID="add-plan-program"
            />
            <ListRow
              title="A workout"
              subtitle="One workout on the days you pick"
              leading={<IconTile icon="barbell-outline" />}
              onPress={() => setStep('workout')}
              testID="add-plan-workout"
              last
            />
          </Group>
        </View>
      ) : null}
      {step === 'program' && client ? (
        <GiveProgramFlow program={null} client={client} onClose={onClose} onGiven={onAdded} />
      ) : null}
      {step === 'workout' ? (
        <WorkoutPicker
          onPick={(w) => {
            setWorkout(w);
            setStep('days');
          }}
          onClose={onClose}
        />
      ) : null}
      {step === 'days' && client && workout ? (
        <DaysForm
          clientName={client.first_name}
          submitLabel="Add to plan"
          onSubmit={add}
          backLabel="Back"
          onBack={knownWorkout ? undefined : () => setStep('workout')}
          testID="add-plan-confirm"
        />
      ) : null}
    </Sheet>
  );
}

type LibraryWorkout = { id: string; name: string; workout_exercises: { sets: number; rest_seconds: number | null }[] };

// The trainer's own workouts, then the Voltrix workout templates (one picked is saved to their
// workouts first). For a program (`program`), what is picked becomes the program's own copy, and a
// new workout can be built for it.
export function WorkoutPicker({
  onPick,
  onClose,
  program,
}: {
  onPick: (workout: WorkoutChoice) => void;
  onClose: () => void;
  program?: string;
}) {
  const [workouts, setWorkouts] = useState<LibraryWorkout[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  useEffect(() => {
    let alive = true;
    Promise.all([
      libraryOnly(supabase.from('workouts').select('id, name, workout_exercises(sets, rest_seconds)')).order('name'),
      supabase
        .from('voltrix_templates')
        .select('id, slug, kind, name, summary, level, equipment, weeks, days_per_week, minutes, position')
        .eq('kind', 'workout')
        .order('position'),
    ]).then(([own, voltrix]) => {
      if (!alive) return;
      if (own.error) setError(plainError(own.error));
      setWorkouts((own.data ?? []) as unknown as LibraryWorkout[]);
      setTemplates((voltrix.data ?? []) as Template[]);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function pickTemplate(t: Template) {
    setUsing(t.id);
    setError(null);
    try {
      const id = await startFromTemplate(t.id, program);
      haptic.success();
      onPick({ id, name: t.name });
    } catch (e) {
      setError(await addFailure(e));
    }
    setUsing(null);
  }

  // A program gets its own copy of one of the trainer's workouts.
  async function pickOwn(w: LibraryWorkout) {
    if (!program) return onPick({ id: w.id, name: w.name });
    setUsing(w.id);
    setError(null);
    try {
      const id = await duplicateWorkout(w.id, program);
      onPick({ id, name: w.name });
    } catch (e) {
      setError(await addFailure(e));
    }
    setUsing(null);
  }

  function build() {
    onClose();
    router.push(program ? { pathname: '/workouts/new', params: { program } } : '/workouts/new');
  }

  const term = search.trim().toLowerCase();
  const mine = (workouts ?? []).filter((w) => !term || w.name.toLowerCase().includes(term));
  const theirs = templates.filter((t) => !term || t.name.toLowerCase().includes(term));
  return (
    <View style={{ gap: Spacing.three }}>
      {program ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title="New workout"
            subtitle="Build one for this program"
            leading={<IconTile icon="add" />}
            onPress={build}
            testID="add-workout-new"
            last
          />
        </Group>
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder="Search workouts" />
      <ErrorText>{error}</ErrorText>
      {!workouts ? (
        showSkeleton ? (
          <SkeletonRows count={4} />
        ) : null
      ) : (
        <>
          {workouts.length === 0 && !theirs.length && !program ? (
            <EmptyState
              compact
              icon="barbell-outline"
              title="No workouts yet"
              message="Build one first, then add it here."
              action={<Button title="Build a workout" variant="secondary" size="small" onPress={build} />}
            />
          ) : null}
          {mine.length ? (
            <Section title="Your workouts">
              <Group style={{ backgroundColor: Colors.tint }}>
                {mine.map((w, i) => (
                  <ListRow
                    key={w.id}
                    title={w.name}
                    subtitle={using === w.id ? 'Adding to the program…' : workoutSummary(w.workout_exercises ?? [])}
                    leading={<IconTile icon="barbell-outline" />}
                    onPress={() => {
                      if (!using) pickOwn(w);
                    }}
                    testID={`add-plan-workout-${w.id}`}
                    last={i === mine.length - 1}
                  />
                ))}
              </Group>
            </Section>
          ) : null}
          {theirs.length ? (
            <Section title="Voltrix templates">
              <Group style={{ backgroundColor: Colors.tint }}>
                {theirs.map((t, i) => (
                  <ListRow
                    key={t.id}
                    title={t.name}
                    subtitle={
                      using === t.id
                        ? program
                          ? 'Adding to the program…'
                          : 'Adding to your workouts…'
                        : templateSubtitle(t)
                    }
                    subtitleLines={2}
                    leading={<IconTile icon="barbell-outline" />}
                    onPress={() => {
                      if (!using) pickTemplate(t);
                    }}
                    testID={`add-plan-workout-${t.slug}`}
                    last={i === theirs.length - 1}
                  />
                ))}
              </Group>
            </Section>
          ) : null}
          {workouts.length && !mine.length && !theirs.length ? (
            <Text variant="callout" tone="secondary">
              No workouts match.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
