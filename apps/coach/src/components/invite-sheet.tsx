import * as Clipboard from 'expo-clipboard';
import { useEffect, useEffectEvent, useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, Card, Notice, Skeleton, Text, TextField, TextLink } from '@/components/ui';
import { Colors, Fonts, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { inviteAgain, type AppStatus } from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { formatCode } from '@/lib/invite-code';
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { countryOf, inviteMessage, waLink, waNumber } from '@/lib/whatsapp';

export type InviteClient = {
  id: string;
  first_name: string;
  email: string | null;
  phone: string | null;
  app_status: AppStatus;
};

const CONNECTED = 'This client is already connected to you.';

// Opens a link outside the app straight from the button press: a browser only lets a new tab open
// before anything is awaited.
export function openOutside(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url).catch(() => {});
}

// Invite a client on WhatsApp: a ready message with the app and an 8-character code they enter in
// Voltrix. Getting the code changes nothing, so opening and closing the sheet does nothing; the
// invite counts as sent once the trainer opens WhatsApp, copies the message or shares it.
// `added` is the version shown right after adding the client.
export function InviteSheet({
  client,
  added,
  onClose,
  onShared,
  onConnected,
}: {
  client: InviteClient | null;
  added?: boolean;
  onClose: () => void;
  // The invite went out (the page can show "Invite sent").
  onShared?: () => void;
  // The client turned out to be connected already: the page loads again.
  onConnected?: () => void;
}) {
  // The sheet keeps showing its client while it slides away.
  const [shown, setShown] = useState(client);
  if (client && client !== shown) setShown(client);
  return (
    <Sheet
      visible={!!client}
      onClose={onClose}
      title={shown ? (added ? `${shown.first_name} is added` : `Invite ${shown.first_name}`) : undefined}>
      {shown ? (
        <InviteBody
          key={shown.id}
          client={shown}
          added={added}
          visible={!!client}
          onClose={onClose}
          onShared={onShared}
          onConnected={onConnected}
        />
      ) : null}
    </Sheet>
  );
}

