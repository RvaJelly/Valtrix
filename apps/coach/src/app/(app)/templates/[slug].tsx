import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GiveProgramSheet, type ProgramChoice } from '@/components/give-program-sheet';
import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  StatStrip,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { weekRanges } from '@/lib/plan-dates';
import { daysLabel } from '@/lib/plans';
import { rangeLabel } from '@/lib/programs';
import { addFailure } from '@/lib/save-error';
import {
  exerciseLine,
  LEVELS,
  loadTemplate,
  startFromTemplate,
  type Template,
  type TemplateSlot,
  type TemplateWorkout,
} from '@/lib/templates';
import { workoutMinutes } from '@/lib/workouts';

type Span = { week_from: number; week_to: number | null };

function spanOf(s: TemplateSlot): Span {
  return { week_from: s.from ?? 1, week_to: s.to ?? null };
}

// A Voltrix template as it will be: its weeks and workouts, each opening to its exercises. Using it
// makes the trainer's own program or workout to change.
export default function TemplatePreview() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const goBack = useGoBack();
  const toast = useToast();
  const [template, setTemplate] = useState<Template | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [open, setOpen] = useState<string[]>([]);
  const [busy, setBusy] = useState<'use' | 'give' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The program this preview already made, so a second tap doesn't make another.
  const [made, setMade] = useState<ProgramChoice | null>(null);
  const [giving, setGiving] = useState(false);
  const given = useRef(false);
  const showSkeleton = useDelayed(300);

  const load = useCallback(
    () =>
      loadTemplate(slug).then(
        (t) => {
          setFailed(false);
          if (t) setTemplate(t);
          else setMissing(true);
        },
        () => setFailed(true),
      ),
    [slug],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  async function makeProgram(t: Template): Promise<ProgramChoice | null> {
    if (made) return made;
    const id = await startFromTemplate(t.id);
    const program = { id, name: t.name, weeks: t.weeks, days: t.days_per_week };
    setMade(program);
    return program;
  }

  async function use(t: Template) {
    setBusy('use');
    setError(null);
    try {
      if (t.kind === 'workout') {
        const id = await startFromTemplate(t.id);
        haptic.success();
        router.replace({ pathname: '/workouts/[id]', params: { id } });
        toast('Added to your workouts');
        return;
      }
      const fresh = !made;
      const program = await makeProgram(t);
      if (!program) return;
      if (fresh) haptic.success();
      router.replace({ pathname: '/programs/[id]', params: { id: program.id } });
      toast('Added to your programs. Make it your own.');
    } catch (e) {
      haptic.warning();
      setError(await addFailure(e));
    } finally {
      setBusy(null);
    }
  }

  async function give(t: Template) {
    setBusy('give');
    setError(null);
    try {
      const fresh = !made;
      await makeProgram(t);
      if (fresh) haptic.success();
      given.current = false;
      setGiving(true);
    } catch (e) {
      haptic.warning();
      setError(await addFailure(e));
    }
    setBusy(null);
  }

  function closeGive() {
    setGiving(false);
    // Closed without giving: the program is still the trainer's now.
    if (!given.current && made) {
      const id = made.id;
      toast('Added to your programs', {
        action: { label: 'View', onPress: () => router.push({ pathname: '/programs/[id]', params: { id } }) },
      });
    }
  }

  function toggle(key: string) {
    setOpen((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  if (missing) {
    return (
      <EmptyState
        icon="albums-outline"
        title="Template not found"
        message="It may no longer be offered."
        action={
          <Button
            title="Back to templates"
            variant="secondary"
            onPress={() => goBack({ pathname: '/programs', params: { tab: 'templates' } })}
          />
        }
      />
    );
  }

  if (!template) {
    return (
      <View style={styles.content}>
        <Stack.Screen options={{ title: 'Voltrix template', headerTitle: '' }} />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            The template couldn’t be loaded.
          </Notice>
        ) : showSkeleton ? (
          <>
            <View style={{ gap: Spacing.two }}>
              <Skeleton width={180} height={12} />
              <Skeleton width="70%" height={30} />
              <Skeleton width="100%" height={40} />
            </View>
            <Skeleton width="100%" height={72} />
            <Group>
              <SkeletonRows count={4} />
            </Group>
          </>
        ) : null}
      </View>
    );
  }

  const t = template;
  const schedule = t.body.schedule ?? [];
  const workouts = new Map((t.body.workouts ?? []).map((w) => [w.key, w]));
  const program = t.kind === 'program';
  const exercises = t.body.workouts?.[0]?.exercises ?? [];
  // How long its workouts take, worked out the way the program page and workout editor do, so the
  // numbers agree once the trainer has their copy: "45", or "35–55" when they differ.
  const minutes = (t.body.workouts ?? []).map((w) =>
    workoutMinutes(w.exercises.map((e) => ({ sets: e.sets, rest_seconds: e.rest ?? null }))),
  );
  const fewest = minutes.length ? Math.min(...minutes) : t.minutes;
  const most = minutes.length ? Math.max(...minutes) : t.minutes;
  const length = {
    value: fewest === most ? `${fewest}` : `${fewest}–${most}`,
    label: 'Minutes',
    spoken: fewest === most ? `About ${fewest} minutes a workout` : `About ${fewest} to ${most} minutes a workout`,
  };
  const ranges = weekRanges(schedule.map(spanOf), t.weeks);

  const workoutRows = (list: { key: string; workout: TemplateWorkout; line: string; note?: string | null }[]) => (
    <Group>
      {list.map((row, i) => {
        const shown = open.includes(row.key);
        return (
          <View key={row.key}>
            <ListRow
              title={row.workout.name}
              subtitle={
                <View style={{ gap: 2 }}>
                  <Text variant="footnote" tone="secondary" style={Tabular}>
                    {row.line}
                  </Text>
                  {row.note ? (
                    <Text variant="footnote" tone="tertiary" numberOfLines={2}>
                      {row.note}
                    </Text>
                  ) : null}
                </View>
              }
              leading={<IconTile icon="barbell-outline" />}
              chevron={false}
              trailing={<Ionicons name={shown ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textTertiary} />}
              onPress={() => toggle(row.key)}
              accessibilityState={{ expanded: shown }}
              accessibilityHint={shown ? 'Hides the exercises' : 'Shows the exercises'}
              last={shown || i === list.length - 1}
            />
            {shown ? <ExerciseList workout={row.workout} last={i === list.length - 1} /> : null}
          </View>
        );
      })}
    </Group>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t.name, headerTitle: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: Spacing.tight }}>
          <PageHeader eyebrow={`Voltrix template · ${LEVELS[t.level]}`} title={t.name} />
          <Text variant="callout" tone="secondary">
            {t.summary}
          </Text>
        </View>
        <StatStrip
          items={
            program
              ? [{ value: t.weeks, label: 'Weeks' }, { value: t.days_per_week, label: 'Days a week' }, length]
              : [
                  { value: exercises.length, label: 'Exercises' },
                  length,
                  // The level is in the eyebrow; a word this size doesn't fit a third of a phone.
                  { value: exercises.reduce((n, e) => n + e.sets, 0), label: 'Sets' },
                ]
          }
        />

        {program ? (
          ranges.map((range) => {
            const list = schedule
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => {
                const span = spanOf(s);
                return span.week_from === range[0] && Math.min(span.week_to ?? t.weeks, t.weeks) === range[1];
              })
              .flatMap(({ s, i }) => {
                const workout = workouts.get(s.workout);
                if (!workout) return [];
                const count = workout.exercises.length;
                const line = `${daysLabel(s.weekdays)} · ${count === 1 ? '1 exercise' : `${count} exercises`}`;
                return [{ key: `${range.join('-')}-${i}`, workout, line, note: s.note }];
              });
            return (
              <Section key={range.join('-')} title={rangeLabel(range)}>
                {workoutRows(list)}
              </Section>
            );
          })
        ) : (
          <Section title="Exercises">
            <Group>
              {exercises.map((e, i) => (
                <ExerciseRow key={`${e.name}-${i}`} exercise={e} last={i === exercises.length - 1} />
              ))}
            </Group>
          </Section>
        )}
        <Text variant="footnote" tone="tertiary">
          Using a template makes your own copy. Change anything, and nothing changes for anyone else.
        </Text>
      </ScrollView>

      <StickyFooter>
        <ErrorText>{error}</ErrorText>
        <Button
          title={program ? 'Use this template' : 'Add to your workouts'}
          onPress={() => use(t)}
          loading={busy === 'use'}
          disabled={busy === 'give'}
          testID="template-use"
        />
        {program ? (
          <Button
            title="Give to a client"
            variant="secondary"
            onPress={() => give(t)}
            loading={busy === 'give'}
            disabled={busy === 'use'}
            testID="template-give"
          />
        ) : null}
      </StickyFooter>

      <GiveProgramSheet
        visible={giving}
        onClose={closeGive}
        program={made}
        onGiven={() => {
          given.current = true;
        }}
      />
    </View>
  );
}

