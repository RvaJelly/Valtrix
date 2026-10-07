import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ClientForm } from '@/components/client-form';
import { Body, Button } from '@/components/ui';
import { SessionRow } from '@/components/session-row';
import { Colors, Spacing, themed } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { CLIENT_COLUMNS, fullName, type Client, type ClientStatus } from '@/lib/clients';
import { formatDay, SESSION_COLUMNS, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Session[]>([]);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .eq('client_id', id)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(5)
        .then(({ data }) => setUpcoming((data as unknown as Session[]) ?? []));
    }, [id]),
  );

  useEffect(() => {
    supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (!data) setError('This client could not be found.');
        else setClient(data as Client);
      });
  }, [id]);

  async function setStatus(status: ClientStatus) {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) return setError(error.message);
    if (status === 'archived') router.back();
    else setClient((c) => (c ? { ...c, status } : c));
  }

  async function archive() {
    if (await confirm('Archive client?', 'They will be hidden from your client list.', 'Archive')) {
      await setStatus('archived');
    }
  }

  if (error) {
    return (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>{error}</Body>
      </View>
    );
  }
  if (!client) return <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.six }} />;

  return (
    <>
      <Stack.Screen options={{ title: fullName(client) }} />
      <ClientForm
        initial={client}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          const { error } = await supabase.from('clients').update(input).eq('id', id);
          if (error) return error.message;
          router.back();
          return null;
        }}>
        <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
          <Text style={styles.section}>Upcoming sessions</Text>
          {upcoming.length === 0 ? <Body secondary>Nothing booked yet.</Body> : null}
          {upcoming.map((session) => (
            <View key={session.id} style={{ gap: Spacing.one }}>
              <Body secondary style={{ fontSize: 13 }}>
                {formatDay(new Date(session.starts_at))}
              </Body>
              <SessionRow session={session} />
            </View>
          ))}
          {client.status === 'active' ? (
            <Button
              title="Book a session"
              onPress={() => router.push({ pathname: '/sessions/new', params: { clientId: client.id } })}
            />
          ) : null}
          {client.status === 'active' ? (
            <Button title="Pause client" variant="secondary" onPress={() => setStatus('paused')} />
          ) : (
            <Button title="Mark as active" variant="secondary" onPress={() => setStatus('active')} />
          )}
          <Button title="Archive client" variant="ghost" onPress={archive} />
        </View>
      </ClientForm>
    </>
  );
}

const styles = themed(() => ({
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
}));
