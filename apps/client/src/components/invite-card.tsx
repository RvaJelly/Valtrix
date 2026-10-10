import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, Card, ErrorText, Text } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm, notice } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { callRpc } from '@/lib/rpc';
import { acceptInvite, declineInvite, trainerTitle, type Invite } from '@/lib/trainers';

const ACCEPT_FAILED = 'Could not accept. Check your connection and try again.';

// "Ryan (Iron Forge) wants to be your trainer", with Accept and Decline. Nothing of the
// client's reaches the trainer until they accept, and the card says everything the trainer
// will then see. onAnswered loads the screen again; `joined` is true when they are now linked.
//
// With `code` (an invite code typed in the code sheet) the card says who the trainer invited
// ("Invited as Lebo"), so a code meant for someone else is noticed before anything is shared, and
// "Not now" takes Decline's place: nothing is sent, and the code still works later.
export function InviteCard({
  invite,
  onAnswered,
  code,
  onNotNow,
}: {
  invite: Invite;
  onAnswered: (joined: boolean) => void;
  code?: string;
  onNotNow?: () => void;
}) {
  const { refresh } = useChat();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = trainerTitle(invite);
  const firstName = invite.trainer_name?.split(' ')[0] || name;
  const business = invite.trainer_name && invite.business_name ? invite.business_name : null;
  const invitedAs = code ? invite.client_first_name?.trim() || null : null;

  // Withdrawn, archived or answered on another phone while this card was on screen. The
  // card goes when the screen loads again, so the notice says why.
  function gone() {
    notice(
      `${firstName}'s invite is no longer available`,
      'It may have been withdrawn, or answered on another device.',
    );
    onAnswered(false);
  }

  // The chat with the trainer and any sessions they booked show up straight away.
  function joined() {
    refresh();
    refreshReminders();
    onAnswered(true);
  }

  async function accept() {
    setError(null);
    setBusy('accept');
    if (code) return acceptCode(code);
    try {
      await acceptInvite(invite.client_id);
      joined();
    } catch (e) {
      setBusy(null);
      // Database errors are plain objects, not Errors.
      if ((e as { code?: string } | null)?.code === '22023') gone();
      else setError(ACCEPT_FAILED);
    }
  }

  async function acceptCode(text: string) {
    try {
      const answer = await callRpc<string | null>('accept_invite_code', { p_code: text });
      if (answer.missing) throw new Error('missing');
      if (answer.data) {
        haptic.success();
        return joined();
      }
      // Used by someone else or out of date since the card opened (or they connected to this trainer
      // another way meanwhile).
      setBusy(null);
      notice('That code no longer works', `Someone may have used it, or it expired. Ask ${firstName} for a new one.`);
      onAnswered(false);
    } catch (e) {
      setBusy(null);
      haptic.warning();
      // The database's own sentence: "Too many tries…", "Confirm your email first…".
      setError((e as { code?: string } | null)?.code === '22023' ? plainError(e, ACCEPT_FAILED) : ACCEPT_FAILED);
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
      if (await declineInvite(invite.client_id)) onAnswered(false);
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
        accessibilityLabel={`${name}${business ? ` (${business})` : ''} wants to be your trainer${
          invitedAs ? `, invited as ${invitedAs}` : ''
        }`}>
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
            {invitedAs ? (
              <Text variant="footnote" tone="secondary" testID="invite-invited-as">
                Invited as {invitedAs}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <Text variant="callout" tone="secondary">
        If you accept, {firstName} can see your food diary, workouts, progress (weight, measurements and photos),
        check-ins and habits, including what you logged before, your health form if you filled it in, your sessions with
        them and your chats. You can message and call each other. You can leave any time in Settings.
      </Text>
      <View style={styles.buttons}>
        <Button
          title="Accept"
          size="medium"
          onPress={accept}
          loading={busy === 'accept'}
          disabled={!!busy}
          testID={code ? 'invite-accept' : undefined}
          style={{ flex: 1 }}
        />
        {code ? (
          <Button
            title="Not now"
            size="medium"
            variant="secondary"
            onPress={() => onNotNow?.()}
            disabled={!!busy}
            testID="invite-not-now"
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            title="Decline"
            size="medium"
            variant="secondary"
            onPress={decline}
            loading={busy === 'decline'}
            disabled={!!busy}
            style={{ flex: 1 }}
          />
        )}
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
