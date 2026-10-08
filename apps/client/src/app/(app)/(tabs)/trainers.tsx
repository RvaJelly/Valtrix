import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PickerSheet, type PickerOption } from '@/components/picker-sheet';
import { TrainerCircle } from '@/components/trainer-circle';
import { Body, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { findMe, type Coords } from '@/lib/location';
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

export default function Trainers() {
  const [trainers, setTrainers] = useState<PublicTrainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(null);
  // '' is all towns.
  const [town, setTown] = useState('');
  const [sort, setSort] = useState<TrainerSort>('default');
  const [here, setHere] = useState<Coords | null>(null);
  const [distances, setDistances] = useState<Map<string, number> | null>(null);
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
      setError(e instanceof Error ? e.message : 'Could not load trainers.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([
      load(),
      here
        ? trainerDistances(here)
            .then(setDistances)
            .catch(() => {})
        : null,
    ]);
    setRefreshing(false);
  }

  // Nearest asks for the phone's location the first time. If that doesn't work,
  // say why and go back to A to Z.
  async function chooseSort(next: TrainerSort) {
    const request = ++latestSort.current;
    setNotice(null);
    setLocating(false);
    setSort(next);
    if (next !== 'nearest' || distances) return;
    setLocating(true);
    const found = await findMe();
    const nearby = 'coords' in found ? await trainerDistances(found.coords).catch(() => null) : null;
    // They may have picked another order while we were looking.
    if (request !== latestSort.current) return;
    setLocating(false);
    if ('coords' in found && nearby) {
      setHere(found.coords);
      setDistances(nearby);
    } else {
      setSort('default');
      setNotice('problem' in found && found.problem === 'denied' ? DENIED : NOT_FOUND);
    }
  }

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
  const shown = sortTrainers(
    (trainers ?? []).filter(
      (t) =>
        (!specialty || t.specialties.includes(specialty)) &&
        (!activeTown || townKey(t.city) === activeTown.key) &&
        (!query ||
          [displayName(t), t.business_name, t.city, ...t.specialties].some((v) => v?.toLowerCase().includes(query))),
    ),
    sort,
    distances,
  );
  const nearest = sort === 'nearest' && distances && !locating ? distances : null;
  const noneNearby = nearest && shown.length > 0 && !shown.some((t) => nearest.has(t.id));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      <Body secondary>Personal trainers on Voltrix. Tap a trainer to see what they do.</Body>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, city or specialty"
        placeholderTextColor={Colors.textSecondary}
        accessibilityLabel="Search trainers"
        style={styles.search}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
          {[null, ...offered].map((s) => {
            const selected = specialty === s;
            return (
              <Pressable
                key={s ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSpecialty(s)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && { color: Colors.onAccent }]}>{s ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {locating ? (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={Colors.accentText} />
          <Text style={styles.noteText}>Finding trainers near you…</Text>
        </View>
      ) : null}
      {notice || noneNearby ? (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.noteText}>{notice ?? "These trainers haven't added their location yet."}</Text>
        </View>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {!trainers && !error ? <ActivityIndicator color={Colors.accentText} /> : null}
      {trainers && shown.length === 0 ? (
        <Card>
          <Body secondary>{trainers.length ? 'No trainers match that search.' : 'No trainers yet.'}</Body>
        </Card>
      ) : null}
      <View style={styles.grid}>
        {shown.map((t) => (
          <TrainerCircle key={t.id} trainer={t} size={88} width={104} distanceKm={nearest?.get(t.id)} />
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
  const color = active ? Colors.onAccent : Colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, active && styles.chipSelected, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={16} color={active ? Colors.onAccent : Colors.accentText} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={color} />
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  search: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
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
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pillText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  noteText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.four,
    marginTop: Spacing.two,
  },
}));
