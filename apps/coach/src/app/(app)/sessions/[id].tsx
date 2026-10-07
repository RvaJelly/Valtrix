import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { SessionForm } from '@/components/session-form';
import { Body, Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { refreshReminders } from '@/lib/reminders';
import { SESSION_COLUMNS, SESSION_STATUS, sessionName, type Session, type SessionStatus } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id);
    if (error) return setError(error.message);
    refreshReminders();
    router.back();
  }

  async function remove() {
    if (!(await confirm('Delete session?', 'It will be removed from your calendar.', 'Delete'))) return;
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) return setError(error.message);
    refreshReminders();
    router.back();
  }

  if (!session) {
    return error ? (
      <View style={{ padding: Spacing.four }}>
        <Body secondary>{error}</Body>
      </View>
    ) : (
      <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.six }} />
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
        onSubmit={async (input) => {
          const { error } = await supabase.from('sessions').update(input).eq('id', id);
          if (error) return error.message;
          refreshReminders();
          router.back();
          return null;
        }}>
        <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
          {session.status !== 'scheduled' ? (
            <>
              <Body secondary style={{ textAlign: 'center' }}>
                Marked as {SESSION_STATUS[session.status].toLowerCase()}.
              </Body>
              <Button title="Mark as booked again" variant="secondary" onPress={() => setStatus('scheduled')} />
            </>
          ) : (
            <>
              <Button title="Mark as done" variant="secondary" onPress={() => setStatus('completed')} />
              {isPast ? (
                <Button title="Client didn’t show" variant="secondary" onPress={() => setStatus('no_show')} />
              ) : null}
              <Button title="Cancel session" variant="secondary" onPress={() => setStatus('cancelled')} />
            </>
          )}
          <Button title="Delete session" variant="ghost" onPress={remove} />
          {error ? <Body style={{ color: Colors.danger }}>{error}</Body> : null}
        </View>
      </SessionForm>
    </>
  );
}
