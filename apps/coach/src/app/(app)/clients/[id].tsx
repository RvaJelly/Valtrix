import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { View } from 'react-native';

import { AppStatusPill } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { ClientForm } from '@/components/client-form';
import { ClientHabits } from '@/components/client-habits';
import { ClientNutrition } from '@/components/client-nutrition';
import { ClientProgress } from '@/components/client-progress';
import { ClientTrainingLog } from '@/components/client-training-log';
import { ClientWorkoutPlan } from '@/components/client-workout-plan';
import { SessionRow } from '@/components/session-row';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  Notice,
  Section,
  Shortcuts,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Text,
} from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import {
  appStatusOf,
  CLIENT_COLUMNS,
  clientWithEmail,
  fullName,
  inviteAgain,
  STATUS_LABELS,
  type AppStatus,
  type Client,
  type ClientStatus,
} from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';
import { saveError } from '@/lib/save-error';
import { SESSION_COLUMNS, type Session } from '@/lib/sessions';
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
  const [upcoming, setUpcoming] = useState<Session[] | null>(null);
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
        else setUpcoming((list) => list ?? []);
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
    haptic.success();
    if (status === 'archived') goBack('/clients');
    else setClient((c) => (c ? { ...c, status } : c));
  }

  async function archive() {
    if (await confirm('Archive client?', 'They will be hidden from your client list.', 'Archive')) {
      await setStatus('archived');
    }
  }

  if (error && !client) {
    return (
      <EmptyState
        icon="person-outline"
        title="Client not found"
        message={error}
        action={<Button title="Back to clients" variant="secondary" onPress={() => goBack('/clients')} />}
      />
    );
  }
  if (!client) return <ClientSkeleton />;

  const name = fullName(client);
  const status = appStatusOf(client);
  // Message and Call need the client in Voltrix, linked to this trainer.
  const linked = !!client.user_id && client.user_id !== session?.user.id;
  const actions: ComponentProps<typeof Shortcuts>['items'] = [
    ...(linked
      ? [
          {
            icon: 'chatbubble-outline' as const,
            label: 'Message',
            accessibilityLabel: `Message ${name}`,
            onPress: () => router.push({ pathname: '/chat/[id]', params: { id: client.id, name } }),
          },
          {
            icon: 'call-outline' as const,
            label: 'Call',
            accessibilityLabel: `Call ${name}`,
            onPress: () => router.push({ pathname: '/call', params: { chat: client.id, video: '0', name } }),
          },
        ]
      : []),
    ...(client.status === 'active'
      ? [
          {
            icon: 'calendar-clear-outline' as const,
            label: 'Book',
            accessibilityLabel: `Book a session with ${name}`,
            onPress: () => router.push({ pathname: '/sessions/new', params: { clientId: client.id } }),
          },
        ]
      : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: name, headerTitle: '' }} />
      <ClientForm
        initial={client}
        submitLabel="Save changes"
        titles={['Details', 'Contact and goal']}
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
        }}
        header={
          <View style={styles.sections}>
            <View style={styles.profile}>
              <Avatar name={name} size={96} />
              <View style={styles.names}>
                <Text variant="largeTitle" numberOfLines={2} style={styles.center} accessibilityRole="header">
                  {name}
                </Text>
                {client.goal ? (
                  <Text variant="callout" tone="secondary" numberOfLines={2} style={styles.center}>
                    {client.goal}
                  </Text>
                ) : null}
              </View>
              <View style={styles.pills}>
                <AppStatusPill status={status} />
                {client.status !== 'active' ? (
                  <StatusPill
                    tone={client.status === 'paused' ? 'warning' : 'muted'}
                    label={STATUS_LABELS[client.status]}
                  />
                ) : null}
              </View>
              {actions.length ? (
                <View style={{ width: actions.length * 96, maxWidth: '100%' }}>
                  <Shortcuts items={actions} />
                </View>
              ) : null}
            </View>
            {status !== 'joined' ? <AppLink client={client} status={status} onChanged={load} /> : null}
            <ClientWorkoutPlan clientId={client.id} clientName={client.first_name} />
            <ClientNutrition client={client} onUnsavedChange={setPlanUnsaved} />
            {/* What the client logs in Voltrix, only while they have accepted this trainer. */}
            {status === 'joined' && client.user_id && client.status !== 'archived' ? (
              <>
                <ClientTrainingLog client={client} />
                <ClientProgress client={client} onUnsavedChange={setReplyUnsaved} />
                <ClientHabits client={client} />
              </>
            ) : null}
            <Section title="Upcoming sessions">
              {upcoming === null ? (
                <Group>
                  <SkeletonRows count={2} />
                </Group>
              ) : upcoming.length === 0 ? (
                <Card>
                  <Text variant="callout" tone="secondary">
                    Nothing booked yet.
                  </Text>
                </Card>
              ) : (
                <Group>
                  {upcoming.map((s, index) => (
                    <SessionRow key={s.id} session={s} variant="grouped" showDay last={index === upcoming.length - 1} />
                  ))}
                </Group>
              )}
            </Section>
          </View>
        }>
        <ErrorText>{error}</ErrorText>
        <View style={styles.manage}>
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

