import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Body, Button, StatusPill } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type } from '@/constants/theme';
import { PRICE_LABEL, TRIAL_DAYS } from '@/lib/access';

type IconName = ComponentProps<typeof Ionicons>['name'];

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'people-outline', text: 'Unlimited clients, goals and notes' },
  { icon: 'barbell-outline', text: 'Workout builder with a ready-made exercise library' },
  { icon: 'trending-up-outline', text: 'Assign programs and track every client’s progress' },
  { icon: 'calendar-clear-outline', text: 'Bookings and a calendar that fills itself' },
  { icon: 'chatbubbles-outline', text: 'Chat with clients in one place' },
  { icon: 'sparkles-outline', text: 'New features every month at no extra cost' },
];

type Props = {
  // 'start' for a trainer who has never had a trial, 'ended' once it has run out.
  mode: 'start' | 'ended';
  onSignOut?: () => void;
};

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

// Trainers add a card here before they get into the app. Nothing is charged
// for the first three days; after that the monthly plan starts on its own.
export function SubscribeView({ mode, onSignOut }: Props) {
  const [notice, setNotice] = useState(false);
  const starting = mode === 'start';
  const [chargeDate] = useState(() => formatDate(new Date(Date.now() + TRIAL_DAYS * 86_400_000)));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Logo style={styles.logo} />

      <View style={{ gap: Spacing.two, alignItems: 'center' }}>
        {starting ? <StatusPill tone="success" label={`${TRIAL_DAYS} days free`} /> : null}
        <Text style={styles.headline}>
          {starting ? 'Build the business you’ve been training for' : 'Welcome back, coach'}
        </Text>
        <Body secondary style={{ textAlign: 'center' }}>
          {starting
            ? 'Everything you need to win clients, keep them and get paid, in one app.'
            : 'Your free trial has ended. Your clients and workouts are saved and waiting for you.'}
        </Body>
      </View>

      <View style={{ gap: Spacing.three }}>
        {BENEFITS.map((b) => (
          <View key={b.text} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Ionicons name={b.icon} size={18} color={Colors.textSecondary} />
            </View>
            <Body style={{ flex: 1 }}>{b.text}</Body>
          </View>
        ))}
      </View>

      <View style={styles.plan}>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>Voltrix Coach</Text>
          {starting ? <Text style={styles.planTrial}>{TRIAL_DAYS}-day free trial</Text> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.price, Tabular]}>{PRICE_LABEL}</Text>
          <Body secondary>/ month</Body>
        </View>
        <Text style={styles.small}>Less than one personal training session a month.</Text>
      </View>

      {starting ? (
        <View style={styles.timeline}>
          <Step icon="lock-open" title="Today" text="Full access to everything. You pay nothing today." />
          <Step icon="notifications" title="Any time" text="Cancel in a few taps if it isn’t for you." />
          <Step icon="card" title={chargeDate} text={`Your plan starts at ${PRICE_LABEL} a month.`} last />
        </View>
      ) : null}

      <View style={{ gap: Spacing.two }}>
        {/* Card payments are not connected yet; the provider is still being chosen. */}
        <Button title={starting ? 'Start my free trial' : 'Subscribe now'} onPress={() => setNotice(true)} />
        {notice ? (
          <Body secondary style={{ textAlign: 'center' }}>
            Card payments are being connected. You’ll be able to start here very soon.
          </Body>
        ) : null}
        <Body secondary style={styles.fineprint}>
          {starting
            ? `Add your card to start. No charge until ${chargeDate}, then ${PRICE_LABEL} a month until you cancel.`
            : `${PRICE_LABEL} a month until you cancel.`}
        </Body>
      </View>

      {onSignOut ? <Button title="Sign out" variant="ghost" onPress={onSignOut} /> : null}
    </ScrollView>
  );
}

function Step({ icon, title, text, last }: { icon: IconName; title: string; text: string; last?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={{ alignItems: 'center' }}>
        <View style={styles.stepIcon}>
          <Ionicons name={icon} size={16} color={Colors.text} />
        </View>
        {last ? null : <View style={styles.stepLine} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : Spacing.three }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.small}>{text}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    width: 148,
    alignSelf: 'center',
  },
  headline: {
    ...Type.largeTitle,
    color: Colors.text,
    textAlign: 'center',
  },
  small: {
    ...Type.footnote,
    color: Colors.textSecondary,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The membership card: the one raised block, no orange border.
  plan: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.four,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  planName: {
    ...Type.title,
    color: Colors.text,
  },
  planTrial: {
    ...Type.footnote,
    fontFamily: Fonts.textMedium,
    color: Colors.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  price: {
    ...Type.display,
    color: Colors.text,
  },
  timeline: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.gutter,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    backgroundColor: Colors.border,
  },
  stepTitle: {
    ...Type.rowTitle,
    color: Colors.text,
  },
  fineprint: {
    ...Type.footnote,
    textAlign: 'center',
  },
}));
