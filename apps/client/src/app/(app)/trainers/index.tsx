import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { PickerSheet, type PickerOption } from '@/components/picker-sheet';
import { TrainerCircle } from '@/components/trainer-circle';
import { Body, Card, Notice, SearchField, Text, Text as UIText } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed, Type } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { findMe } from '@/lib/location';
import {
  displayName,
  listTrainers,
  sortTrainers,
  townKey,
  trainerDistances,
  trainerTowns,
  type PublicTrainer,
  type TrainerSort,
} from '@/lib/trainers';

const SORTS: PickerOption<TrainerSort>[] = [
  { value: 'default', label: 'A to Z', detail: 'By name', icon: 'text-outline' },
  { value: 'nearest', label: 'Nearest to me', detail: 'Uses your location', icon: 'navigate-outline' },
  { value: 'experience', label: 'Most experience', detail: 'Most years as a trainer first', icon: 'ribbon-outline' },
];

// Shorter names for the button, so it fits next to the town.
const SORT_BUTTON: Record<TrainerSort, string> = { default: 'A to Z', nearest: 'Nearest', experience: 'Experience' };

const DENIED =
  Platform.OS === 'web'
    ? "Your browser didn't share your location, so trainers are shown A to Z."
    : "Voltrix can't see your location, so trainers are shown A to Z. You can allow it in your phone's settings.";
const NOT_FOUND = "We couldn't work out how far away trainers are, so they're shown A to Z. Try again in a moment.";

// After this long the client may have moved, so Nearest finds them again.
const FRESH_FOR = 10 * 60_000;

// How far each trainer is from the client, by trainer id, and when that was worked out.
type Nearby = { distances: Map<string, number>; at: number };

// Finds the client and how far away each trainer is, or says what went wrong.
async function measure(): Promise<Nearby | 'denied' | 'failed'> {
  const found = await findMe();
  if ('problem' in found) return found.problem;
  const distances = await trainerDistances(found.coords).catch(() => null);
  return distances ? { distances, at: Date.now() } : 'failed';
}

