import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DaySummary } from '@/components/day-summary';
import { FoodSheet } from '@/components/food-sheet';
import { Sheet } from '@/components/sheet';
import {
  Button,
  EmptyState,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  PageHeader,
  Skeleton,
  Text,
  useDelayed,
  type IconName,
} from '@/components/ui';
import { Colors, Fonts, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import {
  dayKey,
  dayTitle,
  foodFromEntry,
  formatAmount,
  formatKcal,
  formatNumber,
  fromDayKey,
  mealLabel,
  MEALS,
  shiftDay,
  totalsOf,
  type DiaryEntry,
  type Meal,
  type Targets,
} from '@/lib/food';
import { longDate } from '@/lib/format';
import { changeAmount, hasTrainer, loadDay, loadPlans, removeFromDiary, type NutritionPlan } from '@/lib/nutrition';

type AddOption = 'scan' | 'search' | 'recent' | 'custom';

const ADD_OPTIONS: { key: AddOption; label: string; detail: string; icon: IconName }[] = [
  { key: 'scan', label: 'Scan a barcode', detail: 'Point your camera at the pack', icon: 'barcode-outline' },
  { key: 'search', label: 'Search', detail: 'Find a food by its name', icon: 'search-outline' },
  { key: 'recent', label: 'Recent foods', detail: 'Foods you had before', icon: 'time-outline' },
  { key: 'custom', label: 'Enter it yourself', detail: 'Type in the calories', icon: 'create-outline' },
];

function targetsOf(plan: NutritionPlan | undefined): Targets | null {
  if (!plan || (!plan.kcal && !plan.protein_g && !plan.carbs_g && !plan.fat_g)) return null;
  return { kcal: plan.kcal, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fat_g: plan.fat_g };
}

// The food diary: what the client ate each day against their trainer's targets.
export default function Nutrition() {
  // The date on the phone. It moves on at midnight and when the app comes back the next day.
  const [today, setToday] = useState(() => dayKey(new Date()));
  // The day picked with the arrows; null is today, whichever day that is.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  // Foods by day, so a slow answer for one day can't take the place of another.
  const [diaries, setDiaries] = useState<Record<string, DiaryEntry[]>>({});
  const [failedDay, setFailedDay] = useState<string | null>(null);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [trainer, setTrainer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // The newest request for each day; older answers for that day are out of date.
  const requests = useRef({ count: 0, latest: new Map<string, number>() });
  // The meal stays set while the sheet slides away, so its title doesn't change.
  const [adding, setAdding] = useState<{ meal: Meal; open: boolean; next?: AddOption } | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  // Plans start folded, so logging food stays near the top.
  const [openPlans, setOpenPlans] = useState<string[]>([]);
  const showSkeleton = useDelayed(300);

  const loadDiary = useCallback(async (key: string) => {
    const r = requests.current;
    const ask = ++r.count;
    r.latest.set(key, ask);
    try {
      const entries = await loadDay(key);
      if (r.latest.get(key) !== ask) return;
      setDiaries((d) => ({ ...d, [key]: entries }));
      setFailedDay((f) => (f === key ? null : f));
    } catch {
      if (r.latest.get(key) === ask) setFailedDay(key);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const [loaded, linked] = await Promise.all([loadPlans().catch(() => null), hasTrainer().catch(() => false)]);
    if (loaded) setPlans(loaded);
    setTrainer(linked);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDiary(day);
    }, [loadDiary, day]),
  );

  useFocusEffect(
    useCallback(() => {
      loadMore();
    }, [loadMore]),
  );

  // Tabs stay open in the background, so check the date while this one shows and
  // whenever the app comes back.
  useFocusEffect(
    useCallback(() => {
      const check = () => setToday(dayKey(new Date()));
      check();
      const timer = setInterval(check, 60000);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') check();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, []),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadDiary(day), loadMore()]);
    setRefreshing(false);
  }

  async function retry() {
    setRetrying(true);
    await loadDiary(day);
    setRetrying(false);
  }

  // Going back to today's date follows today from then on.
  function go(key: string) {
    setPicked(key === today ? null : key);
  }

  const entries = diaries[day] ?? null;
  const failed = failedDay === day;
  const targets = targetsOf(plans.find((p) => targetsOf(p)));
  const title = dayTitle(day, fromDayKey(today));

  function openAdd(option: AddOption, meal: Meal) {
    const params = { meal, day };
    if (option === 'scan') router.push({ pathname: '/nutrition/scan', params });
    else if (option === 'custom') router.push({ pathname: '/nutrition/custom', params });
    else router.push({ pathname: '/nutrition/search', params: { ...params, mode: option } });
  }

  function addWith(option: AddOption) {
    const meal = adding?.meal ?? 'snacks';
    // In a browser a closing sheet keeps hold of the keyboard focus until it has slid away,
    // which would take it from the next screen's text box. So open that screen afterwards.
    if (Platform.OS === 'web') return setAdding({ meal, open: false, next: option });
    setAdding({ meal, open: false });
    openAdd(option, meal);
  }

  async function saveAmount(entry: DiaryEntry, amount: number) {
    const updated = await changeAmount(entry, amount);
    setDiaries((d) => ({ ...d, [entry.day]: (d[entry.day] ?? []).map((e) => (e.id === updated.id ? updated : e)) }));
    setEditing(null);
  }

  async function remove(entry: DiaryEntry) {
    await removeFromDiary(entry.id);
    setDiaries((d) => ({ ...d, [entry.day]: (d[entry.day] ?? []).filter((e) => e.id !== entry.id) }));
    setEditing(null);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.textSecondary} />
        }>
        <View style={{ gap: Spacing.two }}>
          <PageHeader
            eyebrow={longDate(fromDayKey(day), fromDayKey(today))}
            title={title}
            onTitlePress={day === today ? undefined : () => setPicked(null)}
            titleAccessibilityLabel={`${title}. Go to today`}
            actions={
              <>
                <IconButton
                  variant="tonal"
                  icon="chevron-back"
                  label="Day before"
                  onPress={() => go(shiftDay(day, -1))}
                />
                <IconButton
                  variant="tonal"
                  icon="chevron-forward"
                  label="Day after"
                  onPress={() => go(shiftDay(day, 1))}
                  style={{ marginRight: Spacing.two }} // filled circles sit on the edge, not past it
                />
              </>
            }
          />
          {day !== today ? (
            <Button
              title="Back to today"
              variant="ghost"
              size="small"
              onPress={() => setPicked(null)}
              style={{ alignSelf: 'flex-start', marginLeft: -14 }}
            />
          ) : null}
        </View>

        {/* A web page can't be pulled down to refresh, so there's always a button. */}
        {failed && entries ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            Could not refresh your food diary.
          </Notice>
        ) : null}
        {entries ? (
          <DaySummary totals={totalsOf(entries)} targets={targets} />
        ) : failed ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Your food diary could not be loaded"
            message="Check your internet connection and try again."
            action={<Button title="Try again" variant="secondary" onPress={retry} loading={retrying} />}
          />
        ) : showSkeleton ? (
          <Skeleton height={260} radius={24} />
        ) : (
          <View style={{ height: 260 }} />
        )}

        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            open={openPlans.includes(plan.id)}
            onToggle={() =>
              setOpenPlans((ids) => (ids.includes(plan.id) ? ids.filter((id) => id !== plan.id) : [...ids, plan.id]))
            }
          />
        ))}

        {entries
          ? MEALS.map((meal) => (
              <MealCard
                key={meal.key}
                label={meal.label}
                entries={entries.filter((e) => e.meal === meal.key)}
                onAdd={() => setAdding({ meal: meal.key, open: true })}
                onEdit={setEditing}
              />
            ))
          : null}

        {entries && trainer ? (
          <View style={styles.note}>
            <Ionicons name="eye-outline" size={14} color={Colors.textTertiary} />
            <Text variant="footnote" tone="tertiary">
              Your trainer can see what you log here.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!adding?.open}
        onClose={() => setAdding((a) => a && { ...a, open: false })}
        onClosed={() => {
          if (adding?.next) openAdd(adding.next, adding.meal);
          setAdding(null);
        }}
        title={`Add to ${mealLabel(adding?.meal)}`}>
        <Group style={{ backgroundColor: 'transparent' }}>
          {ADD_OPTIONS.map((option, i) => (
            <ListRow
              key={option.key}
              title={option.label}
              subtitle={option.detail}
              leading={<IconTile icon={option.icon} />}
              onPress={() => addWith(option.key)}
              accessibilityLabel={option.label}
              accessibilityHint={option.detail}
              last={i === ADD_OPTIONS.length - 1}
            />
          ))}
        </Group>
      </Sheet>

      <FoodSheet
        mode="edit"
        food={editing ? foodFromEntry(editing) : null}
        initial={editing ? { amount: editing.amount, unit: editing.unit } : undefined}
        actionLabel="Save"
        onClose={() => setEditing(null)}
        onSubmit={async (amount) => {
          if (editing) await saveAmount(editing, amount);
        }}
        onRemove={async () => {
          if (editing) await remove(editing);
        }}
      />
    </SafeAreaView>
  );
}

