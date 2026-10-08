import { router } from 'expo-router';

import { ChatList } from '@/components/chat-list';
import { Button } from '@/components/ui';

export default function Chats() {
  return (
    <ChatList
      empty={{
        title: 'No chats yet',
        message: 'Once your trainer adds you in Voltrix Coach, you can message and call them here.',
        action: <Button title="Find a trainer" variant="secondary" onPress={() => router.navigate('/trainers')} />,
      }}
    />
  );
}