export default function Trainers() {
  const [trainers, setTrainers] = useState<PublicTrainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(null);
  // '' is all towns.
  const [town, setTown] = useState('');
  const [sort, setSort] = useState<TrainerSort>('default');
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<'sort' | 'town' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestSort = useRef(0);

  const load = useCallback(async () => {
    try {
      setTrainers(await listTrainers());
      setError(null);
    } catch (e) {
      setError(plainError(e, 'Could not load trainers.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function fallBack(problem: 'denied' | 'failed') {
    setSort('default');
    setNotice(problem === 'denied' ? DENIED : NOT_FOUND);
  }

  // Nearest asks for the phone's location the first time. If that doesn't work,
  // say why and go back to A to Z. Distances from the last few minutes are reused,
  // so switching back to Nearest is quick.
  async function chooseSort(next: TrainerSort) {
    const request = ++latestSort.current;
    setNotice(null);
    setLocating(false);
    setSort(next);
    if (next !== 'nearest' || (nearby && Date.now() - nearby.at < FRESH_FOR)) return;
    setLocating(true);
    const result = await measure();
    // They may have picked another order while we were looking.
    if (request !== latestSort.current) return;
    setLocating(false);
    if (typeof result === 'object') setNearby(result);
    else fallBack(result);
  }

  // Finds the client again while sorted by distance, in case they have moved. If the
  // phone can't get a fix this time the old distances stay, unless location was turned off.
  async function remeasure() {
    const request = latestSort.current;
    const result = await measure();
    if (typeof result === 'object') setNearby(result);
    else if (result === 'denied' && request === latestSort.current) {
      setNearby(null);
      fallBack(result);
    }
  }

  async function refresh() {
    setRefreshing(true);
    // Away from Nearest, forget the distances so Nearest finds the client afresh next time.
    if (sort !== 'nearest') setNearby(null);
    await Promise.all([load(), sort === 'nearest' && nearby && !locating ? remeasure() : null]);
    setRefreshing(false);
  }

  // Phones keep the app open in the background for days, so coming back to an old
  // Nearest list finds the client again.
  const onAppActive = useEffectEvent(() => {
    if (sort === 'nearest' && nearby && !locating && Date.now() - nearby.at >= FRESH_FOR) remeasure();
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onAppActive();
    });
    return () => sub.remove();
  }, []);

  // The specialties trainers actually offer, most common first.
  const counts = new Map<string, number>();
  for (const t of trainers ?? []) for (const s of t.specialties) counts.set(s, (counts.get(s) ?? 0) + 1);
  const offered = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));

  const towns = trainerTowns(trainers ?? []);
  const activeTown = towns.find((t) => t.key === town) ?? null;
  const townOptions: PickerOption<string>[] = [
    { value: '', label: 'All towns', icon: 'globe-outline' },
    ...towns.map((t) => ({
      value: t.key,
      label: t.name,
      detail: t.count === 1 ? '1 trainer' : `${t.count} trainers`,
      icon: 'location-outline' as const,
    })),
  ];
  const sortLabel = SORTS.find((s) => s.value === sort)!.label;

  const query = search.trim().toLowerCase();
  const nearest = sort === 'nearest' && nearby && !locating ? nearby.distances : null;
  const shown = sortTrainers(
    (trainers ?? []).filter(
      (t) =>
        (!specialty || t.specialties.includes(specialty)) &&
        (!activeTown || townKey(t.city) === activeTown.key) &&
        (!query ||
          [displayName(t), t.business_name, t.city, ...t.specialties].some((v) => v?.toLowerCase().includes(query))),
    ),
    sort,
    nearest,
  );
  const noneNearby = nearest && shown.length > 0 && !shown.some((t) => nearest.has(t.id));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}>
      <UIText variant="callout" tone="secondary">
        Personal trainers on Voltrix. Tap a trainer to see what they do.
      </UIText>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Name, city or specialty"
        accessibilityLabel="Search trainers"
      />
      {trainers?.length ? (
        <View style={styles.pills}>
          <Pill
            icon="swap-vertical"
            label={SORT_BUTTON[sort]}
            active={sort !== 'default'}
            accessibilityLabel={`Sort: ${sortLabel}`}
            onPress={() => setPicker('sort')}
          />
          {towns.length ? (
            <Pill
              icon="location-outline"
              label={activeTown?.name ?? 'All towns'}
              active={!!activeTown}
              accessibilityLabel={`Town: ${activeTown?.name ?? 'All towns'}`}
              onPress={() => setPicker('town')}
            />
          ) : null}
        </View>
      ) : null}
      {offered.length ? (
        // The row runs to the screen edges, so a chip cut by the edge reads as "scroll for more".
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -Spacing.gutter }}
          contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.gutter }}>
          {[null, ...offered].map((s) => {
            const selected = specialty === s;
            return (
              <Pressable
                key={s ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSpecialty(s)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && { color: Colors.background }]}>{s ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {locating ? (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={Colors.textSecondary} />
          <Text style={styles.noteText}>Finding trainers near you…</Text>
        </View>
      ) : null}
      {notice || noneNearby ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.noteText}>{notice ?? "These trainers haven't added their location yet."}</Text>
        </View>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!trainers && !error ? <ActivityIndicator color={Colors.textSecondary} /> : null}
      {trainers && shown.length === 0 ? (
        <Card>
          <Body secondary>{trainers.length ? 'No trainers match that search.' : 'No trainers yet.'}</Body>
        </Card>
      ) : null}
      <View style={styles.grid}>
        {shown.map((t) => (
          <TrainerCircle
            key={t.id}
            trainer={t}
            size={88}
            width={104}
            distanceKm={nearest?.get(t.id)}
            years={sort === 'experience' ? (t.years_experience ?? undefined) : undefined}
          />
        ))}
      </View>

      <PickerSheet
        visible={picker === 'sort'}
        title="Sort trainers"
        options={SORTS}
        value={sort}
        onChange={chooseSort}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'town'}
        title="Trainers in"
        options={townOptions}
        value={activeTown?.key ?? ''}
        onChange={setTown}
        onClose={() => setPicker(null)}
      />
    </ScrollView>
  );
}

// A button that opens a list of choices. Filled in when it is set to something other than the default.
function Pill({
  icon,
  label,
  active,
  accessibilityLabel,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const color = active ? Colors.background : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        pressed && { backgroundColor: Colors.tintPressed },
        active && styles.chipSelected,
      ]}>
      <Ionicons name={icon} size={16} color={active ? Colors.background : Colors.textSecondary} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={color} />
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.tight,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '100%',
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  pillText: {
    ...Type.callout,
    fontFamily: Fonts.textMedium,
    flexShrink: 1,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  chipSelected: {
    backgroundColor: Colors.text,
  },
  chipText: {
    ...Type.callout,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  noteText: {
    ...Type.footnote,
    flex: 1,
    color: Colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.four,
    marginTop: Spacing.two,
  },
}));
