import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { loadBookingInfo, loadMyPacks, type MyPack } from '@/lib/booking';
import { useChat } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { refreshReminders } from '@/lib/reminders';
import { leaveTrainer, trainerTitle, type Trainer } from '@/lib/trainers';
import { dayFromKey } from '@/lib/zones';

// One of the client's trainers: what they see, their profile and chat, and Leave.
export default function TrainerSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { trainers, failed } = useMyTrainers();
  const { refresh } = useChat();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this trainer takes bookings in the app from the person, and their packs with them. Both
  // are left out when they can't be loaded or the database is older.
  const [canBook, setCanBook] = useState(false);
  const [packs, setPacks] = useState<MyPack[]>([]);
  const trainer = trainers?.find((t) => t.trainer_id === id) ?? null;

  useEffect(() => {
    let alive = true;
    loadBookingInfo(id)
      .then((info) => {
        if (alive) setCanBook(!!info?.can_book);
      })
      .catch(() => {});
    loadMyPacks()
      .then((list) => {
        if (alive) setPacks((list ?? []).filter((p) => p.trainer_id === id && !p.ended));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

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
      `${first} will no longer see your food diary, workouts, progress (weight, measurements and photos), check-ins, habits, health form, chat or calls, and you won't see the plans and sessions they set for you. ${first} keeps their own notes. You can join again if they send you a new invite.`,
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
          {first} archived you for now, so they don&apos;t see your food diary, workouts, progress, check-ins, habits,
          health form or chat. They will again if they make you active. Leave if you don&apos;t want that.
        </Notice>
      ) : (
        <Section title={`${first} sees`}>
          <Text variant="callout" tone="secondary">
            Your food diary, workouts, progress (including photos), check-ins, habits, your health form if you filled it
            in, your sessions with them and your chats with them.
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
            last={!canBook}
          />
        ) : null}
        {!archived && canBook ? (
          <ListRow
            title="Book a session"
            leading={<IconTile icon="calendar-outline" />}
            onPress={() => router.push({ pathname: '/book', params: { trainer: trainer.trainer_id } })}
            testID="trainer-book"
            last
          />
        ) : null}
      </Group>

      {packs.length ? (
        <Group testID="trainer-pack">
          {packs.map((p, i) => (
            <ListRow
              key={p.id}
              title={`Pack · ${p.sessions_left} of ${p.sessions_total} left`}
              subtitle={p.expires_on ? `Ends ${dayMonth(dayFromKey(p.expires_on))}` : 'No end date'}
              titleStyle={Tabular}
              leading={<IconTile icon="albums-outline" />}
              last={i === packs.length - 1}
            />
          ))}
        </Group>
      ) : null}

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
