import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Notice,
  Section,
  segmentOn,
  Skeleton,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { allAnswered, type HealthForm, type HealthQuestion } from '@/lib/health';
import { useLeaveGuard } from '@/lib/leave-guard';
import { loadMyForm, loadQuestions, removeMyForm, saveMyForm } from '@/lib/my-health';
import { loadTrainers, trainerTitle } from '@/lib/trainers';

const DETAILS_MAX = 1000;
const NAME_MAX = 120;
const PHONE_MAX = 30;
const SIGN_MAX = 200;

type Page =
  | { kind: 'loading' }
  | { kind: 'failed' }
  // An older database: no health form yet.
  | { kind: 'missing' }
  | { kind: 'ready'; questions: HealthQuestion[]; form: HealthForm | null };

type Draft = {
  answers: Record<string, boolean | undefined>;
  details: string;
  emergencyName: string;
  emergencyPhone: string;
};

const BLANK: Draft = { answers: {}, details: '', emergencyName: '', emergencyPhone: '' };

function draftOf(form: HealthForm | null): Draft {
  if (!form) return BLANK;
  return {
    answers: { ...form.answers },
    details: form.details ?? '',
    emergencyName: form.emergency_name ?? '',
    emergencyPhone: form.emergency_phone ?? '',
  };
}

function sameDraft(a: Draft, b: Draft) {
  const keys = new Set([...Object.keys(a.answers), ...Object.keys(b.answers)]);
  return (
    [...keys].every((k) => a.answers[k] === b.answers[k]) &&
    a.details.trim() === b.details.trim() &&
    a.emergencyName.trim() === b.emergencyName.trim() &&
    a.emergencyPhone.trim() === b.emergencyPhone.trim()
  );
}

