import { router } from 'expo-router';

import { ChatList } from '@/components/chat-list';
import { Button } from '@/components/ui';

export default function Chats() {
  return (
    <ChatList
      empty={{
        title: 'No chats yet',
        message:
          'You can message and call clients once they accept your invite in the Voltrix app. Add a client’s email to invite them.',
        action: <Button title="Go to clients" variant="secondary" onPress={() => router.navigate('/clients')} />,
      }}
    />
  );
}
