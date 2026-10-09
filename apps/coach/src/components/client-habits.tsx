import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import { Body, Button, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useClientData } from '@/lib/client-data';
import type { Client } from '@/lib/clients';
import { weekdayShort } from '@/lib/days';
import { shiftDay } from '@/lib/food';
import { loadClientHabits, loadClientHabitTargets, type HabitDay, type HabitTargets } from '@/lib/progress';
import { addDays, dayKey } from '@/lib/sessions';
import { useSettings } from '@/lib/settings';
import { formatNumber, formatSleep, formatSteps, formatWater, ML_PER_FL_OZ, type WeightUnit } from '@/lib/units';

type Data = { days: HabitDay[]; targets: HabitTargets | null };

// The client's defaults, for the moment the targets can't be read.
const DEFAULT_TARGETS: HabitTargets = { water_ml: 2500, steps: 8000, sleep_minutes: 480 };

function load(clientId: string): Promise<Data> {
  const today = new Date();
  return Promise.all([
    // A day either side of the trainer's week, since the client may be in another time zone.
    loadClientHabits(clientId, dayKey(addDays(today, -7)), dayKey(addDays(today, 1))),
    loadClientHabitTargets(clientId),
  ]).then(([days, targets]) => ({ days, targets }));
}

// Habits send no news (they change with every tap), so this part reloads when the page
// shows, the app comes back or the connection is back.
const KINDS = [] as const;

type Row = {
  key: 'water' | 'steps' | 'sleep';
  title: string;
  // The day's amount, or null when nothing was logged.
  value: (day: HabitDay | undefined) => number | null;
  target: number;
  short: (value: number) => string;
  // For a screen reader: '2.1 litres'.
  spoken: (value: number) => string;
};

// '7 hours 30 minutes', for a screen reader.
function spokenSleep(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [];
  if (hours) parts.push(hours === 1 ? '1 hour' : `${hours} hours`);
  if (rest || !hours) parts.push(rest === 1 ? '1 minute' : `${rest} minutes`);
  return parts.join(' ');
}

function rows(targets: HabitTargets, unit: WeightUnit): Row[] {
  return [
    {
      key: 'water',
      title: 'Water',
      value: (d) => (d && d.water_ml > 0 ? d.water_ml : null),
      target: targets.water_ml,
      short: (ml) => formatWater(ml, unit),
      spoken: (ml) =>
        unit === 'lb'
          ? `${formatNumber(ml / ML_PER_FL_OZ)} ounces`
          : ml < 1000
            ? `${formatNumber(ml)} millilitres`
            : `${formatNumber(ml / 1000, 1)} litres`,
    },
    {
      key: 'steps',
      title: 'Steps',
      value: (d) => (d && d.steps > 0 ? d.steps : null),
      target: targets.steps,
      short: formatSteps,
      spoken: (steps) => `${formatSteps(steps)} steps`,
    },
    {
      key: 'sleep',
      title: 'Sleep',
      value: (d) => d?.sleep_minutes ?? null,
      target: targets.sleep_minutes,
      short: formatSleep,
      spoken: spokenSleep,
    },
  ];
}

// The client's water, steps and sleep over the last 7 days, against their own targets.
// Read-only. Shown only for a client who accepted the trainer.
export function ClientHabits({ client }: { client: Pick<Client, 'id' | 'first_name' | 'user_id'> }) {
  const { settings } = useSettings();
  const { data, failed, again } = useClientData(client.id, load, KINDS);

  // The 7 days end on the trainer's today, or on the client's newest day when they are ahead.
  const today = dayKey(new Date());
  const newest = data?.days.reduce((max, d) => (d.day > max ? d.day : max), today) ?? today;
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(newest, i - 6));
  const byDay = new Map((data?.days ?? []).map((d) => [d.day, d]));
  const logged = week.some((day) => byDay.has(day));

  return (
    <View testID="client-habits" style={styles.part}>
      <Text style={styles.section}>Habits</Text>
      {!data && !failed ? <ActivityIndicator color={Colors.accentText} /> : null}
      {!data && failed ? (
        <>
          <ErrorText>Could not load {client.first_name}’s habits. Check your internet connection.</ErrorText>
          <Button title="Try again" variant="secondary" onPress={again} />
        </>
      ) : null}
      {data && !logged ? (
        <Body secondary style={styles.small}>
          No habits logged in the last 7 days.
        </Body>
      ) : null}
      {data && logged ? (
        <View style={styles.card}>
          {rows(data.targets ?? DEFAULT_TARGETS, settings.units).map((row, i) => (
            <HabitRow key={row.key} row={row} week={week} byDay={byDay} first={i === 0} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HabitRow({
  row,
  week,
  byDay,
  first,
}: {
  row: Row;
  week: string[];
  byDay: Map<string, HabitDay>;
  first: boolean;
}) {
  const values = week.map((day) => row.value(byDay.get(day)));
  const done = values.filter((v): v is number => v !== null);
  const average = done.length ? done.reduce((a, b) => a + b, 0) / done.length : null;
  const onTarget = done.filter((v) => v >= row.target).length;
  const label = `${row.title}, last 7 days: on target ${onTarget} of 7 days, ${
    average !== null ? `average ${row.spoken(average)}` : 'nothing logged'
  }`;

  return (
    <View
      style={[styles.row, !first && styles.rowLine]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.onTarget}>On target {onTarget} of 7 days</Text>
      </View>
      <View style={styles.bars} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {week.map((day, i) => {
          const value = values[i];
          const share = value !== null && row.target > 0 ? Math.min(1, value / row.target) : 0;
          const met = value !== null && value >= row.target;
          return (
            <View key={day} style={styles.barColumn}>
              <View style={styles.check}>
                {met ? <Ionicons name="checkmark" size={12} color={Colors.accentText} /> : null}
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { height: `${Math.round(share * 100)}%` }]} />
              </View>
              <Text style={styles.weekday}>{weekdayShort(day)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.meta}>
        {average !== null ? `Avg ${row.short(average)}` : 'Nothing logged'} · target {row.short(row.target)}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  part: {
    gap: Spacing.three,
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
    lineHeight: 20,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  rowLine: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.two,
    paddingTop: Spacing.three,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  onTarget: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Phone-sized, also in a wide browser window.
  bars: {
    flexDirection: 'row',
    gap: Spacing.two,
    maxWidth: 420,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  check: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    maxWidth: 28,
    height: 56,
    borderRadius: Radius.small,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceRaised,
  },
  fill: {
    width: '100%',
    borderRadius: Radius.small,
    backgroundColor: Colors.accent,
  },
  weekday: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
}));
