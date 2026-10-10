import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HeaderTextButton } from '@/components/header-button';
import { canJoin, JoinCall } from '@/components/join-call';
import { SessionForm } from '@/components/session-form';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Section,
  Segmented,
  Skeleton,
  StatusPill,
  Text,
  type StatusTone,
} from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { saveError } from '@/lib/save-error';
import {
  endOf,
  formatDay,
  SESSION_COLUMNS,
  SESSION_STATUS,
  sessionName,
  type Session,
  type SessionStatus,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

const PILLS: Partial<Record<SessionStatus, StatusTone>> = {
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'warning',
};

// What the toast says after the status changes.
const MARKED: Record<SessionStatus, string> = {
  scheduled: 'Booked again',
  completed: 'Marked as done',
  no_show: 'Marked as a no-show',
  cancelled: 'Session cancelled',
};

export default function SessionDetail() {
  const goBack = useGoBack();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Deleting, so a second tap on a slow connection does nothing.
  const [deleting, setDeleting] = useState(false);
  const { chats } = useChat();

  useEffect(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(plainError(error));
        else if (!data) setError('This session could not be found.');
        else setSession(data as unknown as Session);
      });
  }, [id]);

  // The status changes at once and is saved behind it; a failure puts it back.
  async function setStatus(status: SessionStatus) {
    if (!session || status === session.status) return;
    const before = session.status;
    haptic.select();
    setError(null);
    setSession({ ...session, status });
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id);
    if (error) {
      setSession((s) => (s ? { ...s, status: before } : s));
      return setError(plainError(error));
    }
    refreshReminders();
    toast(MARKED[status]);
  }

  async function remove() {
    if (deleting || !(await confirm('Delete session?', 'It will be removed from your calendar.', 'Delete'))) return;
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      setDeleting(false);
      return setError(plainError(error));
    }
    haptic.success();
    refreshReminders();
    goBack('/calendar');
  }

  if (!session) {
    return error ? (
      <EmptyState
        icon="calendar-clear-outline"
        title="Session not found"
        message={error}
        action={<Button title="Back to calendar" variant="secondary" onPress={() => goBack('/calendar')} />}
      />
    ) : (
      <View style={styles.content}>
        <Card hero style={{ gap: Spacing.tight }}>
          <Skeleton width={80} height={14} />
          <Skeleton width="70%" height={26} />
          <Skeleton width={140} height={20} />
          <Skeleton width={110} height={16} />
        </Card>
        <Skeleton height={40} radius={20} />
      </View>
    );
  }

  const start = new Date(session.starts_at);
  const end = endOf(session);
  const name = sessionName(session);
  const isPast = start < new Date();
  const pill = PILLS[session.status];
  const onApp = !!session.clients?.user_id;
  const joinable = canJoin(session, new Date().getTime());
  const place = session.online ? 'Video call' : session.location || 'No place set';
  const statuses = (['scheduled', 'completed', 'no_show', 'cancelled'] as const).filter(
    // A no-show only makes sense once the session has started.
    (s) => s !== 'no_show' || isPast || session.status === 'no_show',
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerTitle: '',
          headerRight: () => (
            <HeaderTextButton title="Edit" accessibilityLabel="Edit session" onPress={() => setEditing(true)} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card hero style={{ gap: Spacing.tight }}>
          <View style={styles.top}>
            <Text variant="label" tone="secondary" style={{ flex: 1 }}>
              {formatDay(start)}
            </Text>
            {pill ? <StatusPill tone={pill} label={SESSION_STATUS[session.status]} /> : null}
          </View>
          <Text
            variant="title"
            numberOfLines={2}
            accessibilityRole="header"
            style={session.status === 'cancelled' ? styles.struck : undefined}>
            {name}
          </Text>
          <View style={{ gap: Spacing.one }}>
            <Text variant="headline" style={Tabular}>
              {timeRange(start, end)}
              <Text variant="callout" tone="secondary">
                {'  '}
                {session.duration_minutes} min
              </Text>
            </Text>
            <View style={styles.place}>
              <Ionicons
                name={session.online ? 'videocam-outline' : 'location-outline'}
                size={16}
                color={Colors.textSecondary}
              />
              <Text variant="callout" tone="secondary" numberOfLines={2} style={{ flex: 1 }}>
                {place}
              </Text>
            </View>
          </View>
          {joinable || (session.client_id && onApp) ? (
            <View style={styles.actions}>
              <JoinCall
                session={session}
                name={name}
                avatar={chats.find((c) => c.chat_id === session.client_id)?.other_avatar}
                onApp={onApp}
              />
              {session.client_id && onApp ? (
                <Button
                  title="Message"
                  icon="chatbubble-outline"
                  variant="secondary"
                  size="medium"
                  accessibilityLabel={`Message ${name}`}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: session.client_id!, name } })}
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        <Section title="Status">
          <Segmented
            options={statuses.map((s) => ({ value: s, label: SESSION_STATUS[s] }))}
            value={session.status}
            onChange={setStatus}
          />
        </Section>

        {session.notes ? (
          <Section title="Notes">
            <Card>
              <Text variant="callout">{session.notes}</Text>
            </Card>
          </Section>
        ) : null}

        <ErrorText>{error}</ErrorText>

        <Group>
          <ListRow
            title={deleting ? 'Deleting…' : 'Delete session'}
            titleTone="danger"
            leading={<IconTile icon="trash-outline" color={Colors.danger} />}
            chevron={false}
            compact
            last
            onPress={remove}
            accessibilityState={{ disabled: deleting }}
          />
        </Group>
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit session">
        <SessionForm
          inSheet
          initial={session}
          day={start}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            const { error } = await supabase.from('sessions').update(input).eq('id', id);
            if (error) return saveError(error);
            refreshReminders();
            setEditing(false);
            goBack('/calendar');
            return null;
          }}
        />
      </Sheet>
    </>
  );
}

const styles = themed(() => ({
  content: {
    gap: Spacing.section,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  struck: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actions: {
    gap: Spacing.tight,
    marginTop: Spacing.two,
  },
}));
