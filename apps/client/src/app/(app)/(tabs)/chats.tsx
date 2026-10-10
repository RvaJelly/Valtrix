import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { ChatList } from '@/components/chat-list';
import { Button } from '@/components/ui';
import { Layout } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { serial } from '@/lib/serial';
import { loadInvites, loadTrainers, trainerTitle, type Invite, type Trainer } from '@/lib/trainers';

export default function Chats() {
  // A trainer's invite waiting on Home: the chat starts once it is accepted.
  const [invites, setInvites] = useState<Invite[]>([]);
  // The person's trainers: "Find a trainer" is only for someone without one. Null until known.
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);

  // One load at a time, so a slow older answer can't bring back an answered invite.
  const load = useMemo(
    () =>
      serial((current) =>
        Promise.all([loadInvites(), loadTrainers().catch(() => null)]).then(([list, linked]) => {
          if (!current()) return;
          setInvites(list);
          if (linked) setTrainers(linked);
        }),
      ),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // News sent while the connection was down is missed, so load again when it is back.
  useChatEvents((event) => {
    if (event.type === 'link' || event.type === 'reconnected') load();
  });

  const first = invites[0];
  const own = trainers?.[0];
  const ownName = own ? trainerTitle(own) : '';
  const ownFirst = ownName.split(' ')[0] || ownName;
  return (
    <ChatList
      title="Chats"
      maxWidth={Layout.maxClient}
      empty={
        first
          ? {
              title: 'No chats yet',
              message: `${invites.length > 1 ? 'Trainers have' : `${trainerTitle(first)} has`} invited you to train with them. Accept on Home to message and call them here.`,
              action: (
                <Button
                  title={invites.length > 1 ? 'See invites' : 'See invite'}
                  onPress={() => router.navigate('/')}
                />
              ),
            }
          : own
            ? {
                title: 'No chats yet',
                message: `Messages and calls with ${ownFirst} show up here.`,
                action: (
                  <Button
                    title={`Message ${ownFirst}`}
                    icon="chatbubble-outline"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[id]',
                        params: { id: own.client_id, name: ownName, avatar: own.trainer_avatar ?? '' },
                      })
                    }
                  />
                ),
              }
            : {
                title: 'No chats yet',
                message: 'Once you accept your trainer’s invite, you can message and call them here.',
                action: trainers ? (
                  <Button title="Find a trainer" variant="secondary" onPress={() => router.push('/trainers')} />
                ) : undefined,
              }
      }
    />
  );
}