function InviteBody({
  client,
  added,
  visible,
  onClose,
  onShared,
  onConnected,
}: {
  client: InviteClient;
  added?: boolean;
  visible: boolean;
  onClose: () => void;
  onShared?: () => void;
  onConnected?: () => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [typed, setTyped] = useState('');
  const [all, setAll] = useState(false);
  const [asking, setAsking] = useState(false);
  const connected = useEffectEvent(() => {
    onClose();
    onConnected?.();
  });

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    callRpc<string>('invite_code', { p_client: client.id }).then(
      (answer) => {
        if (!alive) return;
        if (answer.missing) setError('Invites on WhatsApp aren’t ready yet. Try again later.');
        else setCode(answer.data);
      },
      (e) => {
        if (!alive) return;
        const sentence = plainError(e, 'Couldn’t get the invite ready. Check your connection and try again.');
        if (sentence === CONNECTED) return connected();
        setError(sentence);
      },
    );
    return () => {
      alive = false;
    };
  }, [client.id, attempt, visible]);

  const trainerFirst = profile?.full_name?.trim().split(/\s+/)[0] || profile?.business_name || 'your trainer';
  const country = profile?.country ?? 'ZA';
  const message = code
    ? inviteMessage({
        first: client.first_name,
        trainerFirst,
        business: profile?.business_name ?? null,
        code,
        email: client.email,
        status: client.app_status,
      })
    : '';
  const savedPhone = client.phone?.trim() || null;
  const phone = savedPhone ?? (typed.trim() || null);
  const number = waNumber(phone, country);
  const badNumber = !!phone && !number;
  const askAgain = (client.app_status === 'declined' || client.app_status === 'left') && !!client.email;

  // Counts the invite as sent, in the background.
  function shared() {
    callRpc('invite_shared', { p_client: client.id }).then(
      () => onShared?.(),
      () => {},
    );
  }

  function openWhatsApp() {
    if (!code || badNumber) return;
    // Opened first, before anything else (a browser only allows it straight away).
    openOutside(waLink(number, message));
    shared();
    if (!savedPhone && typed.trim()) {
      supabase
        .from('clients')
        .update({ phone: typed.trim().slice(0, 30) })
        .eq('id', client.id)
        .then(({ error }) => {
          if (error) toast(`Couldn’t save ${client.first_name}’s number. ${plainError(error)}`);
        });
    }
    onClose();
    toast('Opened WhatsApp. Press send there.');
  }

  async function copy() {
    if (!code) return;
    haptic.tap();
    await Clipboard.setStringAsync(message);
    shared();
    toast('Message copied');
  }

  async function share() {
    if (!code) return;
    try {
      const result = await Share.share({ message });
      if (result.action === Share.sharedAction) shared();
    } catch {
      // Closed without sharing.
    }
  }

  async function showOnHome() {
    setAsking(true);
    try {
      await inviteAgain(client.id);
      haptic.success();
      onShared?.();
      onClose();
      toast(`Invite sent to ${client.first_name}’s Voltrix Home`);
    } catch (e) {
      toast(plainError(e, 'Couldn’t send the invite. Try again.'));
    }
    setAsking(false);
  }

  if (error) {
    return (
      <View testID="invite-sheet" style={{ gap: Spacing.three }}>
        <Notice
          tone="danger"
          onCard
          action={{
            label: 'Try again',
            onPress: () => {
              setError(null);
              setAttempt((a) => a + 1);
            },
          }}>
          {error}
        </Notice>
        {added ? <Button title="Not now" variant="ghost" onPress={onClose} /> : null}
      </View>
    );
  }

  return (
    <View testID="invite-sheet" style={{ gap: Spacing.three }}>
      <Text variant="callout" tone="secondary">
        {client.first_name} gets your message on WhatsApp, with the app and a code to connect with you.
      </Text>
      <Card style={styles.message}>
        {code ? (
          <View testID="invite-message" style={{ gap: Spacing.two }}>
            <Text variant="callout" selectable numberOfLines={all ? undefined : 8}>
              {message}
            </Text>
            {all ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show the whole message"
                onPress={() => setAll(true)}
                style={styles.more}>
                <Text variant="footnote" style={{ fontFamily: Fonts.textSemi }}>
                  Show all
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View accessible accessibilityLabel="Loading the message" style={{ gap: Spacing.two }}>
            <Skeleton width="90%" height={12} radius={6} />
            <Skeleton width="100%" height={12} radius={6} />
            <Skeleton width="80%" height={12} radius={6} />
            <Skeleton width="60%" height={12} radius={6} />
          </View>
        )}
      </Card>
      {savedPhone ? null : (
        <TextField
          label="Their WhatsApp number"
          optional
          value={typed}
          onChangeText={setTyped}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="For example: 082 555 0101"
          maxLength={30}
          error={
            badNumber ? `Check the number. Include the country code if it isn’t from ${countryOf(country).name}.` : null
          }
          testID="invite-number"
        />
      )}
      {!phone ? (
        <Text variant="footnote" tone="secondary">
          WhatsApp will ask who to send it to.
        </Text>
      ) : null}
      <View style={{ gap: Spacing.tight }}>
        <Button
          title="Open WhatsApp"
          icon="logo-whatsapp"
          onPress={openWhatsApp}
          disabled={!code || badNumber}
          testID="invite-open"
        />
        <Button title="Copy message" variant="secondary" onPress={copy} disabled={!code} testID="invite-copy" />
        {Platform.OS === 'web' ? null : (
          <Button
            title="Share another way"
            variant="ghost"
            icon="share-outline"
            onPress={share}
            disabled={!code}
            testID="invite-share"
          />
        )}
        {askAgain ? (
          <TextLink
            label={asking ? 'Sending…' : 'Or just show it on their Voltrix Home'}
            onPress={() => {
              if (!asking) showOnHome();
            }}
            testID="invite-home"
          />
        ) : null}
        {added ? <Button title="Not now" variant="ghost" onPress={onClose} /> : null}
      </View>
      {code ? (
        <Text variant="footnote" tone="secondary">
          Code {formatCode(code)} · works for 30 days from when you share it.
        </Text>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  message: {
    backgroundColor: Colors.tint,
  },
  more: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginVertical: -Spacing.two,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
}));
