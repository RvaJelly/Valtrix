import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Chips } from '@/components/chips';
import { DaySwitcher } from '@/components/day-switcher';
import { Sheet } from '@/components/sheet';
import { Body, Button, Card, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useChatEvents } from '@/lib/chat-live';
import { weekdayLetter } from '@/lib/days';
import { saveError } from '@/lib/errors';
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
        setError(found && saved ? null : 'Could not load your habits. Check your internet connection.');
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

  // Two quick taps both count: the adding happens on the server. Gives the message when it
  // didn't save, for the sheet it came from to show.
  async function log(habit: Habit, amount: number, add = true): Promise<string | null> {
    setProblem(null);
    try {
      merge([await logHabit(day, habit, amount, add)]);
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
  const goals = targets ?? DEFAULT_TARGETS;
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 6)).map((d) => days?.[d] ?? emptyDay(d));
  const step = waterStep(unit);
  const wUnit = waterUnit(unit);
  const water = `${formatNumber(waterValue(current.water_ml, unit))} / ${formatNumber(waterValue(goals.water_ml, unit))} ${wUnit}`;

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
      {!loaded && !error ? <ActivityIndicator color={Colors.accentText} /> : null}

      <HabitCard
        icon="water"
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
        icon="footsteps"
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
        icon="moon"
        title="Sleep"
        subtitle="Last night"
        value={`${formatSleep(current.sleep_minutes)} / ${formatSleep(goals.sleep_minutes)}`}
        share={(current.sleep_minutes ?? 0) / goals.sleep_minutes}
        label={`Sleep last night, ${current.sleep_minutes === null ? 'not logged' : spokenSleep(current.sleep_minutes)}`}>
        <View style={styles.buttons}>
          <SmallButton title="Set sleep" onPress={() => open('sleep')} testID="set-sleep" />
        </View>
      </HabitCard>

      <Text style={styles.section}>Last 7 days</Text>
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

      <Button title="Targets" variant="secondary" onPress={() => open('targets')} testID="habit-targets" />
      <Body secondary style={styles.small}>
        Your trainers can see this.
      </Body>

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
  icon: 'water' | 'footsteps' | 'moon';
  title: string;
  subtitle?: string;
  value: string;
  share: number;
  label: string;
  children: ReactNode;
}) {
  const width = `${Math.round(Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0)) * 100)}%` as const;
  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.cardTop} accessible accessibilityLabel={label}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={20} color={Colors.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width }]} />
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.smallButton, (pressed || disabled) && { opacity: 0.5 }]}>
      <Text style={styles.smallButtonText}>{title}</Text>
    </Pressable>
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
        <Text style={styles.weekTitle}>{title}</Text>
        <Text style={styles.weekAvg}>{avg === null ? 'Nothing logged' : average(avg)}</Text>
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
                {hit ? <Ionicons name="checkmark" size={14} color={Colors.accentText} /> : null}
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height }]} />
              </View>
              <Text style={[styles.letter, d.day === chosen && styles.letterChosen]}>{weekdayLetter(d.day)}</Text>
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
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'right',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  smallButton: {
    flexGrow: 1,
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium,
    backgroundColor: Colors.surfaceRaised,
  },
  smallButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  weekTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  weekTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  weekAvg: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
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
    maxWidth: 28,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: Colors.surfaceRaised,
  },
  barFill: {
    width: '100%',
    backgroundColor: Colors.accent,
  },
  letter: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  letterChosen: {
    color: Colors.text,
    fontWeight: '900',
  },
  fields: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
}));
