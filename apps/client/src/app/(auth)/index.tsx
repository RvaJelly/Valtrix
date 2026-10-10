import { router } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Button, Text } from '@/components/ui';
import { VMark } from '@/components/v-mark';
import { Colors, Fonts, Layout, Spacing, themed } from '@/constants/theme';

const HIGHLIGHTS = [
  { title: 'Your sessions', text: 'Every booking, with a reminder before it starts.' },
  { title: 'Your training', text: 'Workouts from your trainer, ready when you are.' },
  { title: 'Your progress', text: 'Watch the work add up, week after week.' },
];

export default function Welcome() {
  const wide = useWindowDimensions().width >= Layout.wide;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* A faint Rising V behind everything: atmosphere without photos. */}
      <VMark height={560} mono style={styles.watermark} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
        <Logo style={styles.logo} />
        <View style={styles.hero}>
          <Text variant="label" tone="secondary">
            With your personal trainer
          </Text>
          <Text variant="display" accessibilityRole="header" style={{ marginTop: Spacing.tight }}>
            Rise with{'\n'}your trainer.
          </Text>
          <Text tone="secondary" style={styles.tagline}>
            Your sessions, workouts and food from your trainer, in one calm place.
          </Text>
        </View>

        <View style={styles.list}>
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
        <Text variant="footnote" tone="secondary" style={{ marginTop: Spacing.four }}>
          Personal trainers sign in with their Voltrix Coach login.
        </Text>
      </ScrollView>

      {/* The two ways in stay on screen, whatever the phone's height. */}
      <View style={styles.footer}>
        <Button title="Create your account" onPress={() => router.push('/sign-up')} />
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
    right: -120,
    top: 72,
    opacity: Colors.scheme === 'light' ? 0.04 : 0.05,
  },
  content: {
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
  },
  hero: {
    marginTop: 40,
  },
  tagline: {
    marginTop: Spacing.three,
    maxWidth: 340,
  },
  list: {
    marginTop: Spacing.five,
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
