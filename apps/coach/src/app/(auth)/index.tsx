import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export default function Welcome() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/logo-coach-white.png')}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Valtrix Coach"
        />
        <Body secondary style={styles.tagline}>
          Run your training business from your phone. Clients, programs, bookings and chat in one place.
        </Body>
      </View>
      <View style={styles.actions}>
        <Button title="Create trainer account" onPress={() => router.push('/sign-up')} />
        <Button title="I already have an account" variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  logo: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 2400 / 1052,
  },
  tagline: {
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    gap: Spacing.three,
  },
});
