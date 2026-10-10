import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { openOutside } from '@/components/invite-sheet';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, Group, IconTile, ListRow, Text, Toggle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { ago } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { answeredOne, answerPerson, type PersonRequest } from '@/lib/requests';
import { addFailure } from '@/lib/save-error';
import { supabase } from '@/lib/supabase';
import { waChat, waNumber } from '@/lib/whatsapp';

// Refusals that mean the request isn't waiting any more: the buttons turn off.
const SETTLED = [
  'This person has joined another trainer.',
  'This request was withdrawn.',
  'This person’s Voltrix account is no longer available.',
  'You’ve answered this request already.',
  'This request is no longer available.',
];

// Someone asking to train with the trainer: who, their note, what accepting means, then Accept or
// Decline (with the choice to block them). `gone` turns it off when the request was settled while
// open.
export function PersonSheet({
  request,
  onClose,
  onAnswered,
  gone,
}: {
  request: PersonRequest | null;
  onClose: () => void;
  // The opener reloads (after an answer, or a refusal that settled it).
  onAnswered: () => void;
  gone?: boolean;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const [shown, setShown] = useState(request);
  const [step, setStep] = useState<'look' | 'decline'>('look');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  // Fresh each time it opens, or opens on another person.
  const [wasOpen, setWasOpen] = useState(!!request);
  if (!!request !== wasOpen) setWasOpen(!!request);
  if (request && (request.id !== shown?.id || !wasOpen)) {
    setShown(request);
    setStep('look');
    setBlock(false);
    setBusy(null);
    setError(null);
    setSettled(false);
  }
  const r = request ?? shown;
  if (!r) return <Sheet visible={false} onClose={onClose} />;

  const name = r.full_name?.trim() || 'Someone';
  const first = name.split(/\s+/)[0];
  const off = settled || !!gone || r.status !== 'pending';
  const number = waNumber(r.phone, profile?.country ?? 'ZA');

  function refused(words: string) {
    haptic.warning();
    if (SETTLED.includes(words)) {
      setSettled(true);
      onAnswered();
    }
    setError(words);
  }

  async function accept() {
    if (!r || busy) return;
    setBusy('accept');
    setError(null);
    let clientId: string | null;
    try {
      clientId = await answerPerson(r.id, true);
    } catch (e) {
      setBusy(null);
      return refused(await addFailure(e));
    }
    answeredOne();
    // A row older than this minute means the person trained with this trainer before (or had an
    // invite waiting): the database brought it back with its history.
    let back = false;
    if (clientId) {
      const { data } = await supabase.from('clients').select('created_at').eq('id', clientId).maybeSingle();
      back = !!data && Date.now() - Date.parse((data as { created_at: string }).created_at) > 60_000;
    }
    haptic.success();
    toast(back ? `${first} is back as your client.` : `${first} is your client now.`);
    setBusy(null);
    onAnswered();
    onClose();
    if (clientId) router.push({ pathname: '/clients/[id]', params: { id: clientId } });
  }

  async function decline() {
    if (!r || busy) return;
    setBusy('decline');
    setError(null);
    try {
      await answerPerson(r.id, false, block);
    } catch (e) {
      setBusy(null);
      return refused(plainError(e, 'Couldn’t answer. Try again.'));
    }
    answeredOne();
    haptic.select();
    toast('Declined.');
    setBusy(null);
    onAnswered();
    onClose();
  }

  if (step === 'decline') {
    return (
      <Sheet visible={!!request} onClose={onClose} title={`Decline ${first}?`}>
        <Text variant="callout" tone="secondary">
          {`${first} can ask you again in 30 days.`}
        </Text>
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title={`Also block ${first}`}
            subtitle={block ? 'They won’t see you in the Trainers list and can’t ask again.' : undefined}
            subtitleLines={3}
            trailing={
              <Toggle
                accessibilityLabel={`Also block ${first}`}
                value={block}
                onValueChange={setBlock}
                disabled={!!busy}
                testID="person-block"
              />
            }
            compact
            last
          />
        </Group>
        <ErrorText testID="person-error">{error}</ErrorText>
        <View style={{ gap: Spacing.tight }}>
          <Button
            title="Decline"
            variant="destructive"
            onPress={decline}
            loading={busy === 'decline'}
            disabled={off}
            testID="person-decline-confirm"
          />
          <Button title="Back" variant="ghost" onPress={() => setStep('look')} disabled={!!busy} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={!!request} onClose={onClose} title={name}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
        <Avatar url={r.avatar_url} name={name} size={64} />
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text variant="headline">Wants to train with you</Text>
          <Text variant="footnote" tone="secondary">
            {`Asked ${ago(new Date(r.created_at))}`}
          </Text>
        </View>
      </View>
      {r.note ? (
        // A tinted card, so the note stands apart on the sheet in both themes.
        <Card style={{ backgroundColor: Colors.tint }}>
          <Text variant="callout">{`“${r.note}”`}</Text>
        </Card>
      ) : null}
      {/* Their number only while the request waits: once it is withdrawn or declined it's gone. */}
      {r.phone && !off ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title={number ? `WhatsApp ${r.phone}` : `Call ${r.phone}`}
            leading={<IconTile icon={number ? 'logo-whatsapp' : 'call-outline'} />}
            onPress={() => openOutside(number ? waChat(number) : `tel:${r.phone!.replace(/[^\d+]/g, '')}`)}
            compact
            last
          />
        </Group>
      ) : null}
      <View style={{ gap: Spacing.two }}>
        <Text variant="callout">
          {`If you accept, ${first} becomes your client and is connected in Voltrix: you see what they log there (food diary, workouts, progress, check-ins, habits and their health form if they filled it in) and you can message and call each other.`}
        </Text>
        <Text variant="footnote" tone="secondary">
          {`${first} agreed to this when they asked. You’ll see their email once you accept.`}
        </Text>
      </View>
      {gone ? (
        <Text variant="footnote" tone="secondary">
          This request is no longer waiting.
        </Text>
      ) : null}
      <ErrorText testID="person-error">{error}</ErrorText>
      <View style={{ gap: Spacing.tight }}>
        <Button
          title={`Accept ${first}`}
          onPress={accept}
          loading={busy === 'accept'}
          disabled={off || (!!busy && busy !== 'accept')}
          testID="person-accept"
        />
        <Button
          title="Decline"
          variant="secondary"
          onPress={() => {
            setError(null);
            setStep('decline');
          }}
          disabled={off || !!busy}
          testID="person-decline"
        />
      </View>
    </Sheet>
  );
}
