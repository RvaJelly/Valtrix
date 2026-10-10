import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { Chips } from '@/components/chips';
import { DaySwitcher } from '@/components/day-switcher';
import { Sheet } from '@/components/sheet';
import {
  Button,
  Card,
  ErrorText,
  IconTile,
  Notice,
  ProgressBar,
  Section,
  Skeleton,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { weekdayLetter } from '@/lib/days';
import { saveError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { shiftDay } from '@/lib/food';
import {
  DEFAULT_TARGETS,
  emptyDay,
  HABIT_DAYS_BACK,
  loadHabitDays,
  loadTargets,
  logHabit,
  newer,
  saveTargets,
  TARGET_LIMITS,
  type Habit,
  type HabitDay,
  type HabitTargets,
} from '@/lib/habits';
import { serial } from '@/lib/serial';
import { dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import {
  formatNumber,
  formatSleep,
  formatSteps,
  formatWater,
  parseNumber,
  rangeLabel,
  trim,
  waterStep,
  waterToMl,
  waterUnit,
  waterValue,
  ML_PER_FL_OZ,
  type WeightUnit,
} from '@/lib/units';

const SLEEP_CHIPS = {
  '360': '6 h',
  '390': '6 h 30',
  '420': '7 h',
  '450': '7 h 30',
  '480': '8 h',
  '510': '8 h 30',
  '540': '9 h',
} as const;
type SleepChip = keyof typeof SLEEP_CHIPS;

const MAX_STEPS = 200000;
const MAX_SLEEP = 24 * 60;

// Water as it is read out: "2.1 litres", "750 millilitres", "25 ounces".
function spokenWater(ml: number, unit: WeightUnit) {
  if (unit === 'lb') return `${formatNumber(ml / ML_PER_FL_OZ)} ounces`;
  return ml < 1000 ? `${formatNumber(ml)} millilitres` : `${formatNumber(ml / 1000, 1)} litres`;
}

function amountOf(habit: Habit, day: HabitDay) {
  return habit === 'water' ? day.water_ml : habit === 'steps' ? day.steps : (day.sleep_minutes ?? 0);
}

function targetOf(habit: Habit, targets: HabitTargets) {
  return habit === 'water' ? targets.water_ml : habit === 'steps' ? targets.steps : targets.sleep_minutes;
}

function spokenSleep(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  const parts = [hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '', rest ? `${rest} minutes` : ''];
  return parts.filter(Boolean).join(' ') || '0 minutes';
}

// Water, steps and last night's sleep, day by day, against the person's own targets.
export default function Habits() {
  const { settings } = useSettings();
  const unit = settings.units;
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [days, setDays] = useState<Record<string, HabitDay> | null>(null);
  const [targets, setTargets] = useState<HabitTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<{ open: 'steps' | 'sleep' | 'targets' | null; key: number }>({
    open: null,
    key: 0,
  });

  // Keeps whichever copy of each day was saved later.
  const merge = useCallback((found: HabitDay[]) => {
    setDays((old) => {
      const next = { ...(old ?? {}) };
      for (const d of found) next[d.day] = newer(next[d.day], d) ?? d;
      return next;
    });
  }, []);

  const load = useMemo(
    () =>
      serial(async (current) => {
        const today = dayKey(new Date());
        const [found, saved] = await Promise.all([
          loadHabitDays(shiftDay(today, -HABIT_DAYS_BACK), shiftDay(today, 1)).catch(() => null),
          loadTargets().catch(() => null),
        ]);
        if (!current()) return;
        if (found) merge(found);
        if (saved) setTargets(saved);
        setError(found && saved ? null : "Couldn't load your habits. Check your connection and try again.");
      }),
    [merge],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useChatEvents((event) => {
    if (event.type === 'reconnected') load();
  });

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const goals = targets ?? DEFAULT_TARGETS;

  // Two quick taps both count: the adding happens on the server. Gives the message when it
  // didn't save, for the sheet it came from to show. Reaching the day's target answers with a
  // success buzz on a phone.
  async function log(habit: Habit, amount: number, add = true): Promise<string | null> {
    setProblem(null);
    const before = amountOf(habit, days?.[day] ?? emptyDay(day));
    try {
      const saved = await logHabit(day, habit, amount, add);
      merge([saved]);
      const target = targetOf(habit, goals);
      if (before < target && amountOf(habit, saved) >= target) haptic.success();
      return null;
    } catch (e) {
      return saveError(e);
    }
  }

  async function quickAdd(habit: Habit, amount: number) {
    const failed = await log(habit, amount);
    if (failed) setProblem(failed);
  }

  function open(which: 'steps' | 'sleep' | 'targets') {
    setSheet((s) => ({ open: which, key: s.key + 1 }));
  }

  function close() {
    setSheet((s) => ({ ...s, open: null }));
  }

  const loaded = days !== null && targets !== null;
  const current = days?.[day] ?? emptyDay(day);
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 6)).map((d) => days?.[d] ?? emptyDay(d));
  const step = waterStep(unit);
  const wUnit = waterUnit(unit);
  const water = `${formatNumber(waterValue(current.water_ml, unit))} / ${formatNumber(waterValue(goals.water_ml, unit))} ${wUnit}`;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />}>
      {error ? (
        <Notice tone="danger" action={{ label: 'Try again', onPress: refresh, loading: refreshing }}>
          {error}
        </Notice>
      ) : null}
      <DaySwitcher
        day={day}
        onChange={(d) => {
          setDay(d);
          setProblem(null);
        }}
        daysBack={HABIT_DAYS_BACK}
        testIDPrefix="habit-day"
      />
      <ErrorText>{problem}</ErrorText>
      {!loaded && !error ? (
        <Loading />
      ) : (
        <>
          <HabitCard
            icon="water-outline"
            title="Water"
            value={water}
            share={current.water_ml / goals.water_ml}
            label={`Water, ${formatNumber(waterValue(current.water_ml, unit))} of ${formatNumber(waterValue(goals.water_ml, unit))} ${wUnit}`}>
            <View style={styles.buttons}>
              <SmallButton
                title={`+${formatNumber(waterValue(step, unit))} ${wUnit}`}
                label={`Add ${formatNumber(waterValue(step, unit))} ${wUnit} of water`}
                onPress={() => quickAdd('water', step)}
              />
              <SmallButton
                title={`+${formatNumber(waterValue(step * 2, unit))} ${wUnit}`}
                label={`Add ${formatNumber(waterValue(step * 2, unit))} ${wUnit} of water`}
                onPress={() => quickAdd('water', step * 2)}
              />
              <SmallButton
                title={`−${formatNumber(waterValue(step, unit))} ${wUnit}`}
                label={`Take off ${formatNumber(waterValue(step, unit))} ${wUnit} of water`}
                onPress={() => quickAdd('water', -step)}
                disabled={current.water_ml <= 0}
              />
            </View>
          </HabitCard>

          <HabitCard
            icon="footsteps-outline"
            title="Steps"
            value={`${formatSteps(current.steps)} / ${formatSteps(goals.steps)}`}
            share={current.steps / goals.steps}
            label={`Steps, ${formatSteps(current.steps)} of ${formatSteps(goals.steps)}`}>
            <View style={styles.buttons}>
              <SmallButton
                title={`+${formatNumber(1000)}`}
                label="Add 1 000 steps"
                onPress={() => quickAdd('steps', 1000)}
              />
              <SmallButton title="Set steps" onPress={() => open('steps')} testID="set-steps" />
            </View>
          </HabitCard>

          <HabitCard
            icon="moon-outline"
            title="Sleep"
            subtitle="Last night"
            value={`${formatSleep(current.sleep_minutes)} / ${formatSleep(goals.sleep_minutes)}`}
            share={(current.sleep_minutes ?? 0) / goals.sleep_minutes}
            label={`Sleep last night, ${current.sleep_minutes === null ? 'not logged' : spokenSleep(current.sleep_minutes)}`}>
            <View style={styles.buttons}>
              <SmallButton title="Set sleep" onPress={() => open('sleep')} testID="set-sleep" />
            </View>
          </HabitCard>

          <Section title="Last 7 days">
            <Card style={{ gap: Spacing.four }}>
              <WeekBars
                title="Water"
                days={week}
                chosen={day}
                value={(d) => d.water_ml}
                target={goals.water_ml}
                average={(avg) => `Avg ${formatWater(avg, unit)}`}
                spoken={(avg) => spokenWater(avg, unit)}
              />
              <WeekBars
                title="Steps"
                days={week}
                chosen={day}
                value={(d) => d.steps}
                target={goals.steps}
                average={(avg) => `Avg ${formatSteps(Math.round(avg / 100) * 100)}`}
                spoken={(avg) => `${formatSteps(Math.round(avg / 100) * 100)} steps`}
              />
              <WeekBars
                title="Sleep"
                days={week}
                chosen={day}
                value={(d) => d.sleep_minutes}
                target={goals.sleep_minutes}
                average={(avg) => `Avg ${formatSleep(Math.round(avg / 10) * 10)}`}
                spoken={(avg) => spokenSleep(Math.round(avg / 10) * 10)}
              />
            </Card>
          </Section>
        </>
      )}

      <Button
        title="Targets"
        variant="secondary"
        icon="options-outline"
        onPress={() => open('targets')}
        testID="habit-targets"
      />
      <Text variant="footnote" tone="secondary">
        Your trainers can see this.
      </Text>

      <Sheet visible={sheet.open === 'steps'} onClose={close} title="Set steps">
        <StepsForm
          key={sheet.key}
          steps={current.steps}
          onSave={async (n) => {
            const failed = await log('steps', n, false);
            if (!failed) close();
            return failed;
          }}
        />
      </Sheet>
      <Sheet visible={sheet.open === 'sleep'} onClose={close} title="Sleep last night">
        <SleepForm
          key={sheet.key}
          minutes={current.sleep_minutes}
          onSave={async (n) => {
            const failed = await log('sleep', n, false);
            if (!failed) close();
            return failed;
          }}
        />
      </Sheet>
      <Sheet visible={sheet.open === 'targets'} onClose={close} title="Targets">
        <TargetsForm
          key={sheet.key}
          targets={goals}
          unit={unit}
          onSaved={(saved) => {
            setTargets(saved);
            close();
          }}
        />
      </Sheet>
    </ScrollView>
  );
}