// The page's shape while it loads: the photo, the name and a few rows.
function ClientSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading client" accessibilityRole="progressbar">
      <View style={styles.profile}>
        <Skeleton width={96} height={96} radius={48} />
        <Skeleton width={200} height={28} />
        <Skeleton width={120} height={22} radius={11} />
      </View>
      <Group>
        <SkeletonRows count={3} />
      </Group>
    </View>
  );
}

// What each state means for the trainer, in plain words.
function explain(status: AppStatus, client: Client) {
  const name = client.first_name;
  switch (status) {
    case 'joined':
      return `${name} accepted your invite in the Voltrix app.`;
    case 'invited':
      return `${name} has a Voltrix account with ${client.email}. Your invite is on their Home screen, and you'll be linked once they accept.`;
    case 'declined':
      return `${name} said no to your invite, so you're not linked. You can send it again later.`;
    case 'left':
      return `${name} left, so you no longer see their food diary, workouts, progress, check-ins, habits, chat or calls. Your notes, sessions and plans stay here.`;
    case 'gone':
      return client.email
        ? `The person who joined as this client left, and isn't on Voltrix with ${client.email} now. If their email changed, put the new one below to invite them again. To invite someone else, add them as a new client: this chat and history stay with the person who left.`
        : `The person who joined as this client left. Put the email they use on Voltrix below to invite them again, or add someone else as a new client.`;
    default:
      return client.email
        ? `Ask ${name} to download the Voltrix app and sign up with ${client.email}. Your invite will be waiting there for them to accept.`
        : `Add ${name}'s email below to invite them to the Voltrix app.`;
  }
}

// Where the client is with the Voltrix app when something is still to happen, with "Send invite
// again" after a no or a leave.
function AppLink({ client, status, onChanged }: { client: Client; status: AppStatus; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function again() {
    setError(null);
    setBusy(true);
    try {
      await inviteAgain(client.id);
      haptic.success();
      onChanged();
    } catch (e) {
      setError(plainError(e, 'Could not send the invite. Try again.'));
    }
    setBusy(false);
  }

  const canAsk = (status === 'declined' || status === 'left') && !!client.email;
  return (
    <View style={{ gap: Spacing.tight }}>
      <Notice tone={status === 'invited' || status === 'not_on_app' ? 'neutral' : 'warning'}>
        {explain(status, client)}
      </Notice>
      {canAsk ? (
        <Button
          title="Send invite again"
          icon="paper-plane-outline"
          variant="secondary"
          size="medium"
          onPress={again}
          loading={busy}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = themed(() => ({
  sections: {
    gap: Spacing.section,
  },
  profile: {
    alignItems: 'center',
    gap: Spacing.tight,
    paddingTop: Spacing.two,
  },
  names: {
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  center: {
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  manage: {
    gap: Spacing.tight,
    marginTop: Spacing.two,
  },
  skeleton: {
    gap: Spacing.section,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
  },
}));