function ExerciseList({ workout, last }: { workout: TemplateWorkout; last: boolean }) {
  return (
    <View style={[styles.exercises, !last && styles.exercisesLine]}>
      {workout.notes ? (
        <Text variant="footnote" tone="secondary">
          {workout.notes}
        </Text>
      ) : null}
      {workout.exercises.map((e, i) => (
        <View key={`${e.name}-${i}`} style={styles.exercise}>
          <Text variant="footnote" tone="tertiary" style={[Tabular, styles.number]}>
            {String(i + 1).padStart(2, '0')}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="callout">{e.name}</Text>
            <Text variant="footnote" tone="secondary" style={Tabular}>
              {exerciseLine(e)}
            </Text>
            {e.notes ? (
              <Text variant="footnote" tone="tertiary">
                {e.notes}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function ExerciseRow({
  exercise,
  last,
}: {
  exercise: Template['body']['workouts'][number]['exercises'][number];
  last: boolean;
}) {
  return (
    <ListRow
      title={exercise.name}
      titleLines={2}
      subtitle={
        <View style={{ gap: 2 }}>
          <Text variant="footnote" tone="secondary" style={Tabular}>
            {exerciseLine(exercise)}
          </Text>
          {exercise.notes ? (
            <Text variant="footnote" tone="tertiary">
              {exercise.notes}
            </Text>
          ) : null}
        </View>
      }
      last={last}
    />
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
  // Lined up with the row's title: the row's inset, the 36 tile and its gap.
  exercises: {
    marginLeft: Spacing.gutter + 36 + Spacing.tight,
    paddingRight: Spacing.gutter,
    paddingBottom: Spacing.three,
    gap: Spacing.tight,
  },
  exercisesLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  exercise: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  number: {
    width: 20,
    paddingTop: 2,
    fontFamily: Fonts.textMedium,
  },
}));
