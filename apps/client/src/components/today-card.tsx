import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import {
  canStillSave,
  clearActiveWorkout,
  FinishError,
  finishPayload,
  isUnderway,
  setCounts,
  type ActiveWorkout,
} from '@/lib/active-workout';
import { confirm } from '@/lib/confirm';
import { weekdayDayMonth } from '@/lib/days';
import { saveError } from '@/lib/errors';
import { DEFAULT_TARGETS, logHabit, newer, type HabitDay } from '@/lib/habits';
import { isoWeekday, trainerLabel, type PlanItem } from '@/lib/plan';
import { dayKey, formatDay, formatTime, trainerName, type Session } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import type { TodayData } from '@/lib/today';
import { formatNumber, formatSleep, waterStep, waterUnit, waterValue } from '@/lib/units';
import { finishWorkout } from '@/lib/workout-log';

type IconName = ComponentProps<typeof Ionicons>['name'];

type TodayCardProps = {
  today: TodayData;
  // Save now and Discard clear the workout on the phone.
  userId: string;
  // Home's next booked session; null hides the row.
  nextSession: Session | null;
  // The check-in prompt shows only with a trainer.
  hasTrainers: boolean;
  // Loads Today again (only Today, not the rest of Home).
  onChanged: () => void;
};

const MAX_ROWS = 3;

