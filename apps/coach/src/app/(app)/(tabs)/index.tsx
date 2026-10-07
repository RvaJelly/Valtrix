import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Title } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Today() {
  const { profile } = useAuth();
  const navigation = useNavigation();
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const firstName = profile?.full_name?.split(' ')[0];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityLabel="Account"
          hitSlop={12}
          onPress={() => router.push('/account')}
          style={{ marginRight: Spacing.three }}>
          <Ionicons name="person-circle-outline" size={28} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      // RLS limits this to the signed-in trainer's own clients.
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .then(({ count }) => setActiveClients(count ?? 0));
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

      <Card style={styles.stat}>
        <Text style={styles.statNumber}>{activeClients ?? '–'}</Text>
        <Body secondary>Active clients</Body>
      </Card>

      <View style={{ gap: Spacing.three }}>
        <Button title="Add a client" onPress={() => router.push('/clients/new')} />
        <Button title="View all clients" variant="secondary" onPress={() => router.navigate('/clients')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  stat: {
    gap: Spacing.one,
  },
  statNumber: {
    color: Colors.orange,
    fontSize: 44,
    fontWeight: '800',
  },
});
