import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Switch, Text, TextInput, View } from 'react-native';

import { Body, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import type { Profile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Trainer = Pick<
  Profile,
  'id' | 'full_name' | 'business_name' | 'trial_ends_at' | 'subscription_status' | 'subscription_expires_at' | 'free_access' | 'is_admin'
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

  useFocusEffect(
    useCallback(() => {
      supabase.rpc('admin_list_trainers').then(({ data, error }) => {
        if (error) setError(error.message);
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
      setError(error.message);
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
        <View style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
          {trainers ? (
            <View style={styles.statsRow}>
              <Stat label="Trainers" value={trainers.length} />
              <Stat label="Paying" value={paying} />
              <Stat label="Free access" value={free} />
            </View>
          ) : null}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, business or email"
            placeholderTextColor={Colors.textSecondary}
            selectionColor={Colors.accent}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ErrorText>{error}</ErrorText>
        </View>
      }
      ListEmptyComponent={
        trainers ? (
          <Body secondary style={{ textAlign: 'center', marginTop: Spacing.four }}>
            No trainers match.
          </Body>
        ) : error ? null : (
          <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.five }} />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{item.full_name || 'No name'}</Text>
            <Body secondary style={styles.small} numberOfLines={1}>
              {[item.business_name, item.email].filter(Boolean).join(' · ')}
            </Body>
            <Body secondary style={styles.small}>
              {planLabel(item)} · {item.client_count === 1 ? '1 client' : `${item.client_count} clients`}
            </Body>
          </View>
          {item.is_admin ? null : (
            <View style={styles.toggle}>
              <Switch
                accessibilityLabel={`Free access for ${item.full_name ?? item.email}`}
                value={item.free_access}
                onValueChange={(v) => setFree(item, v)}
                trackColor={{ true: Colors.accent, false: Colors.border }}
                thumbColor={Colors.text}
                // The web Switch tints the thumb teal unless told otherwise.
                {...(Platform.OS === 'web' ? { activeThumbColor: Colors.text } : {})}
              />
              <Text style={styles.toggleLabel}>Free</Text>
            </View>
          )}
        </View>
      )}
    />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{value}</Text>
      <Body secondary style={styles.small}>
        {label}
      </Body>
    </View>
  );
}

const styles = themed(() => ({
  list: {
    padding: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  statNumber: {
    color: Colors.accentText,
    fontSize: 28,
    fontWeight: '800',
  },
  search: {
    minHeight: 44,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  small: {
    fontSize: 13,
  },
  toggle: {
    alignItems: 'center',
    gap: 2,
  },
  toggleLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
}));