// The top of Home: what's on today. Today's workouts with Start, calories left, habits with a
// quick add for water, the next session and the weekly check-in.
export function TodayCard({ today, userId, nextSession, hasTrainers, onChanged }: TodayCardProps) {
  const { settings } = useSettings();
  const unit = settings.units;
  // The newest water quick add, shown until Today loads again with it.
  const [added, setAdded] = useState<HabitDay | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);

  const habits = added && added.day === today.day ? newer(today.habits, added) : today.habits;
  const targets = today.targets ?? DEFAULT_TARGETS;
  const active = today.active;
  const due = today.plan?.due ?? [];
  const weekday = isoWeekday(new Date());

  // Taken at tap time, so Home left open past midnight logs on the right day. The adding
  // happens on the server, so the button never waits and two quick taps both count.
  function addWater() {
    const day = dayKey(new Date());
    setWaterError(null);
    logHabit(day, 'water', waterStep(unit)).then(
      (row) => {
        setAdded((prev) => (prev && prev.day === row.day ? newer(prev, row) : row));
        if (day !== today.day) onChanged();
      },
      () => setWaterError("Couldn't add water. Check your connection."),
    );
  }

  const water = habits ? formatNumber(waterValue(habits.water_ml, unit)) : '–';
  const waterGoal = `${formatNumber(waterValue(targets.water_ml, unit))} ${waterUnit(unit)}`;
  const steps = habits ? formatNumber(habits.steps) : '–';
  const sleep = habits ? formatSleep(habits.sleep_minutes) : '–';
  const step = waterStep(unit);
  const stepLabel = unit === 'lb' ? '8 oz' : '250 ml';

  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.section}>Today</Text>
      <View style={styles.card} testID="today-card">
        {active ? <ActiveWorkoutBlock workout={active} userId={userId} onChanged={onChanged} /> : null}

        {today.plan === null ? (
          <Text style={styles.muted}>Couldn&apos;t load today&apos;s workouts.</Text>
        ) : due.length ? (
          <View style={{ gap: Spacing.two }}>
            {due.slice(0, MAX_ROWS).map((item) => (
              <WorkoutRow
                key={item.plan_item_id}
                item={item}
                done={item.done_on.includes(today.day)}
                inProgress={!!active && isUnderway(active) && active.planItemId === item.plan_item_id}
              />
            ))}
            {due.length > MAX_ROWS ? (
              <Pressable accessibilityRole="button" onPress={() => router.navigate('/plan')} hitSlop={8}>
                <Text style={styles.link}>See all</Text>
              </Pressable>
            ) : null}
          </View>
        ) : today.plan.hasPlan ? (
          <Text style={styles.muted}>Nothing planned for today. Enjoy your rest day!</Text>
        ) : null}

        {today.nutrition?.target ? <Calories target={today.nutrition.target} eaten={today.nutrition.eaten} /> : null}

        <View style={{ gap: Spacing.one }}>
          <View style={styles.tiles}>
            <HabitTile
              icon="water"
              title="Water"
              value={water}
              goal={waterGoal}
              share={habits ? habits.water_ml / targets.water_ml : 0}
              label={`Water, ${water} of ${waterGoal}`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${stepLabel} of water`}
                testID="water-quick-add"
                onPress={addWater}
                hitSlop={6}
                style={({ pressed }) => [styles.quickAdd, pressed && { backgroundColor: Colors.accentPressed }]}>
                <Text style={styles.quickAddText}>+{unit === 'lb' ? '8 oz' : `${step} ml`}</Text>
              </Pressable>
            </HabitTile>
            <HabitTile
              icon="footsteps"
              title="Steps"
              value={steps}
              goal={formatNumber(targets.steps)}
              share={habits ? habits.steps / targets.steps : 0}
              label={`Steps, ${steps} of ${formatNumber(targets.steps)}`}
            />
            <HabitTile
              icon="moon"
              title="Sleep"
              value={sleep}
              share={habits?.sleep_minutes ? habits.sleep_minutes / targets.sleep_minutes : 0}
              label={`Sleep, ${sleep}`}
            />
          </View>
          <ErrorText>{waterError}</ErrorText>
        </View>

        {nextSession ? <NextSessionRow session={nextSession} /> : null}

        {hasTrainers && today.checkIns?.checkedIn === false && (weekday >= 5 || weekday === 1) ? (
          <LinkRow
            icon="clipboard-outline"
            title="Weekly check-in"
            detail="How did your week go?"
            onPress={() => router.push('/progress/check-in')}
          />
        ) : null}
        {today.checkIns?.newReply ? (
          <LinkRow
            icon="chatbubble-ellipses-outline"
            title={`New reply from ${today.checkIns.newReply.trainer_name}`}
            detail="On your weekly check-in"
            onPress={() => router.push('/progress/check-in')}
          />
        ) : null}

        <View style={styles.shortcuts}>
          <Shortcut icon="trending-up" label="Progress" onPress={() => router.push('/progress')} />
          <Shortcut icon="water" label="Habits" onPress={() => router.push('/habits')} />
          <Shortcut icon="time" label="History" onPress={() => router.push('/workouts/history')} />
        </View>
      </View>
    </View>
  );
}

// A workout on the phone: still going, or finished but not saved yet.
function ActiveWorkoutBlock({
  workout,
  userId,
  onChanged,
}: {
  workout: ActiveWorkout;
  userId: string;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (saved === workout.id) {
    return (
      <View style={styles.savedRow}>
        <Ionicons name="checkmark-circle" size={22} color={Colors.accentText} />
        <Text style={styles.rowTitle}>Workout saved</Text>
      </View>
    );
  }
  // Opened and left untouched: nothing to continue.
  if (!isUnderway(workout)) return null;
  const { done, total } = setCounts(workout);

  async function discard() {
    const sure = await confirm(
      'Discard workout?',
      "It's too old to save, so it will be removed from this phone.",
      'Discard',
    );
    if (!sure) return;
    await clearActiveWorkout(userId, workout.id);
    onChanged();
  }

  // The same id and finish time as the first try, so it can't be saved twice.
  async function saveNow() {
    setSaving(true);
    setProblem(null);
    try {
      await finishWorkout(finishPayload(workout));
      await clearActiveWorkout(userId, workout.id);
      setSaved(workout.id);
      setTimeout(onChanged, 4000);
    } catch (e) {
      setProblem(e instanceof FinishError ? e.message : saveError(e));
    }
    setSaving(false);
  }

  if (!canStillSave(workout)) {
    return (
      <View style={styles.block}>
        <Text style={styles.rowTitle}>This workout from {weekdayDayMonth(workout.day)} is too old to save.</Text>
        <Button title="Discard" variant="secondary" onPress={discard} />
      </View>
    );
  }

  if (workout.finishedAt !== null) {
    return (
      <View style={styles.block}>
        <Text style={styles.rowTitle}>Workout not saved yet</Text>
        <Text style={styles.muted}>
          {workout.name} · {done === 1 ? '1 set' : `${done} sets`}
        </Text>
        <Button title="Save now" onPress={saveNow} loading={saving} testID="today-save-now" />
        <ErrorText>{problem}</ErrorText>
      </View>
    );
  }

  return (
    <View style={styles.inProgress}>
      <Text style={styles.inProgressTitle}>Workout in progress</Text>
      <Text style={styles.inProgressText}>
        {workout.name} · {done} of {total} sets
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="today-continue"
        onPress={() => router.push('/workouts/live')}
        style={({ pressed }) => [styles.continue, pressed && { opacity: 0.8 }]}>
        <Text style={styles.continueText}>Continue</Text>
      </Pressable>
    </View>
  );
}

function WorkoutRow({ item, done, inProgress }: { item: PlanItem; done: boolean; inProgress: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.workout_name}${done ? ', done today' : ''}`}
      onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.plan_item_id } })}
      style={({ pressed }) => [styles.workout, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.workout_name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          From {trainerLabel(item)}
        </Text>
      </View>
      {done && !inProgress ? (
        <Text style={styles.done}>✓ Done</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${inProgress ? 'Continue' : 'Start'} ${item.workout_name}`}
          testID={inProgress ? undefined : `today-start-${item.plan_item_id}`}
          onPress={() =>
            inProgress
              ? router.push('/workouts/live')
              : router.push({ pathname: '/workouts/live', params: { plan: item.plan_item_id } })
          }
          hitSlop={4}
          style={({ pressed }) => [styles.start, pressed && { backgroundColor: Colors.accentPressed }]}>
          <Text style={styles.startText}>{inProgress ? 'Continue' : 'Start'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

// Calories left today against the trainer's plan. Neutral either way: no red, no shaming.
function Calories({ target, eaten }: { target: number; eaten: number }) {
  const left = Math.round(target - eaten);
  const text = left >= 0 ? `${formatNumber(left)} kcal left` : `${formatNumber(-left)} kcal over`;
  const share = target > 0 ? Math.min(1, Math.max(0, eaten / target)) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Calories: ${text} of ${formatNumber(target)}`}
      testID="today-kcal"
      onPress={() => router.navigate('/nutrition')}
      style={({ pressed }) => [styles.kcal, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={styles.kcalTop}>
        <Ionicons name="restaurant-outline" size={18} color={Colors.textSecondary} />
        <Text style={[styles.rowTitle, { flex: 1 }]}>{text}</Text>
        <Text style={styles.muted}>of {formatNumber(target)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${share * 100}%` }]} />
      </View>
    </Pressable>
  );
}

function HabitTile({
  icon,
  title,
  value,
  goal,
  share,
  label,
  children,
}: {
  icon: IconName;
  title: string;
  value: string;
  // Smaller, under the value: "750" over "/ 2 500 ml".
  goal?: string;
  share: number;
  label: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/habits')}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <View style={styles.tileTop}>
        <Ionicons name={icon} size={16} color={Colors.accentText} />
        <Text style={styles.tileTitle}>{title}</Text>
      </View>
      {/* The goal goes on its own line, so a narrow tile never breaks a number in two. */}
      <View style={styles.tileNumbers}>
        <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {goal ? (
          <Text style={styles.tileGoal} numberOfLines={1}>
            / {goal}
          </Text>
        ) : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, share)) * 100}%` }]} />
      </View>
      {children}
    </Pressable>
  );
}

function NextSessionRow({ session }: { session: Session }) {
  const start = new Date(session.starts_at);
  const text = `Next session · ${formatDay(start)} ${formatTime(start)} · ${trainerName(session)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={session.online ? `${text}, video call` : text}
      testID="today-next-session"
      onPress={() => router.navigate({ pathname: '/plan', params: { view: 'sessions' } })}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name="calendar-outline" size={20} color={Colors.accentText} />
      <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={2}>
        {text}
      </Text>
      {session.online ? <Ionicons name="videocam" size={18} color={Colors.accentText} /> : null}
    </Pressable>
  );
}

function LinkRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={20} color={Colors.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </Pressable>
  );
}

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={20} color={Colors.accentText} />
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  block: {
    gap: Spacing.two,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  rowText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  muted: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  link: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  inProgress: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
  },
  inProgressTitle: {
    color: Colors.onAccent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inProgressText: {
    color: Colors.onAccent,
    fontSize: 17,
    fontWeight: '800',
  },
  continue: {
    marginTop: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.onAccent,
  },
  continueText: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  workout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  done: {
    color: Colors.accentText,
    fontSize: 15,
    fontWeight: '800',
  },
  start: {
    minHeight: 44,
    minWidth: 80,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  startText: {
    color: Colors.onAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  kcal: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  kcalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  tileTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  // Room for the value and its goal, so the three bars line up.
  tileNumbers: {
    minHeight: 38,
  },
  tileValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  tileGoal: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  quickAdd: {
    marginTop: Spacing.one,
    minHeight: 44,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  quickAddText: {
    color: Colors.onAccent,
    fontSize: 14,
    fontWeight: '800',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 56,
    justifyContent: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shortcutText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
}));
