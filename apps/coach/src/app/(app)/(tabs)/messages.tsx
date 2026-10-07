import { ScrollView } from 'react-native';

import { EmptyState } from '@/components/ui';

export default function ChatScreen() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="chatbubbles-outline"
        title="Chat"
        message="Message your clients directly from the app. Coming soon."
      />
    </ScrollView>
  );
}
