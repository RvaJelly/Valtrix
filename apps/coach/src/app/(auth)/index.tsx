import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, Text } from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { Colors, Fonts, Layout, Spacing, themed } from '@/constants/theme';
import { TRIAL_DAYS } from '@/lib/access';

const HIGHLIGHTS = [
  { title: 'All your clients', text: 'Goals, notes and progress together.' },
  { title: 'Programs in minutes', text: 'Build from a ready-made library.' },
  { title: 'Bookings and chat', text: 'Bookings without the WhatsApp chaos.' },
];

export default function Welcome() {
  const wide = useWindowDimensions().width >= Layout.wide;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* A faint Rising V behind everything: atmosphere without photos. It runs off the right and
          bottom edges, so no edge of it shows. */}
      <VMark height={640} mono style={styles.watermark} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <Logo style={styles.logo} />
        <View style={styles.hero}>
          <Text variant="label" tone="secondary">
            For personal trainers
          </Text>
          <Text variant="display" accessibilityRole="header" style={{ marginTop: Spacing.tight }}>
            Coach more.{'\n'}Admin less.
          </Text>
          <Text tone="secondary" style={styles.tagline}>
            Clients, programs, bookings and chat in one calm place, so you can focus on coaching.
          </Text>
        </View>

        <View style={[styles.list, !wide && styles.listLow]}>
          {HIGHLIGHTS.map((h, i) => (
            <View key={h.title} style={styles.item}>
              <Text style={styles.number}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="rowTitle">{h.title}</Text>
                <Text variant="callout" tone="secondary">
                  {h.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* The two ways in stay on screen, whatever the phone's height. */}
      <View style={styles.footer}>
        <Button title={`Start your ${TRIAL_DAYS}-day free trial`} onPress={() => router.push('/sign-up')} />
        <Button title="I already have an account" variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -180,
    bottom: -200,
    opacity: Colors.scheme === 'light' ? 0.04 : 0.05,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: Layout.maxWelcome,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  contentWide: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  logo: {
    width: 148,
    alignSelf: 'flex-start',
    // The image carries the brand kit's clear space; this lines the V up with the text below.
    marginLeft: -12,
  },
  hero: {
    marginTop: 40,
    marginBottom: Spacing.five,
  },
  // On a phone the list sits just above the buttons and the spare room goes under the headline.
  listLow: {
    marginTop: 'auto',
  },
  tagline: {
    marginTop: Spacing.three,
    maxWidth: 340,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  item: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  number: {
    width: 32,
    fontFamily: Fonts.displaySemi,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textTertiary,
  },
  footer: {
    width: '100%',
    maxWidth: Layout.maxWelcome,
    alignSelf: 'center',
    gap: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.tight,
    paddingBottom: Spacing.three,
  },
}));
