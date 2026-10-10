import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Logo } from '@/components/logo';
import { StickyFooter } from '@/components/sticky-footer';
import { Button, Card, Divider, StatusPill, Text, type IconName } from '@/components/ui';
import { Colors, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { PRICE_LABEL, TRIAL_DAYS } from '@/lib/access';
import { dayMonth } from '@/lib/format';

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'people-outline', text: 'Unlimited clients, goals and notes' },
  { icon: 'barbell-outline', text: 'Workouts, programs and a ready-made exercise library' },
  { icon: 'calendar-clear-outline', text: 'Bookings and a calendar that fills itself' },
  { icon: 'chatbubbles-outline', text: 'Chat and video calls with your clients' },
];

type Props = {
  // 'start' before or during the free trial, 'ended' once it has run out.
  mode: 'start' | 'ended';
  // The trainer's name, for the headline.
  name?: string | null;
  // When the running trial ends, so the first charge shows the right day.
  trialEndsAt?: Date;
  // The full-screen version (no header above it) shows the logo, the step and Sign out.
  standalone?: boolean;
  onSignOut?: () => void;
};

// Trainers add a card here before they get into the app. Nothing is charged for the first TRIAL_DAYS (14) days;
// after that the monthly plan starts on its own.
export function SubscribeView({ mode, name, trialEndsAt, standalone, onSignOut }: Props) {
  const [notice, setNotice] = useState(false);
  const starting = mode === 'start';
  const [chargeDate] = useState(() =>
    dayMonth(trialEndsAt ?? new Date(new Date().getTime() + TRIAL_DAYS * 86_400_000)),
  );
  const first = name?.trim().split(/\s+/)[0];
  const headline = starting
    ? first
      ? `Build your business, ${first}`
      : 'Build your business'
    : `Welcome back, ${first || 'coach'}`;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, standalone && { paddingTop: Spacing.five }]}>
        {standalone ? <Logo style={styles.logo} /> : null}

        <View style={styles.intro}>
          {standalone && starting && !trialEndsAt ? (
            <Text variant="label" tone="secondary">
              Step 2 of 2
            </Text>
          ) : null}
          {starting ? (
            <StatusPill tone="success" label={trialEndsAt ? `Free until ${chargeDate}` : `${TRIAL_DAYS} days free`} />
          ) : null}
          <Text variant="largeTitle" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {headline}
          </Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
            {starting ? 'Win clients, keep them and get paid.' : 'Your trial has ended. Everything is saved.'}
          </Text>
        </View>

        {/* The membership card: the one raised block on the page, no orange border. */}
        <Card hero style={styles.card}>
          <View style={styles.cardTop}>
            <Text variant="title" style={{ flex: 1 }}>
              Voltrix Coach
            </Text>
            {starting ? (
              <Text variant="footnote" tone="secondary">
                {TRIAL_DAYS}-day free trial
              </Text>
            ) : null}
          </View>
          <View style={styles.price}>
            <Text variant="stat" style={Tabular}>
              {PRICE_LABEL}
            </Text>
            <Text variant="callout" tone="secondary">
              / month
            </Text>
          </View>
          <Divider style={{ marginVertical: Spacing.one }} />
          <View style={{ gap: Spacing.tight }}>
            {BENEFITS.map((b) => (
              <View key={b.text} style={styles.benefit}>
                <Ionicons name={b.icon} size={20} color={Colors.textSecondary} />
                <Text variant="callout" style={{ flex: 1 }}>
                  {b.text}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {starting ? (
          <View style={styles.timeline} accessibilityRole="list">
            <Step icon="lock-open-outline" title="Today" text="Full access to everything. Nothing to pay today." />
            <Step icon="notifications-outline" title="Any time" text="Cancel in a few taps if it isn’t for you." />
            <Step icon="card-outline" title={chargeDate} text={`Your plan starts at ${PRICE_LABEL} a month.`} last />
          </View>
        ) : null}

        {standalone && onSignOut ? <Button title="Sign out" variant="ghost" onPress={onSignOut} /> : null}
      </ScrollView>

      <StickyFooter>
        {notice ? (
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            Card payments are being connected. You’ll be able to start here very soon.
          </Text>
        ) : null}
        {/* Card payments are not connected yet; the provider is still being chosen. */}
        <Button title={starting ? 'Start my free trial' : 'Subscribe now'} onPress={() => setNotice(true)} />
        <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          {starting
            ? `No charge until ${chargeDate}, then ${PRICE_LABEL} a month until you cancel.`
            : `${PRICE_LABEL} a month until you cancel.`}
        </Text>
      </StickyFooter>
    </View>
  );
}

function Step({ icon, title, text, last }: { icon: IconName; title: string; text: string; last?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={{ alignItems: 'center' }}>
        <View style={styles.stepIcon}>
          <Ionicons name={icon} size={16} color={Colors.textSecondary} />
        </View>
        {last ? null : <View style={styles.stepLine} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : Spacing.three }}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="footnote" tone="secondary">
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.section,
    gap: Spacing.section,
  },
  logo: {
    width: 148,
    alignSelf: 'center',
  },
  intro: {
    alignItems: 'center',
    gap: Spacing.tight,
  },
  card: {
    gap: Spacing.tight,
    borderRadius: Radius.xl,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  price: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 28,
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
}));
