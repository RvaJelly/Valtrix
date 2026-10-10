import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  Notice,
  ProgressBar,
  Section,
  Shortcuts,
  StatusPill,
  Text,
} from '@/components/ui';
import { Colors, Fonts, Spacing, Tabular, themed } from '@/constants/theme';
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
import { haptic } from '@/lib/haptics';
import { DEFAULT_TARGETS, logHabit, newer, type HabitDay } from '@/lib/habits';
import { isoWeekday, trainerLabel, type PlanItem } from '@/lib/plan';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import type { TodayData } from '@/lib/today';
import { formatNumber, formatSleep, waterStep, waterUnit, waterValue } from '@/lib/units';
import { finishWorkout } from '@/lib/workout-log';

type IconName = ComponentProps<typeof Ionicons>['name'];

type TodayCardProps = {
  today: TodayData;
  // Save now and Discard clear the workout on the phone.
  userId: string;
  // The check-in prompt shows only with a trainer.
  hasTrainers: boolean;
  // Loads Today again (only Today, not the rest of Home).
  onChanged: () => void;
};

const MAX_ROWS = 3;

// "6:50 h"; under an hour stays "50 min".
function shortSleep(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  return hours ? `${hours}:${String(total % 60).padStart(2, '0')} h` : `${total} min`;
}

