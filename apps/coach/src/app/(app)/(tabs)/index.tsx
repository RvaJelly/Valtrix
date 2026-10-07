import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';
import { useCallback, useLayoutEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Body, Card, Title } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { fullName, initials, type Client } from '@/lib/clients';
import { supabase } from '@/lib/supabase';

type IconName = ComponentProps<typeof Ionicons>['name'];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Stats = {
  activeClients: number;
  workouts: number;
  recent: Pick<Client, 'id' | 'first_name' | 'last_name' | 'goal'>[];
};

export default function Home() {
  const { profile } = useAuth();
  const navigation = useNavigation();
  const [stats, setStats] = useState<Stats | null>(null);
  const firstName = profile?.full_name?.split(' ')[0];
  const access = coachAccess(profile);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="Settings"
          hitSlop={12}
          onPress={() => router.push('/settings')}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="settings-outline" size={26} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      // RLS limits every query to the signed-in trainer's own rows.
      Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('workouts').select('id', { count: 'exact', head: true }),
        supabase
          .from('clients')
          .select('id, first_name, last_name, goal')
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .limit(3),
      ]).then(([active, workouts, recent]) =>
        setStats({
          activeClients: active.count ?? 0,
          workouts: workouts.count ?? 0,
          recent: (recent.data as Stats['recent']) ?? [],
        }),
      );
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ gap: Spacing.one }}>
        <Title>
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </Title>
        <Body secondary>{profile?.business_name}</Body>
      </View>

      {access.kind === 'trial' ? (
        <Pressable onPress={() => router.push('/settings')} style={styles.trial}>
          <Ionicons name="time-outline" size={22} color={Colors.onAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trialTitle}>
              {access.daysLeft === 1 ? 'Last day of your free trial' : `${access.daysLeft} days left in your free trial`}
            </Text>
            <Text style={styles.trialBody}>
              Your {PRICE_LABEL} monthly plan starts{' '}
              {access.endsAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.onAccent} />
        </Pressable>
      ) : null}

      {profile?.is_admin ? (
        <Pressable
          onPress={() => router.push('/admin')}
          style={({ pressed }) => [styles.clientRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Ionicons name="shield-checkmark" size={22} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>All trainers</Text>
            <Body secondary style={{ fontSize: 14 }}>
              See every trainer and give free access
            </Body>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </Pressable>
      ) : null}

      <View style={styles.statsRow}>
        <Stat label="Active clients" value={stats?.activeClients} onPress={() => router.navigate('/clients')} />
        <Stat label="Workouts" value={stats?.workouts} onPress={() => router.navigate('/programs')} />
      </View>

      <View style={{ gap: Spacing.three }}>
        <Text style={styles.section}>Quick actions</Text>
        <View style={styles.grid}>
          <Action icon="person-add" label="Add client" href="/clients/new" />
          <Action icon="barbell" label="Build workout" href="/workouts/new" />
          <Action icon="library" label="Exercises" href="/exercises" />
          <Action icon="calendar" label="Calendar" href="/calendar" />
        </View>
      </View>

      <Card style={{ gap: Spacing.two }}>
        <View style={styles.cardHeader}>
          <Ionicons name="calendar-outline" size={20} color={Colors.accent} />
          <Text style={styles.cardTitle}>Today’s sessions</Text>
        </View>
        <Body secondary>Bookings are coming soon. Your sessions for the day will show up here.</Body>
      </Card>

      <View style={{ gap: Spacing.three }}>
        <View style={styles.cardHeader}>
          <Text style={[styles.section, { flex: 1 }]}>Recent clients</Text>
          {stats && stats.recent.length > 0 ? (
            <Pressable onPress={() => router.navigate('/clients')} hitSlop={8}>
              <Text style={styles.link}>See all</Text>
            </Pressable>
          ) : null}
        </View>
        {stats && stats.recent.length === 0 ? (
          <Card>
            <Body secondary>No clients yet. Tap “Add client” to get started.</Body>
          </Card>
        ) : (
          stats?.recent.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id } })}
              style={({ pressed }) => [styles.clientRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(c)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{fullName(c)}</Text>
                <Body secondary numberOfLines={1} style={{ fontSize: 14 }}>
                  {c.goal || 'No goal set yet'}
                </Body>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, onPress }: { label: string; value?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.stat, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Text style={styles.statNumber}>{value ?? '–'}</Text>
      <Body secondary style={{ fontSize: 14 }}>
        {label}
      </Body>
    </Pressable>
  );
}

function Action({ icon, label, href }: { icon: IconName; label: string; href: Href }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={Colors.onAccent} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  trial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
  },
  trialTitle: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  trialBody: {
    color: Colors.onAccent,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.one,
  },
  statNumber: {
    color: Colors.accent,
    fontSize: 36,
    fontWeight: '800',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  action: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.onAccent,
    fontWeight: '800',
  },
  clientName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
}));
