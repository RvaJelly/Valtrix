import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { ProfileEditor } from '@/components/profile-editor';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { ACCENTS, Colors, Radius, Spacing, themed, type AccentName } from '@/constants/theme';
import { coachAccess, PRICE_LABEL } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { confirm } from '@/lib/confirm';
import { useSettings, type Settings as SettingsValues } from '@/lib/settings';
import { askPermission } from '@/lib/notify';
import { leadLabel, REMINDER_OPTIONS } from '@/lib/reminders';
import { removeMyChatPhotos } from '@/lib/chat';
import { removeAllMyFiles } from '@/lib/files';
import { loadBlocked, unblockPerson, type Blocked } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

const APPEARANCE: Record<SettingsValues['appearance'], string> = {
  dark: 'Dark blue',
  light: 'Light',
  system: 'Auto',
};

const UNITS: Record<SettingsValues['units'], string> = {
  kg: 'Kilograms (kg)',
  lb: 'Pounds (lb)',
};

const LENGTHS: Record<SettingsValues['lengths'], string> = {
  cm: 'Centimetres (cm)',
  in: 'Inches (in)',
};

export default function Settings() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { settings, update } = useSettings();
  const access = coachAccess(profile);
  const plan =
    access.kind === 'owner'
      ? 'Owner, full access'
      : access.kind === 'free'
        ? 'Free access'
        : access.kind === 'subscribed'
          ? `Voltrix Coach, ${PRICE_LABEL} / month`
          : access.kind === 'trial'
            ? `Free trial, ${access.daysLeft === 1 ? '1 day' : `${access.daysLeft} days`} left, then ${PRICE_LABEL} / month`
            : 'No active plan';
  const canSubscribe = access.kind === 'none';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Theme">
          <Card style={{ gap: Spacing.three }}>
            <Body secondary style={styles.small}>
              Appearance
            </Body>
            <Segmented
              options={APPEARANCE}
              value={settings.appearance}
              onChange={(appearance) => update({ appearance })}
            />
            <Body secondary style={styles.small}>
              Colour
            </Body>
            <View style={styles.swatches}>
              {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
                const selected = settings.accent === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={ACCENTS[name].label}
                    accessibilityState={{ selected }}
                    onPress={() => update({ accent: name })}
                    style={[
                      styles.swatch,
                      { backgroundColor: ACCENTS[name].color },
                      selected && styles.swatchSelected,
                    ]}>
                    {selected ? <Ionicons name="checkmark" size={22} color={ACCENTS[name].on} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Body secondary style={styles.small}>
              {ACCENTS[settings.accent].label}
            </Body>
          </Card>
        </Section>

        <Section title="Reminders">
          <ReminderPicker />
        </Section>

        <Section title="Workouts">
          <Card style={{ gap: Spacing.three }}>
            <Body secondary style={styles.small}>
              Weight units
            </Body>
            <Segmented options={UNITS} value={settings.units} onChange={(units) => update({ units })} />
            <Body secondary style={styles.small}>
              For new weights. Weights you already wrote keep their unit.
            </Body>
            <Body secondary style={styles.small}>
              Body measurements
            </Body>
            <Segmented options={LENGTHS} value={settings.lengths} onChange={(lengths) => update({ lengths })} />
            <Body secondary style={styles.small}>
              Your clients’ workouts, weight and measurements show in these units.
            </Body>
          </Card>
        </Section>

        <Section title="Profile">
          {profile ? <ProfileEditor key={profile.id} profile={profile} onSaved={refreshProfile} /> : null}
        </Section>

        <Section title="Blocked people">
          <BlockedList />
        </Section>

        <Section title="Subscription">
          <Card style={{ gap: Spacing.three }}>
            <Row label="Plan" value={plan} />
            {canSubscribe ? <Button title="Subscribe" onPress={() => router.push('/subscribe')} /> : null}
          </Card>
        </Section>

        {profile?.is_admin ? (
          <Section title="Owner">
            <LinkRow
              icon="shield-checkmark"
              label="All trainers"
              detail="See every trainer and give free access"
              onPress={() => router.push('/admin')}
            />
          </Section>
        ) : null}

        <Section title="Account">
          <Card style={{ gap: Spacing.three }}>
            <Row label="Email" value={session?.user.email ?? '–'} />
            <Body secondary style={styles.small}>
              You stay signed in on this device. Your clients, sessions, workouts and settings are saved to your
              account, so signing in on a new phone brings everything back.
            </Body>
          </Card>
          <BiometricLock />
          <PasswordForm />
        </Section>

        <Section title="Help">
          <Card style={{ gap: Spacing.three }}>
            <Row label="App version" value={Constants.expoConfig?.version ?? '–'} />
          </Card>
          <LinkRow
            icon="people-outline"
            label="Community rules"
            detail="What's allowed in stories and reels"
            onPress={() => router.push('/rules')}
          />
        </Section>

        <Button title="Sign out" variant="secondary" onPress={signOut} />
        <DeleteAccount userId={session?.user.id} onDeleted={signOut} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BlockedList() {
  const [blocked, setBlocked] = useState<Blocked[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBlocked()
      .then(setBlocked)
      .catch(() => setBlocked([]));
  }, []);

  async function unblock(person: Blocked) {
    setError(null);
    try {
      await unblockPerson(person.blocked_id);
      setBlocked((current) => current?.filter((b) => b.blocked_id !== person.blocked_id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unblock. Try again.');
    }
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      {blocked && !blocked.length ? (
        <Body secondary style={styles.small}>
          You haven&apos;t blocked anyone. People you block can&apos;t see your stories and reels, and you won&apos;t
          see theirs.
        </Body>
      ) : null}
      {blocked?.map((person) => (
        <View key={person.blocked_id} style={styles.blockedRow}>
          <Avatar url={person.avatar_url} name={person.name} size={40} />
          <Text style={[styles.linkLabel, { flex: 1 }]} numberOfLines={1}>
            {person.name || 'Voltrix member'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${person.name || 'Voltrix member'}`}
            onPress={() => unblock(person)}
            hitSlop={8}
            style={styles.unblock}>
            <Text style={styles.unblockText}>Unblock</Text>
          </Pressable>
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function PasswordForm() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setPassword('');
    setSaved(true);
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        onSubmitEditing={save}
      />
      <ErrorText>{error}</ErrorText>
      {saved ? <Body style={{ color: Colors.accentText }}>Password changed</Body> : null}
      <Button title="Change password" variant="secondary" onPress={save} loading={busy} disabled={!password} />
    </Card>
  );
}

function DeleteAccount({ userId, onDeleted }: { userId?: string; onDeleted: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const sure = await confirm(
      'Delete your account?',
      'This permanently deletes your account, your clients, calendar, workouts and exercises, your chats and the photos you sent, and your stories, reels and photos. It cannot be undone.',
      'Delete account',
    );
    if (!sure) return;
    setBusy(true);
    await removeMyChatPhotos().catch(() => {});
    if (userId) await removeAllMyFiles(userId).catch(() => {});
    const { error } = await supabase.rpc('delete_my_account');
    setBusy(false);
    if (error) return setError(error.message);
    await onDeleted();
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <ErrorText>{error}</ErrorText>
      <Pressable accessibilityRole="button" onPress={remove} disabled={busy} style={styles.delete}>
        <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete account'}</Text>
      </Pressable>
    </View>
  );
}

function BiometricLock() {
  const { settings, update } = useSettings();
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
    update({ biometric: on });
  }

  return (
    <Card style={{ gap: Spacing.two }}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Unlock with {name}</Text>
        <Switch
          accessibilityLabel={`Unlock with ${name}`}
          value={settings.biometric}
          onValueChange={toggle}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.text}
        />
      </View>
      <Body secondary style={styles.small}>
        Ask for {name} each time the app opens, so nobody else can get in on this phone.
      </Body>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function ReminderPicker() {
  const { settings, update } = useSettings();
  const [blocked, setBlocked] = useState(false);

  async function choose(key: string | null) {
    const minutes = Number(key ?? 0);
    update({ reminder: minutes });
    setBlocked(minutes > 0 && !(await askPermission()));
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      <Body secondary style={styles.small}>
        Remind me before each session
      </Body>
      <Chips options={REMINDER_OPTIONS} value={String(settings.reminder)} onChange={choose} wrap />
      <Body secondary style={styles.small}>
        {settings.reminder
          ? `You'll get a notification ${leadLabel(settings.reminder)} before every booked session.`
          : 'Session reminders are off.'}
        {Platform.OS === 'web' && settings.reminder ? ' On a computer they only show while Voltrix Coach is open.' : ''}
      </Body>
      {blocked ? (
        <ErrorText>
          {Platform.OS === 'web'
            ? 'Notifications are blocked in this browser. Allow them for this site, then pick a time again.'
            : 'Notifications are turned off for Voltrix Coach. Turn them on in your phone settings, then pick a time again.'}
        </ErrorText>
      ) : null}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.section}>{title}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {(Object.keys(options) as T[]).map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(key)}
            style={[styles.segment, selected && { backgroundColor: Colors.accent }]}>
            <Text style={[styles.segmentText, selected && { color: Colors.onAccent }]} numberOfLines={1}>
              {options[key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: Spacing.one }}>
      <Body secondary style={styles.small}>
        {label}
      </Body>
      <Body>{value}</Body>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={22} color={Colors.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Body secondary style={styles.small}>
          {detail}
        </Body>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = themed(() => ({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  small: {
    fontSize: 14,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.text,
  },
  segmented: {
    flexDirection: 'row',
    padding: Spacing.one,
    gap: Spacing.one,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surfaceRaised,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  segmentText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  linkLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  unblock: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unblockText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  delete: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
}));
