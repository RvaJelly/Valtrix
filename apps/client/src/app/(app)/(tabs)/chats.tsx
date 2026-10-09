import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ChatList } from '@/components/chat-list';
import { Button } from '@/components/ui';
import { useChatEvents } from '@/lib/chat-live';
import { loadInvites, trainerTitle, type Invite } from '@/lib/trainers';

export default function Chats() {
  // A trainer's invite waiting on Home: the chat starts once it is accepted.
  const [invites, setInvites] = useState<Invite[]>([]);

  const load = useCallback(() => {
    loadInvites().then(setInvites, () => {});
  }, []);

  useFocusEffect(load);
  // News sent while the connection was down is missed, so load again when it is back.
  useChatEvents((event) => {
    if (event.type === 'link' || event.type === 'reconnected') load();
  });

  const first = invites[0];
  return (
    <ChatList
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
          : {
              title: 'No chats yet',
              message: 'Once you accept your trainer’s invite, you can message and call them here.',
              action: <Button title="Find a trainer" variant="secondary" onPress={() => router.push('/trainers')} />,
            }
      }
    />
  );
}
