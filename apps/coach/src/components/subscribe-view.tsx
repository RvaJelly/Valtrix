import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DeleteAccountLink } from '@/components/delete-account';
import { Logo } from '@/components/logo';
import { StickyFooter } from '@/components/sticky-footer';
import { Button, Card, Divider, ErrorText, Notice, StatusPill, Text, type IconName } from '@/components/ui';
import { Colors, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { PRICE_LABEL, startTrial, trialLeft, TRIAL_DAYS } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { NOT_YET } from '@/lib/rpc';

const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'people-outline', text: 'Unlimited clients, goals and notes' },
  { icon: 'barbell-outline', text: 'Workouts, programs and a ready-made exercise library' },
  { icon: 'calendar-clear-outline', text: 'Bookings and a calendar that fills itself' },
  { icon: 'chatbubbles-outline', text: 'Chat and video calls with your clients' },
];

type Props = {
  // 'start' before the free trial, 'trial' while it runs, 'ended' once it has run out.
  mode: 'start' | 'trial' | 'ended';
  // Whole days left after today in a running trial (0 on its last day).
  daysLeft?: number;
  // The trainer's name, for the headline.
  name?: string | null;
  // When the running trial ends.
  trialEndsAt?: Date;
  // The full-screen version (no header above it) shows the logo, the step, Sign out and Delete account.
  standalone?: boolean;
  onSignOut?: () => void;
};

// The plan, and how to start. Card payments aren't connected yet, so for now the free trial starts without a
// card (TRIAL_DAYS, 14 days), and a trainer whose trial has ended keeps going free for another 14 days: nobody
// is locked out while there is no way to pay. Nothing on this page charges anything.
export function SubscribeView({ mode, daysLeft, name, trialEndsAt, standalone, onSignOut }: Props) {
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starting = mode === 'start';
  const inTrial = mode === 'trial';
  const ended = mode === 'ended';
  const [endDate] = useState(() => dayMonth(trialEndsAt ?? new Date(new Date().getTime() + TRIAL_DAYS * 86_400_000)));
  const first = name?.trim().split(/\s+/)[0];
  const headline = starting
    ? first
      ? `Build your business, ${first}`
      : 'Build your business'
    : inTrial
      ? (daysLeft ?? TRIAL_DAYS) <= 0
        ? 'Last day of your trial'
        : `${trialLeft(daysLeft ?? TRIAL_DAYS)} in your trial`
      : `Welcome back, ${first || 'coach'}`;
  const intro = starting
    ? 'Win clients, keep them and get paid.'
    : inTrial
      ? `Your free trial runs until ${endDate}.`
      : 'Your trial has ended. Everything is saved.';

  // Starts the trial (or 14 more days); the root layout then opens the app.
  async function start() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!(await startTrial())) throw new Error(NOT_YET);
      await refreshProfile();
    } catch (e) {
      setError(plainError(e));
    }
    setBusy(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, standalone && { paddingTop: Spacing.five }]}>
        {standalone ? <Logo style={styles.logo} /> : null}

        <View style={styles.intro}>
          {standalone && starting ? (
            <Text variant="label" tone="secondary">
              Step 2 of 2
            </Text>
          ) : null}
          {starting ? <StatusPill tone="success" label={`${TRIAL_DAYS} days free`} /> : null}
          {inTrial ? <StatusPill tone="success" label={`Free until ${endDate}`} /> : null}
          <Text variant="largeTitle" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {headline}
          </Text>
          <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
            {intro}
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
            <Step icon="lock-open-outline" title="Today" text="Full access to everything. No card needed." />
            <Step
              icon="card-outline"
              title={endDate}
              text={`Your free trial ends. Stay on for ${PRICE_LABEL} a month once card payments open.`}
              last
            />
          </View>
        ) : null}
        {inTrial || ended ? (
          <Notice>
            {inTrial
              ? `Card payments open soon. Until then there’s nothing to pay, and you can keep going free when your trial ends.`
              : `Card payments open soon. Until then, keep using Voltrix Coach free.`}
          </Notice>
        ) : null}

        {standalone && onSignOut ? (
          <View style={{ gap: Spacing.two }}>
            <Button title="Sign out" variant="ghost" onPress={onSignOut} />
            <DeleteAccountLink />
          </View>
        ) : null}
      </ScrollView>

      {inTrial ? null : (
        <StickyFooter>
          <ErrorText>{error}</ErrorText>
          <Button
            title={starting ? 'Start my free trial' : 'Keep going free'}
            onPress={start}
            loading={busy}
            testID="start-trial"
          />
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            {starting ? `No card needed. Free until ${endDate}.` : `${TRIAL_DAYS} more days, free. No card needed.`}
          </Text>
        </StickyFooter>
      )}
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
