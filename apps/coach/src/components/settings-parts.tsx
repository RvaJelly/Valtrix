import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Section,
  Segmented,
  SkeletonRows,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { ACCENTS, Colors, Layout, Spacing, themed, type AccentName } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth, type Profile } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { removeMyChatPhotos } from '@/lib/chat';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { removeAllMyFiles } from '@/lib/files';
import { haptic } from '@/lib/haptics';
import { askPermission } from '@/lib/notify';
import { loadBlocked, unblockPerson, type Blocked } from '@/lib/posts';
import { leadLabel, REMINDER_OPTIONS } from '@/lib/reminders';
import { useSettings, type Settings as SettingsValues } from '@/lib/settings';
import { supabase } from '@/lib/supabase';

export const APPEARANCE: Record<SettingsValues['appearance'], string> = {
  dark: 'Navy',
  light: 'Light',
  system: 'Auto',
};

// Whole words, so the choice fits at large text sizes; the numbers themselves show the short units.
export const UNITS: Record<SettingsValues['units'], string> = {
  kg: 'Kilograms',
  lb: 'Pounds',
};

export const LENGTHS: Record<SettingsValues['lengths'], string> = {
  cm: 'Centimetres',
  in: 'Inches',
};

function options<T extends string>(record: Record<T, string>) {
  return (Object.keys(record) as T[]).map((value) => ({ value, label: record[value] }));
}

// The trainer's plan in one line, as the Subscription row shows it.
export function planLabel(profile: Profile | null) {
  const access = coachAccess(profile);
  switch (access.kind) {
    case 'owner':
      return 'Owner, full access';
    case 'free':
      return 'Free access';
    case 'subscribed':
      return `Voltrix Coach, ${PRICE_LABEL} a month`;
    case 'trial':
      return `Free trial, ${access.daysLeft === 1 ? '1 day' : `${access.daysLeft} days`} left, then ${PRICE_LABEL} a month`;
    default:
      return 'No active plan';
  }
}

