import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddToPlanSheet, type WorkoutChoice } from '@/components/add-to-plan-sheet';
import { Chips } from '@/components/chips';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Segmented,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { daysPerWeek } from '@/lib/plan-dates';
import { daysLabelShort, duplicateWorkout, weeksLabel } from '@/lib/programs';
import { addFailure } from '@/lib/save-error';
import { dayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { templateSubtitle, type Template } from '@/lib/templates';
import { removeUnusedVideos } from '@/lib/workout-videos';
import { libraryOnly, workoutSummary, type WorkoutExercise } from '@/lib/workouts';

type Tab = 'programs' | 'workouts' | 'templates';
const TABS: { value: Tab; label: string }[] = [
  { value: 'programs', label: 'Programs' },
  { value: 'workouts', label: 'Workouts' },
  { value: 'templates', label: 'Templates' },
];
const TAB_KEY = 'voltrix-coach:programs-tab';

type Filter = 'program' | 'workout' | 'home';
const FILTERS: Record<Filter, string> = { program: 'Programs', workout: 'Workouts', home: 'At home' };

type ProgramRow = {
  id: string;
  name: string;
  weeks: number;
  template_id: string | null;
  program_slots: { weekdays: number[]; week_from: number; week_to: number | null }[];
};
type WorkoutRow = {
  id: string;
  name: string;
  video_path: string | null;
  workout_exercises: (Pick<WorkoutExercise, 'sets' | 'rest_seconds'> & { video_path: string | null })[] | null;
};
type Data = {
  programs: ProgramRow[];
  // Clients on each program now.
  onProgram: Map<string, number>;
  workouts: WorkoutRow[];
  templates: Template[];
};

function tabOf(value: string | undefined): Tab | null {
  return value === 'programs' || value === 'workouts' || value === 'templates' ? value : null;
}

// Programs (weeks of workouts), the trainer's own workouts, and the Voltrix templates to start from.
export default function Programs() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(tabOf(params.tab) ?? 'programs');
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<WorkoutRow | null>(null);
  const [lastMenu, setLastMenu] = useState<WorkoutRow | null>(null);
  if (menu && menu !== lastMenu) setLastMenu(menu);
  const [giving, setGiving] = useState<WorkoutChoice | null>(null);
  // What a menu does once it has slid away: an iPhone shows one sheet or alert at a time.
  const after = useRef<(() => void) | null>(null);
  const loads = useRef(0);
  const showSkeleton = useDelayed(300);

  // The segment last used on this device, unless the link names one.
  useEffect(() => {
    if (tabOf(params.tab)) return;
    let alive = true;
    (async () => {
      try {
        const saved = tabOf((await AsyncStorage.getItem(TAB_KEY)) ?? undefined);
        if (alive && saved) setTab(saved);
      } catch {
        // No saved segment.
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.tab]);

  const [linked, setLinked] = useState(params.tab);
  if (params.tab !== linked) {
    setLinked(params.tab);
    const next = tabOf(params.tab);
    if (next) setTab(next);
  }

  function choose(next: Tab) {
    setTab(next);
    AsyncStorage.setItem(TAB_KEY, next).catch(() => {});
  }

  const load = useCallback(async () => {
    const id = ++loads.current;
    const [programs, assignments, workouts, templates] = await Promise.all([
      supabase
        .from('programs')
        .select('id, name, weeks, template_id, program_slots(weekdays, week_from, week_to)')
        .order('updated_at', { ascending: false }),
      supabase.from('plan_assignments').select('program_id, client_id').gte('ends_on', dayKey(new Date())),
      libraryOnly(
        supabase.from('workouts').select('id, name, video_path, workout_exercises(sets, rest_seconds, video_path)'),
      ).order('updated_at', { ascending: false }),
      supabase
        .from('voltrix_templates')
        .select('id, slug, kind, name, summary, level, equipment, weeks, days_per_week, minutes, position')
        .order('position'),
    ]);
    if (id !== loads.current) return;
    if (workouts.error) return setFailed(true);
    const clients = new Map<string, Set<string>>();
    for (const a of (assignments.data ?? []) as { program_id: string | null; client_id: string }[]) {
      if (!a.program_id) continue;
      clients.set(a.program_id, (clients.get(a.program_id) ?? new Set()).add(a.client_id));
    }
    setFailed(false);
    setData({
      // An older database has no programs or templates yet: those segments are just empty.
      programs: programs.error ? [] : ((programs.data ?? []) as ProgramRow[]),
      onProgram: new Map([...clients].map(([k, v]) => [k, v.size])),
      workouts: (workouts.data ?? []) as unknown as WorkoutRow[],
      templates: templates.error ? [] : ((templates.data ?? []) as Template[]),
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  function fromMenu(action: () => void) {
    setMenu(null);
    if (Platform.OS === 'android') action();
    else after.current = action;
  }

  async function duplicate(w: WorkoutRow) {
    setMenu(null);
    try {
      const id = await duplicateWorkout(w.id);
      haptic.success();
      toast('Copy made', {
        action: { label: 'View', onPress: () => router.push({ pathname: '/workouts/[id]', params: { id } }) },
      });
      load();
    } catch (e) {
      haptic.warning();
      toast(await addFailure(e));
    }
  }

  async function remove(w: WorkoutRow) {
    const ok = await confirm(
      `Delete ${w.name}?`,
      'Clients who have it keep their own copy. This can’t be undone.',
      'Delete',
    );
    if (!ok) return;
    const { error } = await supabase.from('workouts').delete().eq('id', w.id);
    if (error) {
      haptic.warning();
      return toast(plainError(error, 'Couldn’t delete it. Try again.'));
    }
    await removeUnusedVideos([w.video_path, ...(w.workout_exercises ?? []).map((e) => e.video_path)]);
    toast(`${w.name} deleted`);
    load();
  }

  const templates = (data?.templates ?? []).filter((t) =>
    !filter ? true : filter === 'home' ? t.equipment === 'home' : t.kind === filter,
  );
  const shownMenu = menu ?? lastMenu;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />
        }>
        <View style={{ gap: Spacing.gutter }}>
          <PageHeader
            title="Programs"
            actions={
              <IconButton
                variant="tonal"
                icon="add"
                label="Add a program or workout"
                onPress={() => setAdding(true)}
                testID="programs-add"
              />
            }
          />
          <Segmented options={TABS} value={tab} onChange={choose} testID="programs-tabs" />
        </View>

        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {data ? 'Couldn’t refresh your programs.' : 'Your programs couldn’t be loaded.'}
          </Notice>
        ) : null}

        {!data ? (
          showSkeleton && !failed ? (
            <Group>
              <SkeletonRows count={4} />
            </Group>
          ) : null
        ) : tab === 'programs' ? (
          data.programs.length ? (
            <View style={{ gap: Spacing.tight }}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                Your programs
              </Text>
              <Group>
                {data.programs.map((p, i) => {
                  const days = daysPerWeek(p.program_slots ?? [], p.weeks);
                  const clients = data.onProgram.get(p.id) ?? 0;
                  const extra = [
                    clients ? `On ${clients} ${clients === 1 ? 'client' : 'clients'}` : null,
                    p.template_id ? 'From a Voltrix template' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={p.id}
                      title={p.name}
                      subtitle={
                        <View style={{ gap: 2 }}>
                          <Text variant="footnote" tone="secondary">
                            {weeksLabel(p.weeks)} · {daysLabelShort(days)}
                          </Text>
                          {extra ? (
                            <Text variant="footnote" tone="tertiary">
                              {extra}
                            </Text>
                          ) : null}
                        </View>
                      }
                      leading={<IconTile icon="layers-outline" />}
                      onPress={() => router.push({ pathname: '/programs/[id]', params: { id: p.id } })}
                      accessibilityLabel={`${p.name}, ${weeksLabel(p.weeks)}, ${daysLabelShort(days)}${extra ? `, ${extra}` : ''}`}
                      testID={`program-row-${p.id}`}
                      last={i === data.programs.length - 1}
                    />
                  );
                })}
              </Group>
            </View>
          ) : (
            <EmptyState
              icon="layers-outline"
              title="No programs yet"
              message="Put weeks of workouts together once and give them to any client."
              action={<Button title="Browse Voltrix templates" onPress={() => choose('templates')} />}
            />
          )
        ) : tab === 'workouts' ? (
          <View style={{ gap: Spacing.section }}>
            <Group>
              <ListRow
                title="Exercise library"
                subtitle="Browse exercises and add your own"
                leading={<IconTile icon="library-outline" />}
                onPress={() => router.push('/exercises')}
                last
              />
            </Group>
            {data.workouts.length ? (
              <View style={{ gap: Spacing.tight }}>
                <Text variant="label" tone="secondary" accessibilityRole="header">
                  Your workouts
                </Text>
                <Group>
                  {data.workouts.map((w, i) => (
                    <View key={w.id}>
                      <ListRow
                        title={w.name}
                        subtitle={workoutSummary(w.workout_exercises ?? [])}
                        leading={<IconTile icon="barbell-outline" />}
                        trailing={<View style={styles.room} />}
                        chevron={false}
                        onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: w.id } })}
                        last={i === data.workouts.length - 1}
                      />
                      <View style={styles.menu} pointerEvents="box-none">
                        <IconButton
                          icon="ellipsis-horizontal"
                          tone="secondary"
                          label={`More for ${w.name}`}
                          onPress={() => setMenu(w)}
                        />
                      </View>
                    </View>
                  ))}
                </Group>
              </View>
            ) : (
              <EmptyState
                icon="barbell-outline"
                title="No workouts yet"
                message="Build a workout from the exercise library, or start from a Voltrix template."
                action={<Button title="Build a workout" onPress={() => router.push('/workouts/new')} />}
              />
            )}
          </View>
        ) : (
          <View style={{ gap: Spacing.tight }}>
            <Chips options={FILTERS} value={filter} onChange={setFilter} all="All" />
            {templates.length ? (
              <Group>
                {templates.map((t, i) => (
                  <ListRow
                    key={t.id}
                    title={t.name}
                    subtitle={templateSubtitle(t)}
                    subtitleLines={2}
                    leading={<IconTile icon={t.kind === 'program' ? 'layers-outline' : 'barbell-outline'} />}
                    onPress={() => router.push({ pathname: '/templates/[slug]', params: { slug: t.slug } })}
                    testID={`template-row-${t.slug}`}
                    last={i === templates.length - 1}
                  />
                ))}
              </Group>
            ) : (
              <EmptyState
                compact
                icon="albums-outline"
                title="No templates here"
                message="Voltrix templates show here once they’re ready."
              />
            )}
          </View>
        )}
      </ScrollView>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Add">
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title="New program"
            subtitle="Weeks of workouts on set days"
            leading={<IconTile icon="layers-outline" />}
            onPress={() => {
              setAdding(false);
              router.push('/programs/new');
            }}
          />
          <ListRow
            title="New workout"
            subtitle="Exercises from the library"
            leading={<IconTile icon="barbell-outline" />}
            onPress={() => {
              setAdding(false);
              router.push('/workouts/new');
            }}
          />
          <ListRow
            title="From a Voltrix template"
            subtitle="Ready-made programs and workouts"
            leading={<IconTile icon="albums-outline" />}
            onPress={() => {
              setAdding(false);
              choose('templates');
            }}
            last
          />
        </Group>
      </Sheet>

      <Sheet
        visible={!!menu}
        onClose={() => setMenu(null)}
        onClosed={() => {
          const action = after.current;
          after.current = null;
          action?.();
        }}
        title={shownMenu?.name}>
        {shownMenu ? (
          <Group style={{ backgroundColor: Colors.tint }}>
            <ListRow
              title="Give to a client"
              subtitle="They get their own copy to change"
              leading={<IconTile icon="person-add-outline" />}
              onPress={() => {
                const w = shownMenu;
                fromMenu(() => setGiving({ id: w.id, name: w.name }));
              }}
            />
            <ListRow
              title="Duplicate"
              leading={<IconTile icon="copy-outline" />}
              chevron={false}
              onPress={() => duplicate(shownMenu)}
            />
            <ListRow
              title="Delete"
              titleTone="danger"
              leading={<IconTile icon="trash-outline" color={Colors.danger} />}
              chevron={false}
              onPress={() => {
                const w = shownMenu;
                fromMenu(() => remove(w));
              }}
              last
            />
          </Group>
        ) : null}
      </Sheet>

      <AddToPlanSheet visible={!!giving} onClose={() => setGiving(null)} workout={giving} />
    </SafeAreaView>
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
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
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
