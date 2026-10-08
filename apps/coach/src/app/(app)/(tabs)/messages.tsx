import { router } from 'expo-router';

import { ChatList } from '@/components/chat-list';
import { Button } from '@/components/ui';

export default function Chats() {
  return (
    <ChatList
      empty={{
        title: 'No chats yet',
        message:
          'You can message and call clients who have joined the Voltrix app. Add their email to a client, then ask them to sign up with it.',
        action: <Button title="Go to clients" variant="secondary" onPress={() => router.navigate('/clients')} />,
      }}
    />
  );
}
