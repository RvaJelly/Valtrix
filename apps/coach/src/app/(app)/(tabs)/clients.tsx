import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppStatusLabel } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import {
  Button,
  EmptyState,
  groupedItem,
  IconButton,
  ListRow,
  Notice,
  PageHeader,
  SearchField,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { APP_STATUS_LABELS, appStatusOf, CLIENT_COLUMNS, fullName, STATUS_LABELS, type Client } from '@/lib/clients';
import { supabase } from '@/lib/supabase';

const addClient = () => router.push('/clients/new');

export default function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const showSkeleton = useDelayed(300);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .neq('status', 'archived')
      .order('first_name');
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setClients(data as Client[]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // A client accepted, declined or left: their state changes here straight away. News sent
  // while the connection was down is missed, so load again when it is back.
  useChatEvents((event) => {
    if (event.type === 'link' || event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!clients || !term) return clients;
    return clients.filter((c) => `${fullName(c)} ${c.email ?? ''}`.toLowerCase().includes(term));
  }, [clients, search]);

  const add = <IconButton variant="tonal" icon="add" label="Add client" onPress={addClient} />;

  if (clients && clients.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.list}>
          {/* The empty state's button is the one way to add a client here. */}
          <PageHeader title="Clients" />
          <EmptyState
            icon="people-outline"
            title="Your client list starts here"
            message="Add a client to plan their training and book sessions. Add their email and they get an invite to the Voltrix app."
            action={<Button title="Add client" onPress={addClient} />}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const rows = visible ?? [];
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader title="Clients" actions={add} />
            {/* The count lives in the search box, so the header doesn't move when the list arrives. */}
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={
                clients ? `Search ${clients.length} ${clients.length === 1 ? 'client' : 'clients'}` : 'Search clients'
              }
              style={styles.search}
            />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {!clients && !error && showSkeleton ? <SkeletonRows count={6} avatar /> : null}
          </View>
        }
        ListEmptyComponent={
          clients && search.trim() ? (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: Spacing.four }}>
              No clients match “{search.trim()}”.
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          const app = appStatusOf(item);
          const paused = item.status !== 'active';
          const status = paused ? STATUS_LABELS[item.status] : app !== 'joined' ? APP_STATUS_LABELS[app] : null;
          // The email belongs on the client's page; here a missing goal says so, as on Home.
          const goal = item.goal;
          return (
            <View style={groupedItem(index, rows.length)}>
              <ListRow
                title={fullName(item)}
                subtitle={
                  <Text variant="footnote" tone={goal ? 'secondary' : 'tertiary'} numberOfLines={1}>
                    {goal || 'No goal yet'}
                  </Text>
                }
                leading={<Avatar name={fullName(item)} size={44} />}
                status={
                  paused ? (
                    <StatusPill tone="neutral" label={STATUS_LABELS[item.status]} />
                  ) : app !== 'joined' ? (
                    <AppStatusLabel status={app} short />
                  ) : null
                }
                onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.id } })}
                accessibilityLabel={[fullName(item), goal, status].filter(Boolean).join(', ')}
                last={index === rows.length - 1}
              />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    width: '100%',
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  search: {
    marginTop: Spacing.two,
  },
}));
