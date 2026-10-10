import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, Card, ErrorText, Text } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm, notice } from '@/lib/confirm';
import { refreshReminders } from '@/lib/reminders';
import { acceptInvite, declineInvite, trainerTitle, type Invite } from '@/lib/trainers';

// "Ryan (Iron Forge) wants to be your trainer", with Accept and Decline. Nothing of the
// client's reaches the trainer until they accept. onAnswered loads the screen again.
export function InviteCard({ invite, onAnswered }: { invite: Invite; onAnswered: () => void }) {
  const { refresh } = useChat();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = trainerTitle(invite);
  const firstName = invite.trainer_name?.split(' ')[0] || name;
  const business = invite.trainer_name && invite.business_name ? invite.business_name : null;

  // Withdrawn, archived or answered on another phone while this card was on screen. The
  // card goes when the screen loads again, so the notice says why.
  function gone() {
    notice(
      `${firstName}'s invite is no longer available`,
      'It may have been withdrawn, or answered on another device.',
    );
    onAnswered();
  }

  async function accept() {
    setError(null);
    setBusy('accept');
    try {
      await acceptInvite(invite.client_id);
      // The chat with the trainer and any sessions they booked show up straight away.
      refresh();
      refreshReminders();
      onAnswered();
    } catch (e) {
      setBusy(null);
      // Database errors are plain objects, not Errors.
      if ((e as { code?: string } | null)?.code === '22023') gone();
      else setError('Could not accept. Check your connection and try again.');
    }
  }

  async function decline() {
    const sure = await confirm(
      `Decline ${firstName}?`,
      `${firstName} won't be linked to you and won't see anything of yours. They can send you an invite again later.`,
      'Decline',
    );
    if (!sure) return;
    setError(null);
    setBusy('decline');
    try {
      if (await declineInvite(invite.client_id)) onAnswered();
      else {
        setBusy(null);
        gone();
      }
    } catch {
      setError('Could not decline. Check your connection and try again.');
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <View
        style={{ gap: Spacing.tight }}
        accessible
        accessibilityLabel={`${name}${business ? ` (${business})` : ''} wants to be your trainer`}>
        <Text variant="label" tone="secondary">
          Wants to be your trainer
        </Text>
        <View style={styles.top}>
          <Avatar url={invite.trainer_avatar} name={name} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">{name}</Text>
            {business ? (
              <Text variant="footnote" tone="secondary">
                {business}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <Text variant="callout" tone="secondary">
        If you accept, {firstName} can see your food diary, the workouts you tick off and your chats, and you can
        message and call each other. You can leave any time in Settings.
      </Text>
      <View style={styles.buttons}>
        <Button
          title="Accept"
          size="medium"
          onPress={accept}
          loading={busy === 'accept'}
          disabled={!!busy}
          style={{ flex: 1 }}
        />
        <Button
          title="Decline"
          size="medium"
          variant="secondary"
          onPress={decline}
          loading={busy === 'decline'}
          disabled={!!busy}
          style={{ flex: 1 }}
        />
      </View>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// The same card as the rest of Home, with no orange border: the Accept button is its one orange mark.
const styles = themed(() => ({
  card: {
    gap: Spacing.tight,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.tight,
    marginTop: Spacing.one,
  },
}));
