import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { ACCENTS, Colors, Radius, Spacing, themed, type AccentName } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { useSettings, type Settings as SettingsValues } from '@/lib/settings';
import { askPermission } from '@/lib/notify';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { removeProgressPhotoFiles } from '@/lib/progress';
import { removeMyChatPhotos } from '@/lib/chat';
import { loadBlocked, removeAllMyFiles, unblockPerson, type Blocked } from '@/lib/posts';
import { leadLabel, refreshReminders, REMINDER_OPTIONS } from '@/lib/reminders';
import { serial } from '@/lib/serial';
import { supabase } from '@/lib/supabase';
import { leaveTrainer, loadTrainers, trainerTitle, type Trainer } from '@/lib/trainers';

const APPEARANCE: Record<SettingsValues['appearance'], string> = {
  light: 'White',
  dark: 'Dark',
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

        <Section title="Training">
          <Card style={{ gap: Spacing.three }}>
            <Body secondary style={styles.small}>
              Weight units
            </Body>
            <Segmented options={UNITS} value={settings.units} onChange={(units) => update({ units })} />
            <Body secondary style={styles.small}>
              Body measurements
            </Body>
            <Segmented options={LENGTHS} value={settings.lengths} onChange={(lengths) => update({ lengths })} />
          </Card>
        </Section>

        <Section title="Profile">
          <ProfilePhoto
            userId={session?.user.id}
            name={profile?.full_name ?? null}
            url={profile?.avatar_url ?? null}
            onSaved={refreshProfile}
          />
          <ProfileForm
            key={profile?.id}
            initialName={profile?.full_name ?? ''}
            userId={session?.user.id}
            onSaved={refreshProfile}
          />
        </Section>

        <Section title="My trainers">
          <MyTrainers />
        </Section>

        <Section title="Blocked people">
          <BlockedList />
        </Section>

        <Section title="Account">
          <Card style={{ gap: Spacing.three }}>
            <Row label="Email" value={session?.user.email ?? '–'} />
            <Body secondary style={styles.small}>
              {profile?.role === 'trainer'
                ? 'You stay signed in on this device. Your posts and profile are saved to your account. The settings on this page stay on this phone, so your Voltrix Coach settings are not changed.'
                : 'You stay signed in on this device. Your sessions, training and settings are saved to your account, so signing in on a new phone brings everything back.'}
            </Body>
          </Card>
          <BiometricLock />
          <PasswordForm />
        </Section>

        <Section title="Help">
          <Card style={{ gap: Spacing.three }}>
            <Row label="App version" value={Constants.expoConfig?.version ?? '–'} />
          </Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/rules')}
            style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="people-outline" size={22} color={Colors.accentText} />
            <Text style={[styles.linkLabel, { flex: 1 }]}>Community rules</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </Pressable>
        </Section>

        <Button title="Sign out" variant="secondary" onPress={signOut} />
        {/* Only a known client account can be deleted here; a trainer's would take their clients and calendar with it. */}
        {profile?.role === 'client' ? <DeleteAccount userId={session?.user.id} onDeleted={signOut} /> : null}
        {profile?.role === 'trainer' ? (
          <Body secondary style={[styles.small, { textAlign: 'center' }]}>
            You&apos;re signed in with your Voltrix Coach account. To delete it, use Voltrix Coach.
          </Body>
        ) : null}
        {!profile ? <ProfileRetry onRetry={refreshProfile} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
    <Card style={{ gap: Spacing.three }}>
      <Body secondary style={styles.small}>
        Your account details could not be loaded. Check your connection and try again.
      </Body>
      <Button title="Try again" variant="secondary" onPress={retry} loading={busy} />
    </Card>
  );
}

