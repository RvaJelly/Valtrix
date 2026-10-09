import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Body, Button } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { TRIAL_DAYS } from '@/lib/access';

const HIGHLIGHTS: { icon: ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'people', title: 'All your clients', text: 'Goals, notes and progress for every client in one place.' },
  { icon: 'barbell', title: 'Programs in minutes', text: 'Build workouts from a ready-made exercise library.' },
  { icon: 'calendar', title: 'Bookings and chat', text: 'Fill your calendar and keep in touch without the WhatsApp chaos.' },
];

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Logo style={styles.logo} />
          <Text style={styles.headline}>Coach more.{'\n'}Admin less.</Text>
          <Body secondary style={styles.tagline}>
            The app that runs your personal training business, so you can focus on your clients.
          </Body>
        </View>

        <View style={{ gap: Spacing.three }}>
          {HIGHLIGHTS.map((h) => (
            <View key={h.title} style={styles.highlight}>
              <View style={styles.highlightIcon}>
                <Ionicons name={h.icon} size={22} color={Colors.onAccent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.highlightTitle}>{h.title}</Text>
                <Body secondary style={{ fontSize: 14, lineHeight: 20 }}>
                  {h.text}
                </Body>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button title={`Start your ${TRIAL_DAYS}-day free trial`} onPress={() => router.push('/sign-up')} />
          <Button title="I already have an account" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.five,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  logo: {
    width: '70%',
    maxWidth: 280,
  },
  headline: {
    color: Colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
    maxWidth: 340,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  highlightIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  actions: {
    gap: Spacing.three,
  },
}));
