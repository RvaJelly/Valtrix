import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
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
import { useAuth } from '@/lib/auth';
import { biometricName, confirmIdentity } from '@/lib/biometrics';
import { removeMyChatPhotos } from '@/lib/chat';
import { useChatEvents } from '@/lib/chat-live';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { askPermission } from '@/lib/notify';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { loadBlocked, removeAllMyFiles, unblockPerson, type Blocked } from '@/lib/posts';
import { removeProgressPhotoFiles } from '@/lib/progress';
import { leadLabel, REMINDER_OPTIONS } from '@/lib/reminders';
import { serial } from '@/lib/serial';
import { useSettings, type Settings as SettingsValues } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { loadTrainers, type Trainer } from '@/lib/trainers';

export const APPEARANCE: Record<SettingsValues['appearance'], string> = {
  light: 'Light',
  dark: 'Dark',
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

// A settings page: one column of groups, room to breathe, the keyboard pushing it up.
export function SettingsPage({ children }: PropsWithChildren) {
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A change saves by itself; the toast says it did.
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

// The trainers the person accepted. Trainers who archived the person are listed too: they see the
// food diary and chat again if they make the person active, so the person can leave them.
export function useMyTrainers() {
  const [trainers, setTrainers] = useState<Trainer[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  // Loaded each time the page shows, so a trainer left on their own page is gone on coming back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
  return { trainers: list, failed, reload: load };
}

export function ProfilePhoto({
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
  const [busy, setBusy] = useState<'change' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function change() {
    if (!userId) return;
    setError(null);
    setBusy('change');
    try {
      const next = await pickProfilePhoto(userId);
      if (next) {
        const { error } = await supabase.from('profiles').update({ avatar_url: next }).eq('id', userId);
        if (error) throw error;
        await removeProfilePhoto(url);
        await onSaved();
        toast('Photo saved');
      }
    } catch (e) {
      setError(plainError(e, 'The photo could not be saved.'));
    }
    setBusy(null);
  }

  async function remove() {
    if (!userId) return;
    setError(null);
    setBusy('remove');
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
    if (error) {
      setBusy(null);
      return setError(plainError(error));
    }
    await removeProfilePhoto(url);
    await onSaved();
    setBusy(null);
    toast('Photo removed');
  }

  return (
    <View style={styles.photo}>
      <Avatar url={url} name={name} size={96} />
      <View style={styles.photoButtons}>
        <Button
          title={url ? 'Change photo' : 'Add a photo'}
          variant="secondary"
          size="medium"
          onPress={change}
          loading={busy === 'change'}
        />
        {url ? (
          <Button title="Remove" variant="ghost" size="medium" onPress={remove} loading={busy === 'remove'} />
        ) : null}
      </View>
      <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
        Your photo shows on your stories and reels.
      </Text>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

export function ProfileForm({
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
  const toast = useToast();
  const changed = name.trim() !== initialName;

  async function save() {
    if (!userId || !changed) return;
    setError(null);
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', userId);
    setBusy(false);
    if (error) return setError(plainError(error));
    toast('Profile saved');
    await onSaved();
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <TextField
        label="Your name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={save}
        error={error ?? undefined}
      />
      <Button title="Save name" variant="secondary" onPress={save} loading={busy} disabled={!changed} />
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
        onChangeText={setPassword}
        autoComplete="new-password"
        onSubmitEditing={save}
        error={error}
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
    if (on && !(await confirmIdentity(`Turn on ${name} for Voltrix`))) {
      return setError(`${name} didn't work, so it is still off.`);
    }
    setLocked(false);
    save({ biometric: on });
  }

  return (
    <Group>
      <ListRow
        title={`Unlock with ${name}`}
        subtitle={error ?? 'Asked each time the app opens'}
        leading={<IconTile icon="lock-closed-outline" />}
        trailing={
          <Toggle accessibilityLabel={`Unlock with ${name}`} value={settings.biometric} onValueChange={toggle} />
        }
        last
      />
    </Group>
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
        {Platform.OS === 'web' && settings.reminder ? ' On a computer, only while Voltrix is open.' : ''}
      </Text>
      {blocked ? (
        <ErrorText>
          {Platform.OS === 'web'
            ? 'Notifications are blocked in this browser. Allow them for this site, then pick a time again.'
            : 'Notifications are off for Voltrix. Turn them on in your phone settings, then pick a time again.'}
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
      </Section>
      <Section title="Body measurements">
        <Segmented options={options(LENGTHS)} value={settings.lengths} onChange={(lengths) => save({ lengths })} />
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

  if (!blocked) return <SkeletonRows count={2} avatar />;
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
        <EmptyState compact icon="hand-left-outline" title="No one blocked" message="People you block show up here." />
      )}
      <ErrorText>{error}</ErrorText>
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
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  photo: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
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
