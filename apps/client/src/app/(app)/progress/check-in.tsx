import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ScaleChoice } from '@/components/scale-choice';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { dayMonth } from '@/lib/days';
import { saveError } from '@/lib/errors';
import { shiftDay } from '@/lib/food';
import {
  CHECK_IN_QUESTIONS,
  checkInWeekKey,
  loadBodyWeights,
  loadCheckIns,
  markRepliesSeen,
  saveBodyWeight,
  saveCheckIn,
  type BodyWeight,
  type CheckIn,
  type CheckInQuestion,
} from '@/lib/progress';
import { serial } from '@/lib/serial';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { formatWeight, fromKg, parseNumber, rangeLabel, toKg, weightInput, type WeightUnit } from '@/lib/units';

const MAX_TEXT = 1000;

// Whether the person has a trainer. Throws when it can't tell (no signal), so the screen keeps
// its neutral wording instead of saying there's no trainer.
async function hasTrainer(): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_trainers');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

type Answers = Record<CheckInQuestion, number | null>;

// The weekly check-in: four quick answers, wins and struggles, and the trainers' replies.
export default function CheckInScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { settings } = useSettings();
  const week = checkInWeekKey();
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [weights, setWeights] = useState<BodyWeight[]>([]);
  const [trainer, setTrainer] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const load = useMemo(
    () =>
      serial(async (current) => {
        const today = dayKey(new Date());
        const [c, t, w] = await Promise.all([
          loadCheckIns(12).catch(() => null),
          hasTrainer().catch(() => null),
          // The check-in week, and today for the weight saved with it.
          loadBodyWeights(week < today ? week : today, shiftDay(today, 1)).catch(() => null),
        ]);
        if (!current()) return;
        if (c) setCheckIns(c);
        if (t !== null) setTrainer(t);
        if (w) setWeights(w);
        setError(c ? null : 'Could not load your check-ins. Check your internet connection.');
        const newest = (c ?? [])
          .flatMap((x) => x.replies)
          .map((r) => r.updated_at)
          .filter((at) => !Number.isNaN(Date.parse(at)))
          .sort()
          .at(-1);
        if (newest && userId) markRepliesSeen(userId, newest);
      }),
    [week, userId],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatEvents((event) => {
    if ((event.type === 'progress' && event.kind === 'reply') || event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const existing = checkIns?.find((c) => c.week_start === week) ?? null;
  // The latest weight logged in the check-in week.
  const weekEnd = shiftDay(week, 6);
  const weekWeight = weights.filter((w) => w.day >= week && w.day <= weekEnd).at(-1) ?? null;
  const todayHasWeight = weights.some((w) => w.day === dayKey(new Date()));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
      {error ? (
        <View style={{ gap: Spacing.two }}>
          <ErrorText>{error}</ErrorText>
          <Button title="Try again" variant="secondary" onPress={refresh} loading={refreshing} />
        </View>
      ) : null}
      {checkIns === null ? (
        !error ? (
          <ActivityIndicator color={Colors.accentText} />
        ) : null
      ) : (
        <>
          <Text style={styles.title}>Your week of {dayMonth(week)}</Text>
          {sent ? (
            <View style={styles.sent}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.accentText} />
              <Text style={styles.sentText}>{sent}</Text>
            </View>
          ) : null}
          <CheckInForm
            // A check-in that turns up (sent here or on another phone) fills the form again.
            key={`${existing?.id ?? 'new'}-${settings.units}`}
            week={week}
            existing={existing}
            weekWeight={existing ? existing.weight_kg : (weekWeight?.weight_kg ?? null)}
            todayHasWeight={todayHasWeight}
            unit={settings.units}
            onSaved={(updated) => {
              setSent(updated ? 'Check-in updated.' : 'Check-in sent.');
              load(true);
            }}
          />
          <Body secondary style={styles.small}>
            {trainer === false
              ? "When you have a trainer, they'll see your check-ins."
              : 'Your trainers see your check-in and can reply.'}
          </Body>

          {checkIns.length ? (
            <>
              <Text style={styles.section}>Past check-ins</Text>
              {checkIns.map((c) => (
                <PastCheckIn key={c.id} checkIn={c} unit={settings.units} />
              ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function CheckInForm({
  week,
  existing,
  weekWeight,
  todayHasWeight,
  unit,
  onSaved,
}: {
  week: string;
  existing: CheckIn | null;
  weekWeight: number | null;
  todayHasWeight: boolean;
  unit: WeightUnit;
  onSaved: (updated: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({
    rating: existing?.rating ?? null,
    energy: existing?.energy ?? null,
    sleep: existing?.sleep ?? null,
    stress: existing?.stress ?? null,
  });
  const [wins, setWins] = useState(existing?.wins ?? '');
  const [struggles, setStruggles] = useState(existing?.struggles ?? '');
  // The weight the form started with, kept as it was when the form opened.
  const [start] = useState(() => ({ kg: weekWeight, text: weightInput(weekWeight, unit) }));
  const [weight, setWeight] = useState(start.text);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send() {
    setProblem(null);
    const { rating, energy, sleep, stress } = answers;
    if (rating === null || energy === null || sleep === null || stress === null) {
      return setProblem('Pick an answer for each question.');
    }
    const text = weight.trim();
    // A weight left as it was keeps its exact kg; only typed text is converted.
    const typed = text !== start.text;
    let kg: number | null = null;
    if (text) {
      const value = parseNumber(text);
      kg = !typed && start.kg !== null ? start.kg : value === null ? null : toKg(value, unit);
      if (kg === null || kg < 20 || kg > 400) {
        return setProblem(`Enter a weight between ${rangeLabel(fromKg(20, unit), fromKg(400, unit), 1, unit)}.`);
      }
    }
    setBusy(true);
    try {
      await saveCheckIn({
        week_start: week,
        rating,
        energy,
        sleep,
        stress,
        wins: wins.trim() || null,
        struggles: struggles.trim() || null,
        weight_kg: kg,
      });
      // A weight typed here is also today's weight, unless one is logged already.
      if (kg !== null && typed && !todayHasWeight) await saveBodyWeight(dayKey(new Date()), kg).catch(() => {});
      setBusy(false);
      onSaved(!!existing);
    } catch (e) {
      setProblem(saveError(e));
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: Spacing.four }}>
      {CHECK_IN_QUESTIONS.map((question) => (
        <ScaleChoice
          key={question.key}
          question={question}
          value={answers[question.key]}
          onChange={(n) => setAnswers((old) => ({ ...old, [question.key]: n }))}
        />
      ))}
      <TextField
        label="Wins this week"
        value={wins}
        onChangeText={setWins}
        placeholder="What went well?"
        multiline
        maxLength={MAX_TEXT}
        style={styles.multiline}
      />
      <TextField
        label="Struggles"
        value={struggles}
        onChangeText={setStruggles}
        placeholder="What was hard?"
        multiline
        maxLength={MAX_TEXT}
        style={styles.multiline}
      />
      <TextField
        label={`Weight (${unit}) (optional)`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder={unit === 'lb' ? '170' : '75.5'}
      />
      <ErrorText>{problem}</ErrorText>
      <Button
        title={existing ? 'Update check-in' : 'Send check-in'}
        onPress={send}
        loading={busy}
        testID="send-check-in"
      />
    </Card>
  );
}

function PastCheckIn({ checkIn, unit }: { checkIn: CheckIn; unit: WeightUnit }) {
  return (
    <Card style={{ gap: Spacing.two }}>
      <Text style={styles.week}>Week of {dayMonth(checkIn.week_start)}</Text>
      {CHECK_IN_QUESTIONS.map((q) => (
        <Body key={q.key} style={styles.small}>
          <Text style={styles.answerLabel}>{q.short}: </Text>
          {q.words[checkIn[q.key] - 1] ?? '–'}
        </Body>
      ))}
      {checkIn.weight_kg !== null ? (
        <Body style={styles.small}>
          <Text style={styles.answerLabel}>Weight: </Text>
          {formatWeight(checkIn.weight_kg, unit)}
        </Body>
      ) : null}
      {checkIn.wins ? (
        <Body style={styles.small}>
          <Text style={styles.answerLabel}>Wins: </Text>
          {checkIn.wins}
        </Body>
      ) : null}
      {checkIn.struggles ? (
        <Body style={styles.small}>
          <Text style={styles.answerLabel}>Struggles: </Text>
          {checkIn.struggles}
        </Body>
      ) : null}
      {checkIn.replies.map((r) => (
        <View key={`${r.trainer_id}-${r.updated_at}`} style={styles.reply}>
          <Avatar url={r.trainer_avatar} name={r.trainer_name} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.replyName}>
              {r.trainer_name}
              {Number.isNaN(Date.parse(r.updated_at)) ? (
                ''
              ) : (
                <Text style={styles.replyDate}> · {dayMonth(dayKey(new Date(r.updated_at)))}</Text>
              )}
            </Text>
            <Body style={styles.small}>{r.body}</Body>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sentText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  week: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  answerLabel: {
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  reply: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  replyName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  replyDate: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
}));
