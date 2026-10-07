import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { PRICE_LABEL } from '@/lib/access';

const FEATURES = [
  'Unlimited clients',
  'Workout builder and exercise library',
  'Assign programs and track progress',
  'Bookings and chat with clients',
];

type Props = {
  trialEnded: boolean;
  onSignOut?: () => void;
};

export function SubscribeView({ trialEnded, onSignOut }: Props) {
  const [notice, setNotice] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Image
        source={require('@/assets/images/logo-coach-white.png')}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="Valtrix Coach"
      />
      <View style={{ gap: Spacing.two, alignItems: 'center' }}>
        <Text style={styles.headline}>{trialEnded ? 'Your free trial has ended' : 'Keep Valtrix Coach going'}</Text>
        <Body secondary style={{ textAlign: 'center' }}>
          {trialEnded
            ? 'Subscribe to keep managing your clients and workouts. Your data is safe and waiting for you.'
            : 'Subscribe any time during your trial. You won’t lose a day of it.'}
        </Body>
      </View>

      <Card style={styles.plan}>
        <Text style={styles.planName}>Valtrix Coach</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{PRICE_LABEL}</Text>
          <Body secondary>/ month</Body>
        </View>
        <View style={{ gap: Spacing.two }}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.feature}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.orange} />
              <Body>{f}</Body>
            </View>
          ))}
        </View>
        <Body secondary style={{ fontSize: 13 }}>
          Cancel any time.
        </Body>
      </Card>

      {/* Payments are not connected yet; the provider is still being chosen. */}
      <Button title="Subscribe" onPress={() => setNotice(true)} />
      {notice ? (
        <Body secondary style={{ textAlign: 'center' }}>
          Payments are being set up. You’ll be able to subscribe here very soon.
        </Body>
      ) : null}
      {onSignOut ? <Button title="Sign out" variant="ghost" onPress={onSignOut} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.four,
  },
  logo: {
    width: 200,
    aspectRatio: 2400 / 1052,
    alignSelf: 'center',
  },
  headline: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  plan: {
    gap: Spacing.three,
    borderColor: Colors.orange,
    borderRadius: Radius.large,
  },
  planName: {
    color: Colors.orange,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  price: {
    color: Colors.text,
    fontSize: 44,
    fontWeight: '800',
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