function HabitCard({
  icon,
  title,
  subtitle,
  value,
  share,
  label,
  children,
}: {
  icon: 'water-outline' | 'footsteps-outline' | 'moon-outline';
  title: string;
  subtitle?: string;
  value: string;
  share: number;
  label: string;
  children: ReactNode;
}) {
  // "750 / 2 500 ml": the amount large, the target quieter beside it.
  const [amount, ...goal] = value.split(' / ');
  return (
    <Card style={{ gap: Spacing.gutter }}>
      <View style={{ gap: Spacing.tight }} accessible accessibilityLabel={label}>
        <View style={styles.cardTop}>
          <IconTile icon={icon} color={Colors.text} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">{title}</Text>
            {subtitle ? (
              <Text variant="footnote" tone="secondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <Text variant="stat" style={Tabular} maxFontSizeMultiplier={1.3}>
          {amount}
          {goal.length ? (
            <Text variant="callout" tone="secondary" style={[Tabular, { fontFamily: Fonts.textMedium }]}>
              {' / '}
              {goal.join(' / ')}
            </Text>
          ) : null}
        </Text>
        <ProgressBar progress={share} />
      </View>
      {children}
    </Card>
  );
}

function SmallButton({
  title,
  label,
  onPress,
  disabled,
  testID,
}: {
  title: string;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Button
      title={title}
      variant="secondary"
      size="small"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={styles.smallButton}
    />
  );
}

// Placeholders shaped like the three habit cards, after a short wait so fast loads show nothing.
function Loading() {
  const shown = useDelayed();
  if (!shown) return null;
  return (
    <View accessible accessibilityLabel="Loading" style={{ gap: Spacing.three }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={168} radius={Radius.large} />
      ))}
    </View>
  );
}

