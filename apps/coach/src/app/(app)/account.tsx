import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth } from '@/lib/auth';

export default function Account() {
  const { session, profile, signOut } = useAuth();
  const access = coachAccess(profile);
  const plan =
    access.kind === 'subscribed'
      ? `Valtrix Coach, ${PRICE_LABEL} / month`
      : access.kind === 'trial'
        ? `Free trial, ${access.daysLeft === 1 ? '1 day' : `${access.daysLeft} days`} left`
        : 'No active plan';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ gap: Spacing.three }}>
        <Row label="Name" value={profile?.full_name ?? '–'} />
        <Row label="Business" value={profile?.business_name ?? '–'} />
        <Row label="Email" value={session?.user.email ?? '–'} />
        <Row label="Plan" value={plan} />
      </Card>
      {access.kind !== 'subscribed' ? <Button title="Subscribe" onPress={() => router.push('/subscribe')} /> : null}
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