// The top of Home: what's on today. Today's workouts with Start, calories left, habits with a
// quick add for water and the weekly check-in. (The next session is Home's own hero card, so it
// isn't repeated here.)
export function TodayCard({ today, userId, hasTrainers, onChanged }: TodayCardProps) {
  const { settings } = useSettings();
  const unit = settings.units;
  // At large text sizes the sleep tile shows "6:50 h", which fits a third of a phone.
  const large = useWindowDimensions().fontScale > 1.15;
  // The newest water quick add, shown until Today loads again with it.
  const [added, setAdded] = useState<HabitDay | null>(null);
  const [waterError, setWaterError] = useState<string | null>(null);

  const habits = added && added.day === today.day ? newer(today.habits, added) : today.habits;
  const targets = today.targets ?? DEFAULT_TARGETS;
  const active = today.active;
  const due = today.plan?.due ?? [];
  const weekday = isoWeekday(new Date());
  const underway = !!active && isUnderway(active);
  // A lone Start is the card's one main action; next to other workouts, or a workout already
  // going, each Start is a quiet one.
  const open = due.filter((item) => !item.done_on.includes(today.day));
  const startIsMain = !underway && due.length === 1 && open.length === 1;

  // Taken at tap time, so Home left open past midnight logs on the right day. The adding
  // happens on the server, so the button never waits and two quick taps both count.
  function addWater() {
    const day = dayKey(new Date());
    const before = day === today.day ? (habits?.water_ml ?? 0) : 0;
    setWaterError(null);
    logHabit(day, 'water', waterStep(unit)).then(
      (row) => {
        setAdded((prev) => (prev && prev.day === row.day ? newer(prev, row) : row));
        if (before < targets.water_ml && row.water_ml >= targets.water_ml) haptic.success();
        if (day !== today.day) onChanged();
      },
      () => setWaterError("Couldn't add water. Check your connection."),
    );
  }

  const water = habits ? formatNumber(waterValue(habits.water_ml, unit)) : '–';
  const waterGoal = `${formatNumber(waterValue(targets.water_ml, unit))} ${waterUnit(unit)}`;
  const steps = habits ? formatNumber(habits.steps) : '–';
  // A dash rather than "Not logged", which doesn't fit a narrow tile on a phone's browser.
  const sleepMinutes = habits?.sleep_minutes ?? null;
  const sleep = sleepMinutes === null ? '–' : large ? shortSleep(sleepMinutes) : formatSleep(sleepMinutes);
  const sleepGoal = formatSleep(targets.sleep_minutes);
  const stepLabel = unit === 'lb' ? '8 oz' : '250 ml';
  const checkIn = hasTrainers && today.checkIns?.checkedIn === false && (weekday >= 5 || weekday === 1);
  const reply = today.checkIns?.newReply ?? null;

  return (
    <View testID="today-card">
      <Section title="Today">
        {active ? <ActiveWorkoutBlock workout={active} userId={userId} onChanged={onChanged} /> : null}

        {today.plan === null ? (
          <Notice>Couldn&apos;t load today&apos;s workouts.</Notice>
        ) : due.length ? (
          <Group>
            {due.slice(0, MAX_ROWS).map((item, i) => (
              <WorkoutRow
                key={item.plan_item_id}
                item={item}
                done={item.done_on.includes(today.day)}
                inProgress={underway && active?.planItemId === item.plan_item_id}
                main={startIsMain}
                last={i === Math.min(due.length, MAX_ROWS) - 1 && due.length <= MAX_ROWS}
              />
            ))}
            {due.length > MAX_ROWS ? (
              <ListRow
                title={`See all ${due.length} workouts`}
                compact
                titleTone="secondary"
                onPress={() => router.navigate('/plan')}
                last
              />
            ) : null}
          </Group>
        ) : today.plan.hasPlan ? (
          <EmptyState compact icon="cafe-outline" title="Rest day" message="Nothing planned for today." />
        ) : null}

        <Card style={styles.numbers}>
          {today.nutrition?.target ? <Calories target={today.nutrition.target} eaten={today.nutrition.eaten} /> : null}
          <View style={styles.tiles}>
            <HabitTile
              icon="water-outline"
              title="Water"
              value={water}
              goal={waterGoal}
              share={habits ? habits.water_ml / targets.water_ml : 0}
              label={`Water, ${water} of ${waterGoal}`}>
              <Button
                title={`+${stepLabel}`}
                variant="secondary"
                size="small"
                oneLine
                onPress={addWater}
                accessibilityLabel={`Add ${stepLabel} of water`}
                testID="water-quick-add"
              />
            </HabitTile>
            <HabitTile
              icon="footsteps-outline"
              title="Steps"
              value={steps}
              goal={formatNumber(targets.steps)}
              share={habits ? habits.steps / targets.steps : 0}
              label={`Steps, ${steps} of ${formatNumber(targets.steps)}`}
            />
            <HabitTile
              icon="moon-outline"
              title="Sleep"
              value={sleep}
              goal={sleepGoal}
              share={sleepMinutes ? sleepMinutes / targets.sleep_minutes : 0}
              label={`Sleep, ${sleepMinutes !== null ? sleep : 'not logged'} of ${sleepGoal}`}
            />
          </View>
          <ErrorText>{waterError}</ErrorText>
        </Card>

        {checkIn || reply ? (
          <Group>
            {checkIn ? (
              <ListRow
                title="Weekly check-in"
                subtitle="How did your week go?"
                leading={<IconTile icon="clipboard-outline" />}
                onPress={() => router.push('/progress/check-in')}
                last={!reply}
              />
            ) : null}
            {reply ? (
              <ListRow
                title={`New reply from ${reply.trainer_name}`}
                subtitle="On your weekly check-in"
                leading={<IconTile icon="chatbubble-ellipses-outline" />}
                onPress={() => router.push('/progress/check-in')}
                last
              />
            ) : null}
          </Group>
        ) : null}

        <View style={styles.shortcuts}>
          <Shortcuts
            items={[
              { icon: 'trending-up-outline', label: 'Progress', onPress: () => router.push('/progress') },
              { icon: 'water-outline', label: 'Habits', onPress: () => router.push('/habits') },
              { icon: 'time-outline', label: 'History', onPress: () => router.push('/workouts/history') },
            ]}
          />
        </View>
      </Section>
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

  if (saved === workout.id) return <Notice tone="success">Workout saved</Notice>;
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
      haptic.success();
      setSaved(workout.id);
      setTimeout(onChanged, 4000);
    } catch (e) {
      setProblem(e instanceof FinishError ? e.message : saveError(e));
    }
    setSaving(false);
  }

  if (!canStillSave(workout)) {
    return (
      <Card style={styles.block}>
        <Text variant="headline">Too old to save</Text>
        <Text variant="callout" tone="secondary">
          This workout from {weekdayDayMonth(workout.day)} is too old to save.
        </Text>
        <Button title="Discard" variant="destructive" onPress={discard} style={styles.blockAction} />
      </Card>
    );
  }

  if (workout.finishedAt !== null) {
    return (
      <Card style={styles.block}>
        <Text variant="headline">Workout not saved yet</Text>
        <Text variant="callout" tone="secondary">
          {workout.name} · {done === 1 ? '1 set' : `${done} sets`}
        </Text>
        <Button
          title="Save now"
          onPress={saveNow}
          loading={saving}
          testID="today-save-now"
          style={styles.blockAction}
        />
        <ErrorText>{problem}</ErrorText>
      </Card>
    );
  }

  return (
    <Card
      hero
      footer={<Button title="Continue" onPress={() => router.push('/workouts/live')} testID="today-continue" />}>
      <Text variant="label" tone="secondary">
        Workout in progress
      </Text>
      <Text variant="title" numberOfLines={2} style={{ marginTop: Spacing.two }}>
        {workout.name}
      </Text>
      <Text variant="footnote" tone="secondary" style={[Tabular, { marginTop: Spacing.one }]}>
        {done} of {total} sets
      </Text>
    </Card>
  );
}