function ProfilePhoto({
  userId,
  name,
  url,
  onSaved,
}: {
  userId?: string;
  name: string | null;
  url: string | null;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change() {
    if (!userId) return;
    setError(null);
    setBusy(true);
    try {
      const next = await pickProfilePhoto(userId);
      if (next) {
        const { error } = await supabase.from('profiles').update({ avatar_url: next }).eq('id', userId);
        if (error) throw error;
        await removeProfilePhoto(url);
        await onSaved();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The photo could not be saved.');
    }
    setBusy(false);
  }

  async function remove() {
    if (!userId) return;
    setError(null);
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
    if (error) return setError(error.message);
    await removeProfilePhoto(url);
    await onSaved();
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.photoRow}>
        <Avatar url={url} name={name} size={80} />
        <View style={{ flex: 1, gap: Spacing.two }}>
          <Button title={url ? 'Change photo' : 'Add a photo'} variant="secondary" onPress={change} loading={busy} />
          {url ? (
            <Pressable accessibilityRole="button" onPress={remove} hitSlop={8}>
              <Text style={styles.removePhoto}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Body secondary style={styles.small}>
        Your photo shows on your stories and reels.
      </Body>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// The trainers the person accepted, each with Leave. Trainers who archived the person are
// listed too: they see the food diary and chat again if they make the person active.
function MyTrainers() {
  const { refresh } = useChat();
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One load at a time, so a slow older answer can't bring back a trainer the person left.
  const load = useMemo(
    () =>
      serial((current) =>
        loadTrainers(true).then(
          (list) => {
            if (!current()) return;
            setTrainers(list);
            setFailed(false);
          },
          () => {
            // A failure leaves the list to an older load that may still answer.
            if (current(false)) setFailed(true);
          },
        ),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Joined or left on another phone. News sent while the connection was down is missed, so
  // load again when it is back.
  useChatEvents((event) => {
    if (event.type === 'link' || event.type === 'reconnected') load();
  });

  // A trainer who added the person twice is still one trainer, shown as active if either is.
  const list = trainers
    ? [...trainers]
        .sort((a, b) => Number(a.client_status === 'archived') - Number(b.client_status === 'archived'))
        .filter((t, i, all) => all.findIndex((x) => x.trainer_id === t.trainer_id) === i)
    : null;

  async function leave(trainer: Trainer) {
    const name = trainerTitle(trainer);
    const firstName = trainer.trainer_name?.split(' ')[0] || name;
    const sure = await confirm(
      `Leave ${name}?`,
      `${firstName} will no longer see your food diary, workouts, progress (weight, measurements and photos), check-ins, habits, chat or calls, and you won't see the plans and sessions they set for you. ${firstName} keeps their own notes. You can join again if they send you a new invite.`,
      'Leave',
    );
    if (!sure) return;
    setError(null);
    setLeaving(trainer.trainer_id);
    try {
      await leaveTrainer(trainer.client_id);
      // The chat goes from Chats, and reminders for their sessions stop.
      refresh();
      refreshReminders();
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave. Check your connection and try again.');
    }
    setLeaving(null);
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      {failed && !trainers ? (
        <Body secondary style={styles.small}>
          Your trainers could not be loaded. Check your connection.
        </Body>
      ) : null}
      {list && !list.length ? (
        <Body secondary style={styles.small}>
          You haven&apos;t joined a trainer. When a trainer invites you, the invite shows on Home for you to accept.
        </Body>
      ) : null}
      {list?.map((trainer) => (
        <View key={trainer.trainer_id} style={{ gap: Spacing.two }}>
          <View style={styles.blockedRow}>
            <Avatar url={trainer.trainer_avatar} name={trainerTitle(trainer)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel} numberOfLines={1}>
                {trainerTitle(trainer)}
              </Text>
              {trainer.trainer_name && trainer.business_name ? (
                <Body secondary style={styles.small} numberOfLines={1}>
                  {trainer.business_name}
                </Body>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Leave ${trainerTitle(trainer)}`}
              onPress={() => leave(trainer)}
              disabled={!!leaving}
              hitSlop={8}
              style={[styles.unblock, leaving === trainer.trainer_id && { opacity: 0.5 }]}>
              <Text style={[styles.unblockText, { color: Colors.danger }]}>
                {leaving === trainer.trainer_id ? 'Leaving…' : 'Leave'}
              </Text>
            </Pressable>
          </View>
          {trainer.client_status === 'archived' ? (
            <Body secondary style={styles.small}>
              {trainer.trainer_name?.split(' ')[0] || trainerTitle(trainer)} archived you for now, so they don&apos;t
              see your food diary, workouts, progress, check-ins, habits or chat. They will again if they make you
              active. Leave if you don&apos;t want that.
            </Body>
          ) : null}
        </View>
      ))}
      {list?.length ? (
        <Body secondary style={styles.small}>
          Your trainers see your food diary, workouts, progress (including photos), check-ins, habits and your chats
          with them.
        </Body>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Card>
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

function ProfileForm({
  initialName,
  userId,
  onSaved,
}: {
  initialName: string;
  userId?: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = name.trim() !== initialName;

  async function save() {
    if (!userId) return;
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', userId);
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    await onSaved();
  }

  return (
    <Card style={{ gap: Spacing.three }}>
      <TextField label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
      <ErrorText>{error}</ErrorText>
      {saved && !changed ? <Body style={{ color: Colors.accentText }}>Saved</Body> : null}
      <Button title="Save profile" onPress={save} loading={busy} disabled={!changed} />
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
      'This permanently deletes your account, your workouts, progress photos and other progress, habits, stories, reels, photos and the messages you sent. It cannot be undone.',
      'Delete account',
    );
    if (!sure) return;
    setError(null);
    setBusy(true);
    // Progress photos are private files that nothing could find once the account is gone, so
    // they must be removed first.
    try {
      if (userId) await removeProgressPhotoFiles(userId);
    } catch {
      setBusy(false);
      return setError("Your progress photos couldn't be removed. Check your connection and try again.");
    }
    await removeMyChatPhotos().catch(() => {});
    if (userId) await removeAllMyFiles(userId).catch(() => {});
    const { error } = await supabase.rpc('delete_my_client_account');
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
    if (on && !(await confirmIdentity(`Turn on ${name} for Voltrix`))) {
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
        {Platform.OS === 'web' && settings.reminder ? ' On a computer they only show while Voltrix is open.' : ''}
      </Body>
      {blocked ? (
        <ErrorText>
          {Platform.OS === 'web'
            ? 'Notifications are blocked in this browser. Allow them for this site, then pick a time again.'
            : 'Notifications are turned off for Voltrix. Turn them on in your phone settings, then pick a time again.'}
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  removePhoto: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
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
