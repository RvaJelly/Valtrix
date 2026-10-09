import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { JoinCall } from '@/components/join-call';
import { SessionForm } from '@/components/session-form';
import { Body, Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { saveError } from '@/lib/save-error';
import { SESSION_COLUMNS, SESSION_STATUS, sessionName, type Session, type SessionStatus } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The change being saved, so a second tap on a slow connection does nothing.
  const [busy, setBusy] = useState<SessionStatus | 'delete' | null>(null);
  const { chats } = useChat();

  useEffect(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (!data) setError('This session could not be found.');
        else setSession(data as unknown as Session);
      });
  }, [id]);

  async function setStatus(status: SessionStatus) {
    if (busy) return;
    setBusy(status);
    setError(null);
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id);
    if (error) {
      setBusy(null);
      return setError(error.message);
    }
    refreshReminders();
    goBack('/calendar');
  }

  async function remove() {
    if (busy || !(await confirm('Delete session?', 'It will be removed from your calendar.', 'Delete'))) return;
    setBusy('delete');
    setError(null);
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      setBusy(null);
      return setError(error.message);
    }
    refreshReminders();
    goBack('/calendar');
  }

  if (!session) {
    return error ? (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>{error}</Body>
      </View>
    ) : (
      <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.six }} />
    );
  }

  const isPast = new Date(session.starts_at) < new Date();
  return (
    <>
      <Stack.Screen options={{ title: sessionName(session) }} />
      <SessionForm
        initial={session}
        day={new Date(session.starts_at)}
        submitLabel="Save changes"
        top={
          <JoinCall
            session={session}
            name={sessionName(session)}
            avatar={chats.find((c) => c.chat_id === session.client_id)?.other_avatar}
            onApp={!!session.clients?.user_id}
          />
        }
        onSubmit={async (input) => {
          const { error } = await supabase.from('sessions').update(input).eq('id', id);
          if (error) return saveError(error);
          refreshReminders();
          goBack('/calendar');
          return null;
        }}>
        <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
          {session.status !== 'scheduled' ? (
            <>
              <Body secondary style={{ textAlign: 'center' }}>
                Marked as {SESSION_STATUS[session.status].toLowerCase()}.
              </Body>
              <Button
                title="Mark as booked again"
                variant="secondary"
                onPress={() => setStatus('scheduled')}
                loading={busy === 'scheduled'}
                disabled={!!busy}
              />
            </>
          ) : (
            <>
              <Button
                title="Mark as done"
                variant="secondary"
                onPress={() => setStatus('completed')}
                loading={busy === 'completed'}
                disabled={!!busy}
              />
              {isPast ? (
                <Button
                  title="Client didn’t show"
                  variant="secondary"
                  onPress={() => setStatus('no_show')}
                  loading={busy === 'no_show'}
                  disabled={!!busy}
                />
              ) : null}
              <Button
                title="Cancel session"
                variant="secondary"
                onPress={() => setStatus('cancelled')}
                loading={busy === 'cancelled'}
                disabled={!!busy}
              />
            </>
          )}
          <Button
            title="Delete session"
            variant="ghost"
            onPress={remove}
            loading={busy === 'delete'}
            disabled={!!busy}
          />
          {error ? <Body style={{ color: Colors.danger }}>{error}</Body> : null}
        </View>
      </SessionForm>
    </>
  );
}
