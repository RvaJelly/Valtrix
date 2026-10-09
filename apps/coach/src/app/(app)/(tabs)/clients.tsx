import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { AppStatusLabel } from '@/components/app-status';
import { Body, Button, EmptyState, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { appStatusOf, CLIENT_COLUMNS, fullName, initials, STATUS_LABELS, type Client } from '@/lib/clients';
import { supabase } from '@/lib/supabase';

export default function Clients() {
  const navigation = useNavigation();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="Add client"
          hitSlop={12}
          onPress={() => router.push('/clients/new')}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="add-circle" size={28} color={Colors.accentText} />
        </Pressable>
      ),
    });
  }, [navigation]);

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

  // A client accepted, declined or left: their state changes here straight away.
  useChatEvents((event) => {
    if (event.type === 'link') load();
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

  if (clients && clients.length === 0) {
    return (
      <EmptyState
        icon="people-outline"
        title="No clients yet"
        message="Add your first client to start building their programs and booking sessions."
        action={<Button title="Add a client" onPress={() => router.push('/clients/new')} />}
      />
    );
  }

  return (
    <FlatList
      data={visible ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}
      ListHeaderComponent={
        <View style={{ gap: Spacing.two }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search clients"
            placeholderTextColor={Colors.textSecondary}
            selectionColor={Colors.accent}
            style={styles.search}
            autoCorrect={false}
          />
          <ErrorText>{error}</ErrorText>
        </View>
      }
      ListEmptyComponent={
        clients && search.trim() ? (
          <Body secondary style={{ textAlign: 'center', marginTop: Spacing.four }}>
            No clients match “{search.trim()}”.
          </Body>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.id } })}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(item)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{fullName(item)}</Text>
            <Body secondary numberOfLines={1} style={{ fontSize: 14 }}>
              {item.goal || item.email || 'No goal set yet'}
            </Body>
            <View style={{ marginTop: Spacing.one }}>
              <AppStatusLabel status={appStatusOf(item)} />
            </View>
          </View>
          {item.status !== 'active' ? <Text style={styles.badge}>{STATUS_LABELS[item.status]}</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </Pressable>
      )}
    />
  );
}

const styles = themed(() => ({
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  search: {
    minHeight: 44,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.onAccent,
    fontWeight: '800',
    fontSize: 16,
  },
  name: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
}));
