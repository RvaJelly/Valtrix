import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppStatusLabel } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { RowWithAction } from '@/components/row-action';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  groupedItem,
  IconButton,
  ListRow,
  Notice,
  PageHeader,
  SearchField,
  Section,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { APP_STATUS_LABELS, CLIENT_COLUMNS, fullName, shownStatusOf, STATUS_LABELS, type Client } from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

const addClient = () => router.push('/clients/new');

export default function Clients() {
  const toast = useToast();
  const [all, setAll] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // The archived clients, at the end of the list, open on demand (a search shows the ones it finds).
  const [showArchived, setShowArchived] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select(CLIENT_COLUMNS).order('first_name');
    if (error) {
      setError(plainError(error));
    } else {
      setError(null);
      setAll(data as Client[]);
    }
  }, []);

  const clients = useMemo(() => all?.filter((c) => c.status !== 'archived') ?? null, [all]);
  const archived = useMemo(() => all?.filter((c) => c.status === 'archived') ?? [], [all]);

  async function restore(client: Client) {
    setRestoring(client.id);
    const { error } = await supabase.from('clients').update({ status: 'active' }).eq('id', client.id);
    setRestoring(null);
    if (error) return toast(plainError(error));
    haptic.success();
    toast(`${client.first_name} is back`);
    load();
  }

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

  const term = search.trim().toLowerCase();
  const matches = useCallback((c: Client) => `${fullName(c)} ${c.email ?? ''}`.toLowerCase().includes(term), [term]);
  const visible = useMemo(() => (!clients || !term ? clients : clients.filter(matches)), [clients, term, matches]);
  const archivedShown = term ? archived.filter(matches) : showArchived ? archived : [];

  const add = <IconButton variant="tonal" icon="add" label="Add client" onPress={addClient} />;

  if (clients && clients.length === 0 && archived.length === 0) {
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
          clients && (term ? !archivedShown.length : !clients.length) ? (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: Spacing.four }}>
              {term
                ? `No clients match “${search.trim()}”.`
                : 'No clients on your list. Add one, or restore someone below.'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          archived.length ? (
            <Section
              title={term ? 'Archived' : `Archived (${archived.length})`}
              action={
                term
                  ? undefined
                  : {
                      label: showArchived ? 'Hide' : 'Show',
                      onPress: () => setShowArchived((v) => !v),
                      accessibilityLabel: showArchived
                        ? 'Hide archived clients'
                        : `Show ${archived.length} archived ${archived.length === 1 ? 'client' : 'clients'}`,
                      testID: 'clients-archived',
                    }
              }
              style={styles.archived}>
              {archivedShown.length ? (
                <View testID="clients-archived-list">
                  {archivedShown.map((item, index) => (
                    <View key={item.id} style={groupedItem(index, archivedShown.length)}>
                      <RowWithAction
                        title={fullName(item)}
                        subtitle={item.goal || 'Archived'}
                        leading={<Avatar name={fullName(item)} size={44} />}
                        action={
                          <Button
                            title="Restore"
                            variant="secondary"
                            size="small"
                            loading={restoring === item.id}
                            onPress={() => restore(item)}
                            accessibilityLabel={`Restore ${fullName(item)}`}
                            testID={`restore-${item.id}`}
                          />
                        }
                        onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.id } })}
                        accessibilityLabel={`${fullName(item)}, archived`}
                        last={index === archivedShown.length - 1}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </Section>
          ) : null
        }
        renderItem={({ item, index }) => {
          const app = shownStatusOf(item);
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
  archived: {
    marginTop: Spacing.section,
  },
}));
