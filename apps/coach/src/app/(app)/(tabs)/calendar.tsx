import { ScrollView } from 'react-native';

import { EmptyState } from '@/components/ui';

export default function CalendarScreen() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="calendar-outline"
        title="Calendar"
        message="Book sessions with your clients and see your week at a glance. Coming soon."
      />
    </ScrollView>
  );
}
