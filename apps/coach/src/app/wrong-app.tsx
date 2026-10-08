import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Body, Button, Card, Title } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

// Shown when a client signs in to the trainer app.
export default function WrongApp() {
  const { session, signOut } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo style={{ width: 200, alignSelf: 'center' }} />
        <Title>This is a client account</Title>
        <Card>
          <Body>
            {session?.user.email} is set up as a client. Clients use the Voltrix app to see their sessions. To coach
            clients, sign up here with a different email.
          </Body>
        </Card>
        <Button title="Sign out" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.four,
  },
}));
