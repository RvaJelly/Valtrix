import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Body, Button } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { PRICE_LABEL, TRIAL_DAYS } from '@/lib/access';

type IconName = ComponentProps<typeof Ionicons>['name'];

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'people', text: 'Unlimited clients, goals and notes' },
  { icon: 'barbell', text: 'Workout builder with a ready-made exercise library' },
  { icon: 'trending-up', text: 'Assign programs and track every client’s progress' },
  { icon: 'calendar', text: 'Bookings and a calendar that fills itself' },
  { icon: 'chatbubbles', text: 'Chat with clients in one place' },
  { icon: 'sparkles', text: 'New features every month at no extra cost' },
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
        {starting ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{TRIAL_DAYS} DAYS FREE</Text>
          </View>
        ) : null}
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
              <Ionicons name={b.icon} size={18} color={Colors.accentText} />
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
          <Text style={styles.price}>{PRICE_LABEL}</Text>
          <Body secondary>/ month</Body>
        </View>
        <Body secondary style={{ fontSize: 14 }}>
          Less than one personal training session a month.
        </Body>
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
          <Ionicons name={icon} size={16} color={Colors.onAccent} />
        </View>
        {last ? null : <View style={styles.stepLine} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : Spacing.three }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Body secondary style={{ fontSize: 14, lineHeight: 20 }}>
          {text}
        </Body>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.four,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    width: 180,
    alignSelf: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
  },
  badgeText: {
    color: Colors.onAccent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headline: {
    color: Colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
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
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plan: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.large,
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  planName: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  planTrial: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  price: {
    color: Colors.text,
    fontSize: 48,
    fontWeight: '900',
  },
  timeline: {
    padding: Spacing.three,
    borderRadius: Radius.large,
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
    backgroundColor: Colors.accent,
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
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  fineprint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
}));
