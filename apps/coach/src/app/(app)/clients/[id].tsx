import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ClientForm } from '@/components/client-form';
import { ClientWorkoutPlan } from '@/components/client-workout-plan';
import { ClientNutrition } from '@/components/client-nutrition';
import { Body, Button } from '@/components/ui';
import { SessionRow } from '@/components/session-row';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { CLIENT_COLUMNS, fullName, type Client, type ClientStatus } from '@/lib/clients';
import { goBack } from '@/lib/nav';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { saveError } from '@/lib/save-error';
import { formatDay, SESSION_COLUMNS, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  // Changes typed into the nutrition plan editor that aren't saved yet.
  const [planUnsaved, setPlanUnsaved] = useState(false);
  const loaded = useRef(false);
  const { session } = useAuth();

  // Loaded each time the page shows or the app comes back, so it notices the client
  // joining the app (Message and Call appear) while the page stays open.
  const load = useCallback(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('client_id', id)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(5)
      .then(({ data }) => {
        if (data) setUpcoming(data as unknown as Session[]);
      });
    supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) {
          loaded.current = true;
          setClient(data as Client);
        } else if (!loaded.current) {
          setError(error ? error.message : 'This client could not be found.');
        }
        // A failed reload keeps the page as it was.
      });
  }, [id]);

  useFocusEffect(load);
  useRefreshOnReturn(load);

  async function setStatus(status: ClientStatus) {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) return setError(error.message);
    if (status === 'archived') goBack('/clients');
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
  if (!client) return <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.six }} />;

  return (
    <>
      <Stack.Screen options={{ title: fullName(client) }} />
      <ClientForm
        initial={client}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          const { error } = await supabase.from('clients').update(input).eq('id', id);
          if (error) return saveError(error);
          setClient((c) => (c ? { ...c, ...input } : c));
          // This button saves the details only. Don't quietly drop an open plan edit.
          if (
            planUnsaved &&
            !(await confirm(
              'Nutrition plan not saved',
              `${input.first_name}’s details are saved, but your changes to the nutrition plan aren’t. Leave without saving them?`,
              'Leave',
            ))
          ) {
            return null;
          }
          goBack('/clients');
          return null;
        }}>
        <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
          <Text style={styles.section}>Voltrix app</Text>
          <View style={styles.appStatus}>
            <Ionicons
              name={client.user_id ? 'checkmark-circle' : 'phone-portrait-outline'}
              size={22}
              color={client.user_id ? Colors.accentText : Colors.textSecondary}
            />
            <Body style={{ flex: 1, fontSize: 14 }}>
              {client.user_id
                ? `${client.first_name} has joined the Voltrix app. They see the sessions you book and get reminders.`
                : client.email
                  ? `Not on the app yet. Ask ${client.first_name} to download Voltrix and sign up with ${client.email}.`
                  : `Add ${client.first_name}'s email above, then ask them to sign up in the Voltrix app with it.`}
            </Body>
          </View>
          {client.user_id && client.user_id !== session?.user.id ? (
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Message"
                  onPress={() =>
                    router.push({ pathname: '/chat/[id]', params: { id: client.id, name: fullName(client) } })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Call"
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/call', params: { chat: client.id, video: '0', name: fullName(client) } })
                  }
                />
              </View>
            </View>
          ) : null}
          <ClientWorkoutPlan clientId={client.id} clientName={client.first_name} />
          <ClientNutrition client={client} onUnsavedChange={setPlanUnsaved} />
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
  appStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
}));