// A settings page: one column of groups with room to breathe, pushed up by the keyboard. A footer
// (a sticky Save) sits under the scrolling part.
export function SettingsPage({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

// A choice saves by itself; the toast says it did.
export function useSaved() {
  const { update } = useSettings();
  const toast = useToast();
  return useCallback(
    (patch: Partial<SettingsValues>) => {
      update(patch);
      toast('Saved');
    },
    [toast, update],
  );
}

export function ReminderPicker() {
  const { settings } = useSettings();
  const save = useSaved();
  const [blocked, setBlocked] = useState(false);

  async function choose(key: string | null) {
    const minutes = Number(key ?? 0);
    save({ reminder: minutes });
    setBlocked(minutes > 0 && !(await askPermission()));
  }

  return (
    <Section title="Before each session">
      <Chips options={REMINDER_OPTIONS} value={String(settings.reminder)} onChange={choose} wrap />
      <Text variant="footnote" tone="secondary">
        {settings.reminder
          ? `A notification ${leadLabel(settings.reminder)} before every booked session.`
          : 'Session reminders are off.'}
        {Platform.OS === 'web' && settings.reminder ? ' On a computer, only while Voltrix Coach is open.' : ''}
      </Text>
      {blocked ? (
        <ErrorText>
          {Platform.OS === 'web'
            ? 'Notifications are blocked in this browser. Allow them for this site, then pick a time again.'
            : 'Notifications are off for Voltrix Coach. Turn them on in your phone settings, then pick a time again.'}
        </ErrorText>
      ) : null}
    </Section>
  );
}

export function UnitPickers() {
  const { settings } = useSettings();
  const save = useSaved();
  return (
    <>
      <Section title="Weights">
        <Segmented options={options(UNITS)} value={settings.units} onChange={(units) => save({ units })} />
        <Text variant="footnote" tone="secondary">
          Weights you already wrote keep their unit.
        </Text>
      </Section>
      <Section title="Body measurements">
        <Segmented options={options(LENGTHS)} value={settings.lengths} onChange={(lengths) => save({ lengths })} />
        <Text variant="footnote" tone="secondary">
          Your clients’ progress shows in these units.
        </Text>
      </Section>
    </>
  );
}

export function AppearancePickers() {
  const { settings } = useSettings();
  const save = useSaved();
  return (
    <>
      <Section title="Theme">
        <Segmented
          options={options(APPEARANCE)}
          value={settings.appearance}
          onChange={(appearance) => save({ appearance })}
        />
        <Text variant="footnote" tone="secondary">
          Auto follows your phone.
        </Text>
      </Section>
      <Section title="Colour">
        <View style={styles.swatches}>
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
            const selected = settings.accent === name;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityLabel={ACCENTS[name].label}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (selected) return;
                  haptic.select();
                  save({ accent: name });
                }}
                style={[styles.swatchRing, selected && { borderColor: Colors.text }]}>
                <View style={[styles.swatch, { backgroundColor: ACCENTS[name].color }]}>
                  {selected ? <Ionicons name="checkmark" size={20} color={ACCENTS[name].on} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text variant="footnote" tone="secondary">
          {ACCENTS[settings.accent].label}, for the main button on each screen.
        </Text>
      </Section>
    </>
  );
}

export function BlockedList() {
  const [blocked, setBlocked] = useState<Blocked[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadBlocked()
      .then(setBlocked)
      .catch(() => setBlocked([]));
  }, []);

  async function unblock(person: Blocked) {
    setError(null);
    setBusy(person.blocked_id);
    try {
      await unblockPerson(person.blocked_id);
      setBlocked((current) => current?.filter((b) => b.blocked_id !== person.blocked_id) ?? null);
      toast(`${person.name || 'Voltrix member'} unblocked`);
    } catch (e) {
      setError(plainError(e, 'Could not unblock. Try again.'));
    }
    setBusy(null);
  }

  if (!blocked) return <SkeletonRows count={1} avatar />;
  return (
    <View style={{ gap: Spacing.two }}>
      {blocked.length ? (
        <Group>
          {blocked.map((person, i) => {
            const name = person.name || 'Voltrix member';
            return (
              <ListRow
                key={person.blocked_id}
                title={name}
                leading={<Avatar url={person.avatar_url} name={person.name} size={40} />}
                trailing={
                  <Button
                    title="Unblock"
                    variant="secondary"
                    size="small"
                    accessibilityLabel={`Unblock ${name}`}
                    loading={busy === person.blocked_id}
                    onPress={() => unblock(person)}
                  />
                }
                last={i === blocked.length - 1}
              />
            );
          })}
        </Group>
      ) : (
        <EmptyState
          compact
          icon="hand-left-outline"
          title="No one blocked"
          message="They can’t see your stories or reels."
        />
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

// "Unlock with Face ID": a row with a switch, when the phone has one.
export function BiometricRow() {
  const { settings } = useSettings();
  const save = useSaved();
  const { setLocked } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    biometricName().then(setName);
  }, []);

  if (!name) return null;

  async function toggle(on: boolean) {
    setError(null);
    if (on && !(await confirmIdentity(`Turn on ${name} for Voltrix Coach`))) {
      return setError(`${name} didn't work, so it is still off.`);
    }
    setLocked(false);
    save({ biometric: on });
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <Group>
        <ListRow
          title={`Unlock with ${name}`}
          subtitle="Asked each time the app opens"
          leading={<IconTile icon="lock-closed-outline" />}
          trailing={
            <Toggle accessibilityLabel={`Unlock with ${name}`} value={settings.biometric} onValueChange={toggle} />
          }
          last
        />
      </Group>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(plainError(error));
    setPassword('');
    toast('Password changed');
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <TextField
        password
        label="New password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={save}
        error={error ?? undefined}
      />
      <Button title="Change password" variant="secondary" onPress={save} loading={busy} disabled={!password} />
    </View>
  );
}

export function DeleteAccount({ userId, onDeleted }: { userId?: string; onDeleted: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const sure = await confirm(
      'Delete your account?',
      'This permanently deletes your account, your clients, calendar, workouts and exercises, your chats and the photos you sent, and your stories, reels and photos. It cannot be undone.',
      'Delete account',
    );
    if (!sure) return;
    setError(null);
    setBusy(true);
    await removeMyChatPhotos().catch(() => {});
    if (userId) await removeAllMyFiles(userId).catch(() => {});
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) return setError(plainError(error));
    await onDeleted();
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <ErrorText>{error}</ErrorText>
      <Group>
        <ListRow
          title={busy ? 'Deleting…' : 'Delete account'}
          titleTone="danger"
          leading={<IconTile icon="trash-outline" color={Colors.danger} />}
          chevron={false}
          onPress={busy ? undefined : remove}
          last
        />
      </Group>
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.tight,
  },
  swatchRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
