import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SettingsPage, useMyTrainers } from '@/components/settings-parts';
import {
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Notice,
  Section,
  SkeletonRows,
  StatusPill,
  Text,
} from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { refreshReminders } from '@/lib/reminders';
import { leaveTrainer, trainerTitle, type Trainer } from '@/lib/trainers';

// One of the client's trainers: what they see, their profile and chat, and Leave.
export default function TrainerSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trainers, failed } = useMyTrainers();
  const { refresh } = useChat();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trainer = trainers?.find((t) => t.trainer_id === id) ?? null;

  if (!trainers) {
    return (
      <SettingsPage>
        <Stack.Screen options={{ title: '' }} />
        {failed ? (
          <Notice tone="danger">Your trainers could not be loaded. Check your connection.</Notice>
        ) : (
          <SkeletonRows count={2} avatar />
        )}
      </SettingsPage>
    );
  }
  if (!trainer) {
    return (
      <SettingsPage>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="person-outline" title="Not your trainer" message="You're no longer linked to this trainer." />
      </SettingsPage>
    );
  }

  const name = trainerTitle(trainer);
  const first = trainer.trainer_name?.split(' ')[0] || name;
  const archived = trainer.client_status === 'archived';

  async function leave(t: Trainer) {
    const sure = await confirm(
      `Leave ${name}?`,
      `${first} will no longer see your food diary, workouts, progress (weight, measurements and photos), check-ins, habits, chat or calls, and you won't see the plans and sessions they set for you. ${first} keeps their own notes. You can join again if they send you a new invite.`,
      'Leave',
    );
    if (!sure) return;
    setError(null);
    setLeaving(true);
    try {
      await leaveTrainer(t.client_id);
      // The chat goes from Chats, and reminders for their sessions stop.
      refresh();
      refreshReminders();
      if (router.canGoBack()) router.back();
      else router.replace('/settings');
    } catch (e) {
      setError(plainError(e, 'Could not leave. Check your connection and try again.'));
      setLeaving(false);
    }
  }

  return (
    <SettingsPage>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ alignItems: 'center', gap: Spacing.two }}>
        <Avatar url={trainer.trainer_avatar} name={name} size={72} />
        <Text variant="title" style={{ textAlign: 'center', marginTop: Spacing.two }}>
          {name}
        </Text>
        {trainer.trainer_name && trainer.business_name ? (
          <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {trainer.business_name}
          </Text>
        ) : null}
        <StatusPill
          tone={archived ? 'neutral' : trainer.client_status === 'paused' ? 'warning' : 'success'}
          label={archived ? 'Archived you' : trainer.client_status === 'paused' ? 'Paused' : 'Your trainer'}
        />
      </View>

      {archived ? (
        <Notice>
          {first} archived you for now, so they don&apos;t see your food diary, workouts, progress, check-ins, habits or
          chat. They will again if they make you active. Leave if you don&apos;t want that.
        </Notice>
      ) : (
        <Section title={`${first} sees`}>
          <Text variant="callout" tone="secondary">
            Your food diary, workouts, progress (including photos), check-ins, habits and your chats with them.
          </Text>
        </Section>
      )}

      <Group>
        <ListRow
          title="View profile"
          leading={<IconTile icon="person-outline" />}
          onPress={() => router.push({ pathname: '/trainers/[id]', params: { id: trainer.trainer_id } })}
          last={archived}
        />
        {!archived ? (
          <ListRow
            title={`Message ${first}`}
            leading={<IconTile icon="chatbubble-outline" />}
            onPress={() =>
              router.push({
                pathname: '/chat/[id]',
                params: { id: trainer.client_id, name, avatar: trainer.trainer_avatar ?? '' },
              })
            }
            last
          />
        ) : null}
      </Group>

      <View style={{ gap: Spacing.two }}>
        <ErrorText>{error}</ErrorText>
        <Group>
          <ListRow
            title={leaving ? 'Leaving…' : `Leave ${first}`}
            titleTone="danger"
            leading={<IconTile icon="exit-outline" color={Colors.danger} />}
            chevron={false}
            accessibilityLabel={`Leave ${name}`}
            onPress={leaving ? undefined : () => leave(trainer)}
            last
          />
        </Group>
        <Text variant="footnote" tone="secondary">
          You can join again if {first} sends you a new invite.
        </Text>
      </View>
    </SettingsPage>
  );
}
