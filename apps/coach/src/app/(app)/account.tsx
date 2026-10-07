import { ScrollView, StyleSheet, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function Account() {
  const { session, profile, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ gap: Spacing.three }}>
        <Row label="Name" value={profile?.full_name ?? '–'} />
        <Row label="Business" value={profile?.business_name ?? '–'} />
        <Row label="Email" value={session?.user.email ?? '–'} />
      </Card>
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: Spacing.one }}>
      <Body secondary style={{ fontSize: 14 }}>
        {label}
      </Body>
      <Body>{value}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
});
