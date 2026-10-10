import Constants from 'expo-constants';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { APPEARANCE, DeleteAccount, LENGTHS, planLabel, SettingsPage, UNITS } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text, type IconName } from '@/components/ui';
import { ACCENTS, Fonts, Spacing } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { loadRules, modeLabel } from '@/lib/booking-rules';
import { priceLabel } from '@/lib/money';
import { leadLabel } from '@/lib/reminders';
import { callRpc } from '@/lib/rpc';
import { useSettings } from '@/lib/settings';

type Row = { icon: IconName; title: string; subtitle: string; href: Href; testID?: string };

// Settings: a short list of rows that open their own pages, Sign out under them and Delete account at
// the very bottom.
export default function Settings() {
  const { session, profile, signOut } = useAuth();
  const { settings } = useSettings();
  const access = coachAccess(profile);
  const email = session?.user.email ?? '';
  const name = profile?.full_name || profile?.business_name || 'Your profile';
  const business = profile?.full_name && profile.business_name ? profile.business_name : email;
  // Only a trainer on the free trial (or with no plan) has something to sign up for. A paying trainer
  // sees their plan; billing gets its own page once card payments are connected.
  const canSubscribe = access.kind === 'trial' || access.kind === 'none';
  // Online booking's mode and whether the calendar link is on, read each time Settings shows. A
  // failed read leaves the plain subtitle.
  const [bookingMode, setBookingMode] = useState<string | null>(null);
  const [linkOn, setLinkOn] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      loadRules()
        .then((rules) => live && setBookingMode(modeLabel(rules)))
        .catch(() => {});
      callRpc<{ token: string | null } | null>('calendar_link', { p_make: false })
        .then((answer) => live && setLinkOn(!answer.missing && !!answer.data?.token))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  const preferences: Row[] = [
    {
      icon: 'notifications-outline',
      title: 'Notifications',
      subtitle: settings.reminder
        ? `Reminders ${leadLabel(settings.reminder)} before sessions`
        : 'Session reminders off',
      href: '/settings/notifications',
    },
    {
      icon: 'barbell-outline',
      title: 'Workouts and units',
      subtitle: `${UNITS[settings.units]} · ${LENGTHS[settings.lengths]}`,
      href: '/settings/units',
    },
    {
      icon: 'cash-outline',
      title: 'Sessions and prices',
      subtitle:
        profile?.session_price_cents != null
          ? `${priceLabel(profile.session_price_cents, profile.currency)} a session`
          : 'No price set',
      href: '/settings/prices',
      testID: 'settings-prices',
    },
    {
      icon: 'calendar-number-outline',
      title: 'Online booking',
      subtitle: bookingMode ?? 'Clients book your open times',
      href: '/settings/booking',
      testID: 'settings-booking',
    },
    {
      icon: 'link-outline',
      title: 'Calendar link',
      subtitle: linkOn == null ? 'Your sessions in your calendar app' : linkOn ? 'On' : 'Off',
      href: '/settings/calendar',
      testID: 'settings-calendar',
    },
    {
      icon: 'contrast-outline',
      title: 'Appearance',
      subtitle: `${APPEARANCE[settings.appearance]} · ${ACCENTS[settings.accent].label}`,
      href: '/settings/appearance',
    },
    {
      icon: 'hand-left-outline',
      title: 'Privacy and blocked people',
      subtitle: 'Blocked people and what clients see',
      href: '/settings/privacy',
    },
  ];
  const account: Row[] = [
    {
      icon: 'key-outline',
      title: 'Account and password',
      subtitle: email || 'Email and password',
      href: '/settings/account',
    },
    {
      icon: 'help-circle-outline',
      title: 'Help',
      subtitle: 'Privacy, rules and app version',
      href: '/settings/help',
    },
  ];

  return (
    <SettingsPage>
      <Group>
        <ListRow
          title={name}
          subtitle={business || undefined}
          leading={<Avatar url={profile?.avatar_url ?? null} name={name} size={56} />}
          accessibilityLabel={`Profile: ${name}`}
          onPress={() => router.push('/settings/profile')}
          last
        />
      </Group>

      <Rows rows={preferences} />

      <Group>
        <ListRow
          title="Subscription"
          // The plan may take two lines: the trial's end and the price both matter.
          subtitle={
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {planLabel(profile)}
            </Text>
          }
          leading={<IconTile icon="card-outline" />}
          trailing={
            canSubscribe ? (
              <Text variant="callout" style={{ fontFamily: Fonts.textSemi }}>
                Subscribe
              </Text>
            ) : null
          }
          accessibilityLabel={canSubscribe ? `Subscription: ${planLabel(profile)}. Subscribe` : undefined}
          onPress={canSubscribe ? () => router.push('/subscribe') : undefined}
          last={!profile?.is_admin}
        />
        {profile?.is_admin ? (
          <ListRow
            title="All trainers"
            subtitle="See every trainer and give free access"
            leading={<IconTile icon="shield-checkmark-outline" />}
            onPress={() => router.push('/admin')}
            last
          />
        ) : null}
      </Group>

      <Rows rows={account} />

      <Group>
        <ListRow
          title="Sign out"
          leading={<IconTile icon="log-out-outline" />}
          chevron={false}
          onPress={signOut}
          last
        />
      </Group>

      <View style={{ gap: Spacing.three }}>
        <DeleteAccount userId={session?.user.id} onDeleted={signOut} />
        <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
          Voltrix Coach {Constants.expoConfig?.version ?? ''}
        </Text>
      </View>
    </SettingsPage>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <Group>
      {rows.map((row, i) => (
        <ListRow
          key={row.title}
          title={row.title}
          subtitle={row.subtitle}
          leading={<IconTile icon={row.icon} />}
          onPress={() => router.push(row.href)}
          testID={row.testID}
          last={i === rows.length - 1}
        />
      ))}
    </Group>
  );
}
