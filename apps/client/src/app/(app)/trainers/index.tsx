import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react';
import { AppState, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { PickerSheet, type PickerOption } from '@/components/picker-sheet';
import { Button, Card, EmptyState, Notice, SearchField, Skeleton, StatusPill, Text } from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { findMe } from '@/lib/location';
import {
  displayName,
  distanceLabel,
  listTrainers,
  listTrainersV2,
  loadTrainers,
  sortTrainers,
  townKey,
  trainerDistances,
  trainerTitle,
  trainerTowns,
  yearsLabel,
  type ListedTrainer,
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

// The Trainers list, with whether each takes new clients; an older database answers round 2's list,
// where everyone does.
async function loadListed(): Promise<ListedTrainer[]> {
  const listed = await listTrainersV2();
  if (listed) return listed;
  return (await listTrainers()).map((t) => ({ ...t, accepting_clients: true }));
}

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
  const [trainers, setTrainers] = useState<ListedTrainer[] | null>(null);
  // The client's own trainers, marked on their cards. Left out when they can't be loaded.
  const [mine, setMine] = useState<Set<string>>(() => new Set());
  // The first name of the trainer the person trains with: the list is for finding one.
  const [ownTrainer, setOwnTrainer] = useState<string | null>(null);
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
      const [all, linked] = await Promise.all([loadListed(), loadTrainers().catch(() => null)]);
      setTrainers(all);
      if (linked) {
        setMine(new Set(linked.map((t) => t.trainer_id)));
        const own = linked[0] ? trainerTitle(linked[0]) : null;
        setOwnTrainer(own ? own.split(' ')[0] || own : null);
      }
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
  const sorted = sortTrainers(
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
  // Trainers not taking new clients come after the others, in the same order.
  const shown = [...sorted.filter((t) => t.accepting_clients), ...sorted.filter((t) => !t.accepting_clients)];
  const noneNearby = nearest && shown.length > 0 && !shown.some((t) => nearest.has(t.id));

  const specialties = Object.fromEntries(offered.map((o) => [o, o]));
  const filtered = !!(query || specialty || activeTown);
  const rows: ListedTrainer[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

  // Someone with a trainer doesn't browse for another: a calm page says where to go instead.
  if (ownTrainer) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          icon="people-outline"
          title="You have a trainer"
          message={`You train with ${ownTrainer}. To find someone new, leave ${ownTrainer} in Settings first.`}
          action={
            <Button title="Open Settings" variant="secondary" size="medium" onPress={() => router.push('/settings')} />
          }
          testID="trainers-has-trainer"
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}>
      <View style={styles.searchRow}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Name, city or specialty"
          accessibilityLabel="Search trainers"
          style={{ flex: 1 }}
        />
        {trainers?.length ? (
          <FilterButton
            icon="swap-vertical"
            active={sort !== 'default'}
            accessibilityLabel={`Sort: ${sortLabel}`}
            onPress={() => setPicker('sort')}
          />
        ) : null}
        {trainers?.length && towns.length ? (
          <FilterButton
            icon="location-outline"
            active={!!activeTown}
            accessibilityLabel={`Town: ${activeTown?.name ?? 'All towns'}`}
            onPress={() => setPicker('town')}
          />
        ) : null}
      </View>
      {offered.length ? (
        // Chips runs the row to the screen edges itself, so a chip cut by the edge reads as "scroll for more".
        <Chips options={specialties} value={specialty} onChange={setSpecialty} all="All" />
      ) : null}
      {sort !== 'default' || activeTown ? (
        <Text variant="footnote" tone="secondary">
          {[sort !== 'default' ? `${SORT_BUTTON[sort]} first` : null, activeTown ? `In ${activeTown.name}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      {locating ? <Notice>Finding trainers near you…</Notice> : null}
      {notice || noneNearby ? <Notice>{notice ?? "These trainers haven't added their location yet."}</Notice> : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!trainers && !error ? (
        <View style={styles.grid} accessible accessibilityLabel="Loading">
          {[0, 1].map((row) => (
            <View key={row} style={styles.gridRow}>
              {[0, 1].map((cell) => (
                <View key={cell} style={[styles.card, styles.cardSkeleton]}>
                  <Skeleton width={72} height={72} radius={36} />
                  <Skeleton width="70%" height={14} radius={7} />
                  <Skeleton width="45%" height={10} radius={5} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {trainers && shown.length === 0 ? (
        <EmptyState
          compact={!!trainers.length}
          icon="people-outline"
          title={trainers.length ? 'No trainers match' : 'No trainers yet'}
          message={trainers.length ? 'Try another name, town or specialty.' : 'Trainers who join Voltrix show up here.'}
          action={
            trainers.length && filtered ? (
              <Button
                title="Clear"
                variant="ghost"
                size="medium"
                onPress={() => {
                  setSearch('');
                  setSpecialty(null);
                  setTown('');
                }}
              />
            ) : undefined
          }
        />
      ) : null}
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0].id} style={styles.gridRow}>
            {row.map((t) => (
              <TrainerCard key={t.id} trainer={t} mine={mine.has(t.id)} distanceKm={nearest?.get(t.id)} />
            ))}
            {/* The empty half takes the card's padding too, so a lone last card is as wide as the ones above. */}
            {row.length === 1 ? <View style={styles.card} /> : null}
          </View>
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

// A trainer as a card: photo, full name on up to two lines, town and years. Opens their profile.
function TrainerCard({ trainer, mine, distanceKm }: { trainer: ListedTrainer; mine: boolean; distanceKm?: number }) {
  const name = displayName(trainer);
  const facts = [
    distanceKm != null ? distanceLabel(distanceKm) : trainer.city,
    trainer.years_experience != null ? yearsLabel(trainer.years_experience) : null,
  ].filter(Boolean);
  return (
    <Card
      style={styles.card}
      accessibilityLabel={[
        name,
        mine ? 'your trainer' : null,
        !mine && !trainer.accepting_clients ? 'not taking new clients' : null,
        ...facts,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() =>
        router.push({
          pathname: '/trainers/[id]',
          params: distanceKm != null ? { id: trainer.id, km: String(distanceKm) } : { id: trainer.id },
        })
      }>
      <View style={styles.cardInner}>
        <Avatar url={trainer.avatar_url} name={name} size={72} />
        <Text variant="rowTitle" numberOfLines={2} style={styles.cardName}>
          {name}
        </Text>
        {facts.length ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2} style={{ textAlign: 'center' }}>
            {facts.join(' · ')}
          </Text>
        ) : null}
        {mine ? (
          <View style={{ marginTop: Spacing.one }}>
            <StatusPill tone="success" label="Your trainer" />
          </View>
        ) : !trainer.accepting_clients ? (
          <View style={{ marginTop: Spacing.one }}>
            <StatusPill tone="neutral" label="Not taking new clients" testID={`trainer-not-taking-${trainer.id}`} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// A round button that opens a list of choices, filled in when it is set to something other than
// the default.
function FilterButton({
  icon,
  active,
  accessibilityLabel,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        { backgroundColor: active ? Colors.text : pressed ? Colors.tintPressed : Colors.tint },
      ]}>
      <Ionicons name={icon} size={20} color={active ? Colors.background : Colors.text} />
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.three,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  filter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    gap: Spacing.tight,
    marginTop: Spacing.one,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.tight,
  },
  // Narrower side padding than other cards: two fit side by side and long names need the room.
  card: {
    flex: 1,
    paddingHorizontal: Spacing.tight,
  },
  cardSkeleton: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.gutter,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  cardInner: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  cardName: {
    textAlign: 'center',
    fontFamily: Fonts.textSemi,
    marginTop: Spacing.two,
  },
}));
