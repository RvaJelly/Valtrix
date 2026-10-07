import { ScrollView } from 'react-native';

import { EmptyState } from '@/components/ui';

export default function ProgramsScreen() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="barbell-outline"
        title="Programs"
        message="Build workouts and programs, then assign them to your clients. This is the next part we build."
      />
    </ScrollView>
  );
}
