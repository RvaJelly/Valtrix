import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppStatusLabel } from '@/components/app-status';
import { ClientForm } from '@/components/client-form';
import { ClientHabits } from '@/components/client-habits';
import { ClientNutrition } from '@/components/client-nutrition';
import { ClientProgress } from '@/components/client-progress';
import { ClientTrainingLog } from '@/components/client-training-log';
import { ClientWorkoutPlan } from '@/components/client-workout-plan';
import { Body, Button, ErrorText, Text } from '@/components/ui';
import { SessionRow } from '@/components/session-row';
import { Colors, Radius, Spacing, themed, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import {
  appStatusOf,
  CLIENT_COLUMNS,
  clientWithEmail,
  fullName,
  inviteAgain,
  type AppStatus,
  type Client,
  type ClientStatus,
} from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { useGoBack } from '@/lib/nav';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { saveError } from '@/lib/save-error';
import { formatDay, SESSION_COLUMNS, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

// What 'Save changes' asks before leaving with something not saved: [title, message, button].
function leaveWarning(name: string, plan: boolean, reply: boolean): [string, string, string] {
  if (plan && reply) {
    return [
      'Not everything is saved',
      `${name}’s details are saved, but your changes to the nutrition plan aren’t, and your reply to ${name}’s check-in isn’t sent. Leave anyway?`,
      'Leave',
    ];
  }
  if (reply) {
    return [
      'Reply not sent',
      `${name}’s details are saved, but your reply to ${name}’s check-in isn’t sent yet. Leave without sending it?`,
      'Leave',
    ];
  }
  return [
    'Nutrition plan not saved',
    `${name}’s details are saved, but your changes to the nutrition plan aren’t. Leave without saving them?`,
    'Leave',
  ];
}

export default function ClientDetail() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  // Changes typed into the nutrition plan editor that aren't saved yet.
  const [planUnsaved, setPlanUnsaved] = useState(false);
  // A check-in reply typed but not sent yet.
  const [replyUnsaved, setReplyUnsaved] = useState(false);
  const loaded = useRef(false);
  const { session } = useAuth();

  // Loaded each time the page shows or the app comes back, so it notices the client
  // accepting the invite (Message and Call appear) while the page stays open.
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
          setError(error ? plainError(error) : 'This client could not be found.');
        }
        // A failed reload keeps the page as it was.
      });
  }, [id]);

  useFocusEffect(load);
  useRefreshOnReturn(load);
  // The client accepted, declined or left just now, or the connection is back after news
  // may have been missed.
  useChatEvents((event) => {
    if ((event.type === 'link' && event.client_id === id) || event.type === 'reconnected') load();
  });

  async function setStatus(status: ClientStatus) {
    const { error } = await supabase.from('clients').update({ status }).eq('id', id);
    if (error) return setError(plainError(error));
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
          const same =
            input.email?.toLowerCase() !== client.email?.trim().toLowerCase()
              ? await clientWithEmail(input.email, id)
              : null;
          if (
            same &&
            !(await confirm(
              `You already have ${fullName(same)}`,
              `${fullName(same)} has the email ${same.email} too. If this is the same person, there's no need to add them twice. Save anyway?`,
              'Save anyway',
            ))
          ) {
            return null;
          }
          const { error } = await supabase.from('clients').update(input).eq('id', id);
          if (error) return saveError(error);
          setClient((c) => (c ? { ...c, ...input } : c));
          // This button saves the details only. Don't quietly drop an open plan edit or an
          // unsent check-in reply.
          if (
            (planUnsaved || replyUnsaved) &&
            !(await confirm(...leaveWarning(input.first_name, planUnsaved, replyUnsaved)))
          ) {
            return null;
          }
          goBack('/clients');
          return null;
        }}>
        <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
          <Text style={styles.section}>Voltrix app</Text>
          <AppLink client={client} onChanged={load} />
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
          {/* What the client logs in Voltrix, only while they have accepted this trainer. */}
          {appStatusOf(client) === 'joined' && client.user_id && client.status !== 'archived' ? (
            <>
              <ClientTrainingLog client={client} />
              <ClientProgress client={client} onUnsavedChange={setReplyUnsaved} />
              <ClientHabits client={client} />
            </>
          ) : null}
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
          <Button title="Archive client" variant="destructive" onPress={archive} />
        </View>
      </ClientForm>
    </>
  );
}

// What each state means for the trainer, in plain words.
function explain(status: AppStatus, client: Client) {
  const name = client.first_name;
  switch (status) {
    case 'joined':
      return `${name} accepted your invite in the Voltrix app. They see the sessions you book and the plans you set, you see their food diary, workouts, progress, check-ins and habits, and you can message and call each other.`;
    case 'invited':
      return `${name} has a Voltrix account with ${client.email}. Your invite is on their Home screen, and you'll be linked once they accept.`;
    case 'declined':
      return `${name} said no to your invite, so you're not linked. You can send it again later.`;
    case 'left':
      return `${name} left, so you no longer see their food diary, workouts, progress, check-ins, habits, chat or calls. Your notes, sessions and plans stay here.`;
    case 'gone':
      return client.email
        ? `The person who joined as this client left, and isn't on Voltrix with ${client.email} now. If their email changed, put the new one above to invite them again. To invite someone else, add them as a new client: this chat and history stay with the person who left.`
        : `The person who joined as this client left. Put the email they use on Voltrix above to invite them again, or add someone else as a new client.`;
    default:
      return client.email
        ? `Ask ${name} to download the Voltrix app and sign up with ${client.email}. Your invite will be waiting there for them to accept.`
        : `Add ${name}'s email above to invite them to the Voltrix app.`;
  }
}

// The client's place with the Voltrix app, with "Send invite again" after a no or a leave.
function AppLink({ client, onChanged }: { client: Client; onChanged: () => void }) {
  const status = appStatusOf(client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function again() {
    setError(null);
    setBusy(true);
    try {
      await inviteAgain(client.id);
      onChanged();
    } catch (e) {
      setError(plainError(e, 'Could not send the invite. Try again.'));
    }
    setBusy(false);
  }

  return (
    <View style={styles.appStatus}>
      <AppStatusLabel status={status} size={15} />
      <Body style={{ fontSize: 14 }}>{explain(status, client)}</Body>
      {(status === 'declined' || status === 'left') && client.email ? (
        <Button title="Send invite again" variant="secondary" onPress={again} loading={busy} />
      ) : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = themed(() => ({
  appStatus: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  section: {
    ...Type.label,
    color: Colors.textSecondary,
  },
}));