// The name opens the workout and Start sits beside it, not inside it: a button inside a
// button can't be reached with VoiceOver on iPhone.
function WorkoutRow({
  item,
  done,
  inProgress,
  main,
  last,
}: {
  item: PlanItem;
  done: boolean;
  inProgress: boolean;
  main: boolean;
  last: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <View style={[styles.row, pressed && { backgroundColor: Colors.tint }]}>
      <View style={[styles.rowBody, !last && styles.rowLine]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.workout_name}, from ${trainerLabel(item)}${done ? ', done today' : ''}`}
          onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.plan_item_id } })}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={styles.rowName}>
          <Text variant="rowTitle" numberOfLines={1}>
            {item.workout_name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            From {trainerLabel(item)}
          </Text>
        </Pressable>
        {inProgress ? (
          <StatusPill tone="neutral" label="In progress" />
        ) : done ? (
          <StatusPill tone="success" label="Done" />
        ) : (
          <Button
            title="Start"
            size="small"
            variant={main ? 'primary' : 'secondary'}
            accessibilityLabel={`Start ${item.workout_name}`}
            testID={`today-start-${item.plan_item_id}`}
            onPress={() => router.push({ pathname: '/workouts/live', params: { plan: item.plan_item_id } })}
          />
        )}
      </View>
    </View>
  );
}

// Calories left today against the trainer's plan. Neutral either way: no red, no shaming. The bar
// is in the text colour; the orange ring belongs to Nutrition.
function Calories({ target, eaten }: { target: number; eaten: number }) {
  const left = Math.round(target - eaten);
  const text = left >= 0 ? `${formatNumber(left)} kcal left` : `${formatNumber(-left)} kcal over`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Calories: ${text} of ${formatNumber(target)}`}
      testID="today-kcal"
      onPress={() => router.navigate('/nutrition')}
      style={({ pressed }) => [styles.kcal, pressed && { opacity: 0.6 }]}>
      <View style={styles.kcalTop}>
        <Ionicons name="restaurant-outline" size={16} color={Colors.textSecondary} />
        <Text variant="rowTitle" style={[Tabular, { flex: 1 }]} numberOfLines={1}>
          {text}
        </Text>
        <Text variant="footnote" tone="secondary" style={Tabular}>
          of {formatNumber(target)}
        </Text>
      </View>
      <ProgressBar progress={target > 0 ? eaten / target : 0} color={left < 0 ? Colors.warning : undefined} />
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
  // A button of its own under the tile (the water quick add), outside the tile's button so
  // VoiceOver can reach it.
  children?: ReactNode;
}) {
  return (
    <View style={styles.tile}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => router.push('/habits')}
        style={({ pressed }) => [styles.tileButton, pressed && { opacity: 0.6 }]}>
        <View style={styles.tileTop}>
          <Ionicons name={icon} size={14} color={Colors.textSecondary} />
          <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {/* The goal goes on its own line, so a narrow tile never breaks a number in two. */}
        <View style={styles.tileNumbers}>
          <Text variant="rowTitle" style={Tabular} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          {goal ? (
            <Text variant="footnote" tone="secondary" style={Tabular} numberOfLines={1}>
              / {goal}
            </Text>
          ) : null}
        </View>
        <ProgressBar progress={share} />
      </Pressable>
      {children}
    </View>
  );
}

const styles = themed(() => ({
  block: {
    gap: Spacing.two,
  },
  blockAction: {
    marginTop: Spacing.two,
  },
  row: {
    paddingLeft: Spacing.gutter,
  },
  rowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 64,
    paddingVertical: 10,
    paddingRight: Spacing.gutter,
  },
  rowLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
  },
  numbers: {
    gap: Spacing.gutter,
  },
  kcal: {
    gap: Spacing.tight,
  },
  kcalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.tight,
  },
  tileButton: {
    gap: Spacing.two,
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // Room for the value and its goal, so the three bars line up.
  tileNumbers: {
    minHeight: 40,
  },
  shortcuts: {
    marginTop: Spacing.two,
  },
}));
