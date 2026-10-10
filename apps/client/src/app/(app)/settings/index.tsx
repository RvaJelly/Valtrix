import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { APPEARANCE, DeleteAccount, LENGTHS, SettingsPage, UNITS, useMyTrainers } from '@/components/settings-parts';
import {
  Group,
  IconTile,
  ListRow,
  Notice,
  Section,
  SkeletonRows,
  StatusPill,
  Text,
  type IconName,
} from '@/components/ui';
import { ACCENTS, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { leadLabel } from '@/lib/reminders';
import { useSettings } from '@/lib/settings';
import { trainerTitle } from '@/lib/trainers';

// Settings: a short list of rows that open their own pages. The trainer rows open a page with
// Leave; Delete account sits at the very bottom.
export default function Settings() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { settings } = useSettings();
  const { trainers, failed } = useMyTrainers();
  const name = profile?.full_name || 'Your profile';
  const email = session?.user.email ?? '';

  const rows: { icon: IconName; title: string; subtitle: string; href: Href }[] = [
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
      icon: 'contrast-outline',
      title: 'Appearance',
      subtitle: `${APPEARANCE[settings.appearance]} · ${ACCENTS[settings.accent].label}`,
      href: '/settings/appearance',
    },
    {
      icon: 'hand-left-outline',
      title: 'Privacy and blocked people',
      subtitle: 'Who sees what you share',
      href: '/settings/privacy',
    },
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
      {!profile ? <ProfileRetry onRetry={refreshProfile} /> : null}

      <Group>
        <ListRow
          title={name}
          subtitle={email}
          leading={<Avatar url={profile?.avatar_url ?? null} name={profile?.full_name ?? null} size={56} />}
          accessibilityLabel={`Profile: ${name}`}
          onPress={() => router.push('/settings/profile')}
          last
        />
      </Group>

      <Section title="My trainers">
        {trainers ? (
          trainers.length ? (
            <Group>
              {trainers.map((t, i) => {
                const title = trainerTitle(t);
                const archived = t.client_status === 'archived';
                return (
                  <ListRow
                    key={t.trainer_id}
                    title={title}
                    subtitle={archived ? 'Archived you for now' : (t.business_name ?? undefined)}
                    leading={<Avatar url={t.trainer_avatar} name={title} size={40} />}
                    status={archived ? <StatusPill tone="neutral" label="Archived" /> : null}
                    accessibilityLabel={archived ? `${title}, archived you for now` : title}
                    onPress={() => router.push({ pathname: '/settings/trainer/[id]', params: { id: t.trainer_id } })}
                    last={i === trainers.length - 1}
                  />
                );
              })}
            </Group>
          ) : (
            <Group>
              <ListRow
                title="No trainer yet"
                subtitle={
                  <Text variant="footnote" tone="secondary">
                    You haven&apos;t joined a trainer. When a trainer invites you, the invite shows on Home.
                  </Text>
                }
                leading={<IconTile icon="person-add-outline" />}
                last
              />
            </Group>
          )
        ) : failed ? (
          <Notice tone="danger">Your trainers could not be loaded. Check your connection.</Notice>
        ) : (
          <SkeletonRows count={1} avatar />
        )}
      </Section>

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
        {/* Only a known client account can be deleted here; a trainer's would take their clients and calendar with it. */}
        {profile?.role === 'client' ? <DeleteAccount userId={session?.user.id} onDeleted={signOut} /> : null}
        {profile?.role === 'trainer' ? (
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            Signed in with your Voltrix Coach account. To delete it, use Voltrix Coach.
          </Text>
        ) : null}
      </View>
    </SettingsPage>
  );
}

function ProfileRetry({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    await onRetry();
    setBusy(false);
  }
  return (
    <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: busy }}>
      Your account details could not be loaded. Check your connection.
    </Notice>
  );
}