// A meal: its name and total, the foods as rows, and a quiet "Add food" row.
function MealCard({
  label,
  entries,
  onAdd,
  onEdit,
}: {
  label: string;
  entries: DiaryEntry[];
  onAdd: () => void;
  onEdit: (entry: DiaryEntry) => void;
}) {
  const kcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  return (
    <View style={{ gap: Spacing.tight }}>
      <View style={styles.mealHeader}>
        <Text variant="label" tone="secondary" style={{ flex: 1 }} accessibilityRole="header">
          {label}
        </Text>
        {entries.length ? (
          <Text variant="footnote" style={[Tabular, { fontFamily: Fonts.textSemi }]}>
            {formatKcal(kcal)}
          </Text>
        ) : null}
      </View>
      <Group>
        {entries.map((entry) => (
          <ListRow
            key={entry.id}
            title={entry.name}
            subtitle={[entry.brand, formatAmount(entry.amount, entry.unit)].filter(Boolean).join(' · ')}
            trailing={
              <Text variant="callout" tone="secondary" style={Tabular}>
                {formatNumber(entry.kcal)}
                {'\u00a0'}kcal
              </Text>
            }
            chevron={false}
            onPress={() => onEdit(entry)}
            accessibilityLabel={`${entry.name}, ${formatAmount(entry.amount, entry.unit)}, ${formatKcal(entry.kcal)}`}
            accessibilityHint="Change the amount or remove it"
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${label}`}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addRow,
            Platform.OS === 'web' && { cursor: 'pointer' },
            pressed && { backgroundColor: Colors.tint },
          ]}>
          <Ionicons name="add" size={20} color={Colors.text} />
          <Text variant="callout" style={{ fontFamily: Fonts.textSemi }}>
            Add food
          </Text>
        </Pressable>
      </Group>
    </View>
  );
}

// The trainer's plan as one row that opens in place to show the meals and notes.
function PlanCard({ plan, open, onToggle }: { plan: NutritionPlan; open: boolean; onToggle: () => void }) {
  // No-break spaces keep each value together when the line wraps.
  const targets = [
    plan.kcal ? formatKcal(plan.kcal).replace(/ /g, '\u00a0') : null,
    plan.protein_g !== null ? `P\u00a0${plan.protein_g}\u00a0g` : null,
    plan.carbs_g !== null ? `C\u00a0${plan.carbs_g}\u00a0g` : null,
    plan.fat_g !== null ? `F\u00a0${plan.fat_g}\u00a0g` : null,
  ].filter(Boolean);
  const hasMore = plan.meals.length > 0 || !!plan.notes;
  const more = plan.meals.length && plan.notes ? 'meals and notes' : plan.meals.length ? 'meals' : 'notes';
  const parts = [
    ...plan.meals.map((m) => ({ name: m.name, text: m.food })),
    ...(plan.notes ? [{ name: 'Notes', text: plan.notes }] : []),
  ];
  return (
    <Group>
      <ListRow
        title={`Plan from ${plan.trainer_name}`}
        titleLines={2}
        subtitle={
          targets.length ? (
            <Text variant="footnote" tone="secondary">
              {targets.join(' · ')}
            </Text>
          ) : undefined
        }
        leading={<IconTile icon="restaurant-outline" />}
        trailing={
          hasMore ? (
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textTertiary} />
          ) : null
        }
        chevron={false}
        onPress={hasMore ? onToggle : undefined}
        accessibilityState={{ expanded: open }}
        accessibilityHint={hasMore ? `${open ? 'Hides' : 'Shows'} the ${more}` : undefined}
        last={!(open && hasMore)}
      />
      {open && hasMore
        ? parts.map((part, i) => (
            <View key={i} style={[styles.planPart, i < parts.length - 1 && styles.planLine]}>
              <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
                {part.name}
              </Text>
              {part.text ? <Text variant="callout">{part.text}</Text> : null}
            </View>
          ))
        : null}
    </Group>
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
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: -Spacing.three,
  },
  planPart: {
    gap: 2,
    marginLeft: Spacing.three,
    paddingVertical: Spacing.tight,
    paddingRight: Spacing.three,
  },
  planLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
}));
