import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ClientForm } from '@/components/client-form';
import { Body, Button } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { CLIENT_COLUMNS, fullName, type Client, type ClientStatus } from '@/lib/clients';
import { supabase } from '@/lib/supabase';

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

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
