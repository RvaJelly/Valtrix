import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
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
      setError(e instanceof Error ? e.message : 'Could not accept. Check your connection and try again.');
      setBusy(null);
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
      await declineInvite(invite.client_id);
      onAnswered();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decline. Check your connection and try again.');
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Avatar url={invite.trainer_avatar} name={name} size={56} />
        <Text style={styles.title}>
          {name}
          {business ? <Text style={styles.business}> ({business})</Text> : null} wants to be your trainer
        </Text>
      </View>
      <Body secondary style={styles.small}>
        If you accept, {firstName} can see your food diary, the workouts you tick off and your chats, and you can
        message and call each other. You can leave any time in Settings.
      </Body>
      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button title="Accept" onPress={accept} loading={busy === 'accept'} disabled={!!busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Decline"
            variant="secondary"
            onPress={decline}
            loading={busy === 'decline'}
            disabled={!!busy}
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const styles = themed(() => ({
  card: {
    gap: Spacing.three,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  business: {
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  small: {
    fontSize: 14,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
}));