function WeekBars({
  title,
  days,
  chosen,
  value,
  target,
  average,
  spoken,
}: {
  title: string;
  days: HabitDay[];
  chosen: string;
  value: (day: HabitDay) => number | null;
  target: number;
  average: (avg: number) => string;
  spoken: (avg: number) => string;
}) {
  // The average of the days with something logged.
  const logged = days.map(value).filter((v): v is number => v !== null && v > 0);
  const avg = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null;
  const met = days.filter((d) => (value(d) ?? 0) >= target).length;
  const label = `${title}, last 7 days: on target ${met} of 7 days, ${avg === null ? 'nothing logged' : `average ${spoken(avg)}`}`;
  return (
    <View style={{ gap: Spacing.two }} accessible accessibilityLabel={label}>
      <View style={styles.weekTop}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="footnote" tone="secondary" style={Tabular}>
          {avg === null ? 'Nothing logged' : average(avg)}
        </Text>
      </View>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants">
        {days.map((d) => {
          const v = value(d) ?? 0;
          const share = target > 0 ? Math.min(1, Math.max(0, v / target)) : 0;
          const hit = v >= target;
          const height = `${Math.round(share * 100)}%` as const;
          return (
            <View key={d.day} style={styles.barColumn}>
              <View style={styles.check}>
                {hit ? <Ionicons name="checkmark" size={14} color={Colors.success} /> : null}
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height }]} />
              </View>
              <Text
                variant="footnote"
                tone={d.day === chosen ? 'primary' : 'tertiary'}
                style={d.day === chosen && { fontFamily: Fonts.textSemi }}>
                {weekdayLetter(d.day)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// onSave gives the message when it didn't save.
function StepsForm({ steps, onSave }: { steps: number; onSave: (n: number) => Promise<string | null> }) {
  const [text, setText] = useState(steps > 0 ? String(steps) : '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    const n = parseNumber(text);
    if (n === null || n < 0 || n > MAX_STEPS) {
      return setProblem(`Enter steps between ${rangeLabel(0, MAX_STEPS, 0, '')}.`);
    }
    setProblem(null);
    setBusy(true);
    setProblem(await onSave(Math.round(n)));
    setBusy(false);
  }

  return (
    <>
      <TextField
        label="Steps"
        value={text}
        onChangeText={setText}
        keyboardType="number-pad"
        placeholder="8000"
        onSubmitEditing={save}
      />
      <ErrorText>{problem}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </>
  );
}

function SleepForm({ minutes, onSave }: { minutes: number | null; onSave: (n: number) => Promise<string | null> }) {
  const [hours, setHours] = useState(minutes === null ? '' : String(Math.floor(minutes / 60)));
  const [mins, setMins] = useState(minutes === null ? '' : String(minutes % 60));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const h = parseNumber(hours);
  const m = parseNumber(mins || '0');
  const total = h === null || m === null ? null : Math.round(h * 60 + m);
  const chip = total !== null && String(total) in SLEEP_CHIPS ? (String(total) as SleepChip) : null;

  async function save() {
    if (h === null || m === null || h < 0 || m < 0 || m >= 60 || total === null || total > MAX_SLEEP) {
      return setProblem('Enter hours (0–24) and minutes (0–59).');
    }
    setProblem(null);
    setBusy(true);
    setProblem(await onSave(total));
    setBusy(false);
  }

  return (
    <>
      <Chips
        options={SLEEP_CHIPS}
        value={chip}
        wrap
        onChange={(c) => {
          if (!c) return;
          const n = Number(c);
          setHours(String(Math.floor(n / 60)));
          setMins(String(n % 60));
        }}
      />
      <View style={styles.fields}>
        <View style={{ flex: 1 }}>
          <TextField label="Hours" value={hours} onChangeText={setHours} keyboardType="number-pad" placeholder="7" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Minutes" value={mins} onChangeText={setMins} keyboardType="number-pad" placeholder="30" />
        </View>
      </View>
      <ErrorText>{problem}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </>
  );
}

function TargetsForm({
  targets,
  unit,
  onSaved,
}: {
  targets: HabitTargets;
  unit: WeightUnit;
  onSaved: (targets: HabitTargets) => void;
}) {
  const start = {
    water: String(waterValue(targets.water_ml, unit)),
    steps: String(targets.steps),
    sleep: trim(targets.sleep_minutes / 60),
  };
  const [water, setWater] = useState(start.water);
  const [steps, setSteps] = useState(start.steps);
  const [sleep, setSleep] = useState(start.sleep);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const wUnit = waterUnit(unit);

  async function save() {
    setProblem(null);
    const limits = TARGET_LIMITS;
    // A value left as it was keeps its exact amount.
    const w = water.trim() === start.water ? targets.water_ml : waterToMl(parseNumber(water) ?? NaN, unit);
    if (!(w >= limits.water.min && w <= limits.water.max)) {
      const factor = unit === 'lb' ? 1 / ML_PER_FL_OZ : 1;
      return setProblem(`Water: ${rangeLabel(limits.water.min * factor, limits.water.max * factor, 0, wUnit)}`);
    }
    const s = parseNumber(steps) ?? NaN;
    if (!(s >= limits.steps.min && s <= limits.steps.max)) {
      return setProblem(`Steps: ${rangeLabel(limits.steps.min, limits.steps.max, 0, '')}`);
    }
    const hoursTyped = parseNumber(sleep) ?? NaN;
    const minutes = sleep.trim() === start.sleep ? targets.sleep_minutes : Math.round(hoursTyped * 60);
    if (!(minutes >= limits.sleep.min && minutes <= limits.sleep.max)) {
      return setProblem(`Sleep: ${rangeLabel(limits.sleep.min / 60, limits.sleep.max / 60, 0, 'h')}`);
    }
    const next = { water_ml: w, steps: Math.round(s), sleep_minutes: minutes };
    setBusy(true);
    try {
      await saveTargets(next);
      onSaved(next);
    } catch (e) {
      setProblem(saveError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <TextField label={`Water a day (${wUnit})`} value={water} onChangeText={setWater} keyboardType="number-pad" />
      <TextField label="Steps a day" value={steps} onChangeText={setSteps} keyboardType="number-pad" />
      <TextField label="Sleep a night (hours)" value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" />
      <ErrorText>{problem}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} />
    </>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.gutter,
    paddingBottom: Spacing.hero,
    gap: Spacing.three,
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  smallButton: {
    flexGrow: 1,
    minWidth: 88,
  },
  weekTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bars: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  check: {
    height: 14,
  },
  barTrack: {
    width: '100%',
    maxWidth: 24,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: Colors.track,
  },
  barFill: {
    width: '100%',
    backgroundColor: Colors.text,
  },
  fields: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
}));
