import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { TrainerCircle } from '@/components/trainer-circle';
import { Body, Card, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { displayName, listTrainers, type PublicTrainer } from '@/lib/trainers';

export default function Trainers() {
  const [trainers, setTrainers] = useState<PublicTrainer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    await load();
    setRefreshing(false);
  }

  // The specialties trainers actually offer, most common first.
  const counts = new Map<string, number>();
  for (const t of trainers ?? []) for (const s of t.specialties) counts.set(s, (counts.get(s) ?? 0) + 1);
  const offered = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));

  const query = search.trim().toLowerCase();
  const shown = (trainers ?? []).filter(
    (t) =>
      (!specialty || t.specialties.includes(specialty)) &&
      (!query ||
        [displayName(t), t.business_name, t.city, ...t.specialties].some((v) => v?.toLowerCase().includes(query))),
  );

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

      <ErrorText>{error}</ErrorText>
      {!trainers && !error ? <ActivityIndicator color={Colors.accentText} /> : null}
      {trainers && shown.length === 0 ? (
        <Card>
          <Body secondary>{trainers.length ? 'No trainers match that search.' : 'No trainers yet.'}</Body>
        </Card>
      ) : null}
      <View style={styles.grid}>
        {shown.map((t) => (
          <TrainerCircle key={t.id} trainer={t} size={88} width={104} />
        ))}
      </View>
    </ScrollView>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.four,
    marginTop: Spacing.two,
  },
}));
