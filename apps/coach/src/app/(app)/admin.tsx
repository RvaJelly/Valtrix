import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import {
  EmptyState,
  ErrorText,
  Group,
  groupedItem,
  ListRow,
  SearchField,
  SkeletonRows,
  StatStrip,
  Text,
  Toggle,
  useDelayed,
} from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import type { Profile } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Trainer = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'business_name'
  | 'trial_ends_at'
  | 'subscription_status'
  | 'subscription_expires_at'
  | 'free_access'
  | 'is_admin'
> & {
  email: string;
  created_at: string;
  client_count: number;
};

function planLabel(t: Trainer) {
  const access = coachAccess({ ...t, role: 'trainer' });
  switch (access.kind) {
    case 'owner':
      return 'Owner';
    case 'free':
      return 'Free access';
    case 'subscribed':
      return 'Paying';
    case 'trial':
      return `Trial, ${access.daysLeft === 1 ? '1 day' : `${access.daysLeft} days`} left`;
    default:
      // The trial only starts once a card is added, so no end date means it never started.
      if (t.subscription_expires_at) return 'Plan ended, not paying';
      return t.trial_ends_at ? 'Trial ended, not paying' : 'No trial yet';
  }
}

// Owner only: every trainer on Voltrix Coach, with a switch to give free access.
// The database refuses these calls for anyone who isn't the owner.
export default function AllTrainers() {
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('admin_list_trainers').then(({ data, error }) => {
        if (error) setError(plainError(error));
        else setTrainers(data as Trainer[]);
      });
    }, []),
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return trainers ?? [];
    return (trainers ?? []).filter((t) =>
      [t.full_name, t.business_name, t.email].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [trainers, search]);

  async function setFree(trainer: Trainer, enabled: boolean) {
    setTrainers((list) => list?.map((t) => (t.id === trainer.id ? { ...t, free_access: enabled } : t)) ?? null);
    const { error } = await supabase.rpc('admin_set_free_access', { trainer: trainer.id, enabled });
    if (error) {
      setError(plainError(error));
      setTrainers((list) => list?.map((t) => (t.id === trainer.id ? { ...t, free_access: !enabled } : t)) ?? null);
    }
  }

  const paying = trainers?.filter((t) => coachAccess({ ...t, role: 'trainer' }).kind === 'subscribed').length ?? 0;
  const free = trainers?.filter((t) => t.free_access).length ?? 0;

  return (
    <FlatList
      data={visible}
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <StatStrip
            items={[
              { value: trainers?.length, label: 'Trainers' },
              { value: trainers ? paying : null, label: 'Paying' },
              { value: trainers ? free : null, label: 'Free access' },
            ]}
          />
          <SearchField value={search} onChangeText={setSearch} placeholder="Search by name, business or email" />
          <ErrorText>{error}</ErrorText>
          {!trainers && !error && showSkeleton ? (
            <Group>
              <SkeletonRows count={4} avatar />
            </Group>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        trainers ? (
          <EmptyState compact icon="search-outline" title="No trainers match" message="Try another name or email." />
        ) : null
      }
      renderItem={({ item, index }) => {
        const name = item.full_name || item.business_name || item.email;
        const clients = item.client_count === 1 ? '1 client' : `${item.client_count} clients`;
        return (
          <View style={groupedItem(index, visible.length)}>
            <ListRow
              title={name}
              titleLines={1}
              // Who they are (business and email), then where they stand.
              subtitle={
                <>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {[item.business_name, item.email].filter(Boolean).join(' · ')}
                  </Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {planLabel(item)} · {clients}
                  </Text>
                </>
              }
              leading={<Avatar name={name} size={40} />}
              trailing={
                item.is_admin ? null : (
                  <Toggle
                    accessibilityLabel={`Free access for ${item.full_name ?? item.email}`}
                    value={item.free_access}
                    onValueChange={(v) => setFree(item, v)}
                  />
                )
              }
              accessibilityLabel={`${name}, ${item.email}. ${planLabel(item)}, ${clients}`}
              last={index === visible.length - 1}
            />
          </View>
        );
      }}
    />
  );
}

const styles = themed(() => ({
  list: {
    width: '100%',
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
}));