// The person's health form: yes or no to each of the database's questions, anything else their trainer
// should know, an emergency contact, and their typed name as a signature. Their trainers in Voltrix
// read it while they train them. The person can change it or remove it any time.
export default function Health() {
  const { session } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState<Page>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [signed, setSigned] = useState('');
  // The trainers' first names, for the words ("tell Thandi what they said"). Left out on a failure.
  const [trainers, setTrainers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);

  const load = useCallback(
    () =>
      Promise.all([loadQuestions(), loadMyForm(), loadTrainers().catch(() => null)]).then(
        ([questions, form, linked]) => {
          if (linked) setTrainers(linked.map((t) => trainerTitle(t).split(' ')[0] || trainerTitle(t)));
          if (questions === null || form === undefined) return setPage({ kind: 'missing' });
          setPage({ kind: 'ready', questions, form });
          setDraft(draftOf(form));
        },
        () => setPage((p) => (p.kind === 'ready' ? p : { kind: 'failed' })),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const form = page.kind === 'ready' ? page.form : null;
  const changed = page.kind === 'ready' && (!sameDraft(draft, draftOf(form)) || signed.trim().length > 0);
  useLeaveGuard(changed && !saving && !removing);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  if (page.kind !== 'ready') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {page.kind === 'loading' ? (
          showSkeleton ? (
            <View style={{ gap: Spacing.tight }} accessible accessibilityLabel="Loading">
              <Skeleton width="80%" height={14} radius={7} />
              <Skeleton width="60%" height={14} radius={7} />
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} width="100%" height={112} radius={Radius.large} />
              ))}
            </View>
          ) : null
        ) : page.kind === 'failed' ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            Couldn’t load your health form.
          </Notice>
        ) : (
          <EmptyState
            icon="medkit-outline"
            title="This isn’t available yet."
            message="The health form arrives with the next update of Voltrix."
          />
        )}
      </ScrollView>
    );
  }

  const { questions } = page;
  const anyYes = questions.some((q) => draft.answers[q.key] === true);
  const who = trainers.length === 1 ? trainers[0] : 'your trainer';
  const ready = allAnswered(draft.answers, questions) && signed.trim().length >= 2;

  function answer(key: string, value: boolean) {
    setDraft((d) => ({ ...d, answers: { ...d.answers, [key]: value } }));
    setError(null);
  }

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const answers: Record<string, boolean> = {};
      for (const q of questions) answers[q.key] = draft.answers[q.key] === true;
      await saveMyForm({
        answers,
        details: draft.details.trim(),
        emergencyName: draft.emergencyName.trim(),
        emergencyPhone: draft.emergencyPhone.trim(),
        signedName: signed.trim(),
      });
      haptic.success();
      toast(
        trainers.length === 1
          ? `Saved. ${trainers[0]} can see it.`
          : trainers.length > 1
            ? 'Saved. Your trainers can see it.'
            : 'Saved.',
      );
      leave();
    } catch (e) {
      haptic.warning();
      setError(plainError(e, 'Couldn’t save. Check your connection and try again.'));
      setSaving(false);
    }
  }

  async function remove() {
    if (!session || removing) return;
    const sure = await confirm(
      'Remove your health form?',
      'Your trainers won’t see it any more. You can fill it in again any time.',
      'Remove',
    );
    if (!sure) return;
    setRemoving(true);
    setError(null);
    try {
      await removeMyForm(session.user.id);
      toast('Removed.');
      leave();
    } catch (e) {
      haptic.warning();
      setError(plainError(e, 'Couldn’t remove it. Check your connection and try again.'));
      setRemoving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Spacing.two }}>
          <Text variant="footnote" tone="secondary">
            {questions.length} questions · about 2 minutes
          </Text>
          <Text variant="callout" tone="secondary">
            Your answers go to the trainers you train with in Voltrix, so they can plan safely. Only they see them, and
            only while they train you. You can change or remove them any time.
          </Text>
          {form ? (
            <Text variant="footnote" tone="secondary" testID="health-signed">
              Signed by {form.signed_name} on {dayMonth(new Date(form.signed_at))}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: Spacing.tight }}>
          {questions.map((q, i) => (
            <Card key={q.key} style={{ gap: Spacing.three }}>
              <Text variant="body">{q.question}</Text>
              <YesNo
                value={draft.answers[q.key]}
                onChange={(v) => answer(q.key, v)}
                label={`Question ${i + 1}`}
                testID={`health-q-${q.key}`}
              />
            </Card>
          ))}
        </View>

        {anyYes ? (
          <View testID="health-yes">
            <Notice tone="warning">
              You answered yes. Check with your doctor before you start training hard, and tell {who} what they said.
            </Notice>
          </View>
        ) : null}

        <TextField
          label="Anything else your trainer should know"
          optional
          value={draft.details}
          onChangeText={(t) => setDraft((d) => ({ ...d, details: t.slice(0, DETAILS_MAX) }))}
          placeholder="Injuries, operations, medicine"
          multiline
          maxLength={DETAILS_MAX}
          testID="health-details"
          style={styles.multiline}
        />

        <Section title="Emergency contact (optional)">
          <View style={{ gap: Spacing.three }}>
            <TextField
              label="Name"
              value={draft.emergencyName}
              onChangeText={(t) => setDraft((d) => ({ ...d, emergencyName: t.slice(0, NAME_MAX) }))}
              autoCapitalize="words"
              autoComplete="off"
              maxLength={NAME_MAX}
              testID="health-emergency-name"
            />
            <TextField
              label="Phone"
              value={draft.emergencyPhone}
              onChangeText={(t) => setDraft((d) => ({ ...d, emergencyPhone: t.slice(0, PHONE_MAX) }))}
              keyboardType="phone-pad"
              autoComplete="off"
              maxLength={PHONE_MAX}
              testID="health-emergency-phone"
            />
          </View>
        </Section>

        <View style={{ gap: Spacing.two }}>
          <TextField
            label="Type your full name to sign"
            value={signed}
            onChangeText={(t) => setSigned(t.slice(0, SIGN_MAX))}
            autoCapitalize="words"
            autoComplete="name"
            maxLength={SIGN_MAX}
            testID="health-sign"
          />
          <Text variant="footnote" tone="secondary">
            This isn’t medical advice. Answer as truly as you can.
          </Text>
        </View>

        {form ? (
          <Pressable
            accessibilityRole="button"
            onPress={remove}
            disabled={removing}
            testID="health-remove"
            style={({ pressed }) => [
              styles.remove,
              Platform.OS === 'web' && { cursor: 'pointer' },
              pressed && { opacity: 0.6 },
            ]}>
            <Text variant="callout" tone="danger" style={{ fontFamily: Fonts.textMedium }}>
              {removing ? 'Removing…' : 'Remove my answers'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <StickyFooter>
        <ErrorText testID="health-error">{error}</ErrorText>
        <Button title="Save and sign" onPress={save} loading={saving} disabled={!ready} testID="health-save" />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

// No or Yes, nothing chosen until answered: a segmented control's look, each side its own button for
// screen readers and tests ("-no", "-yes").
function YesNo({
  value,
  onChange,
  label,
  testID,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  label: string;
  testID: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}>
      {([false, true] as const).map((v) => {
        const selected = value === v;
        const word = v ? 'Yes' : 'No';
        return (
          <Pressable
            key={word}
            accessibilityRole="radio"
            accessibilityLabel={word}
            accessibilityState={{ checked: selected }}
            testID={`${testID}-${v ? 'yes' : 'no'}`}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(v);
            }}
            style={[styles.option, Platform.OS === 'web' && { cursor: 'pointer' }]}>
            {({ pressed }) => (
              <View
                style={[
                  styles.optionInner,
                  selected ? segmentOn() : pressed ? { backgroundColor: Colors.tintPressed } : null,
                ]}>
                <Text
                  variant="callout"
                  tone={selected ? 'primary' : 'secondary'}
                  style={{ fontFamily: selected ? Fonts.textSemi : Fonts.textMedium }}>
                  {word}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
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
    paddingBottom: Spacing.section,
    gap: Spacing.section,
  },
  multiline: {
    minHeight: 104,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  // The segmented control's track, 44 high for the finger, at the card's right edge.
  track: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    width: 168,
    padding: 3,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
  },
  option: {
    flex: 1,
  },
  optionInner: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  remove: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
}));
