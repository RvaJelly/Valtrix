import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { APPEARANCE, DeleteAccount, LENGTHS, planLabel, SettingsPage, UNITS } from '@/components/settings-parts';
import { Group, IconTile, ListRow, Text, type IconName } from '@/components/ui';
import { ACCENTS, Fonts, Spacing } from '@/constants/theme';
import { coachAccess } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { leadLabel } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';

type Row = { icon: IconName; title: string; subtitle: string; href: Href };

// Settings: a short list of rows that open their own pages, Sign out under them and Delete account at
// the very bottom.
export default function Settings() {
  const { session, profile, signOut } = useAuth();
  const { settings } = useSettings();
  const access = coachAccess(profile);
  const email = session?.user.email ?? '';
  const name = profile?.full_name || profile?.business_name || 'Your profile';
  const business = profile?.full_name && profile.business_name ? profile.business_name : email;
  // Owners and free trainers have nothing to manage; anyone else opens the plan.
  const manage =
    access.kind === 'none' ? 'Subscribe' : access.kind === 'owner' || access.kind === 'free' ? null : 'Manage';

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
      subtitle: `${UNITS[settings.units].split(' ')[0]} · ${LENGTHS[settings.lengths].split(' ')[0]}`,
      href: '/settings/units',
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
      subtitle: 'Who can see your stories and reels',
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
    { icon: 'help-circle-outline', title: 'Help', subtitle: 'Community rules and app version', href: '/settings/help' },
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
            manage ? (
              <Text variant="callout" style={{ fontFamily: Fonts.textSemi }}>
                {manage}
              </Text>
            ) : null
          }
          accessibilityLabel={manage ? `Subscription: ${planLabel(profile)}. ${manage}` : undefined}
          onPress={manage ? () => router.push('/subscribe') : undefined}
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
          last={i === rows.length - 1}
        />
      ))}
    </Group>
  );
}
