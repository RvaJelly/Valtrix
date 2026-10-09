import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { DaySummary } from '@/components/day-summary';
import { FoodSheet } from '@/components/food-sheet';
import { Sheet } from '@/components/sheet';
import { Button, EmptyState, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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
import { changeAmount, hasTrainer, loadDay, loadPlans, removeFromDiary, type NutritionPlan } from '@/lib/nutrition';

type IconName = ComponentProps<typeof Ionicons>['name'];
type AddOption = 'scan' | 'search' | 'recent' | 'custom';

const ADD_OPTIONS: { key: AddOption; label: string; detail: string; icon: IconName }[] = [
  { key: 'scan', label: 'Scan a barcode', detail: 'Point your camera at the pack', icon: 'barcode-outline' },
  { key: 'search', label: 'Search', detail: 'Find a food by its name', icon: 'search' },
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
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accentText} />}>
        <View style={styles.dayNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Day before"
            onPress={() => go(shiftDay(day, -1))}
            hitSlop={8}
            style={({ pressed }) => [styles.dayButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={day === today ? 'Today' : `${title}. Go to today`}
            onPress={() => setPicked(null)}
            style={styles.dayLabel}>
            <Text style={styles.dayTitle}>{title}</Text>
            <Text style={styles.daySub}>
              {fromDayKey(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Day after"
            onPress={() => go(shiftDay(day, 1))}
            hitSlop={8}
            style={({ pressed }) => [styles.dayButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="chevron-forward" size={24} color={Colors.text} />
          </Pressable>
        </View>

        {/* A web page can't be pulled down to refresh, so there's always a button. */}
        {failed && entries ? (
          <View style={{ gap: Spacing.two }}>
            <ErrorText>Could not refresh your food diary. Check your internet connection.</ErrorText>
            <Button title="Try again" variant="secondary" onPress={retry} loading={retrying} />
          </View>
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
        ) : (
          <ActivityIndicator color={Colors.accentText} style={{ marginVertical: Spacing.five }} />
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
            <Ionicons name="eye-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.noteText}>Your trainer can see what you log here.</Text>
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
        <View style={{ gap: Spacing.one }}>
          {ADD_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={option.detail}
              onPress={() => addWith(option.key)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon} size={24} color={Colors.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDetail}>{option.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </Pressable>
          ))}
        </View>
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
    </>
  );
}

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
    <View style={styles.meal}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{label}</Text>
        {entries.length ? <Text style={styles.mealKcal}>{formatKcal(kcal)}</Text> : null}
      </View>
      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          accessibilityLabel={`${entry.name}, ${formatAmount(entry.amount, entry.unit)}, ${formatKcal(entry.kcal)}`}
          accessibilityHint="Change the amount or remove it"
          onPress={() => onEdit(entry)}
          style={({ pressed }) => [styles.food, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.foodName} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.foodMeta} numberOfLines={1}>
              {[entry.brand, formatAmount(entry.amount, entry.unit)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text style={styles.foodKcal}>{formatNumber(entry.kcal)}</Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add food to ${label}`}
        onPress={onAdd}
        style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.6 }]}>
        <Ionicons name="add-circle" size={22} color={Colors.accentText} />
        <Text style={styles.addText}>Add food</Text>
      </Pressable>
    </View>
  );
}

function PlanCard({ plan, open, onToggle }: { plan: NutritionPlan; open: boolean; onToggle: () => void }) {
  const targets = [
    plan.kcal ? formatKcal(plan.kcal) : null,
    plan.protein_g !== null ? `Protein ${plan.protein_g} g` : null,
    plan.carbs_g !== null ? `Carbs ${plan.carbs_g} g` : null,
    plan.fat_g !== null ? `Fat ${plan.fat_g} g` : null,
  ].filter(Boolean);
  const hasMore = plan.meals.length > 0 || !!plan.notes;
  const more = plan.meals.length && plan.notes ? 'meals and notes' : plan.meals.length ? 'meals' : 'notes';
  return (
    <View style={styles.plan}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        disabled={!hasMore}
        style={styles.planHeader}>
        <View style={styles.planIcon}>
          <Ionicons name="restaurant" size={20} color={Colors.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.planTitle}>Your plan from {plan.trainer_name}</Text>
          {targets.length ? <Text style={styles.planTargets}>{targets.join(' · ')}</Text> : null}
          {hasMore ? <Text style={styles.planToggle}>{open ? `Hide ${more}` : `See ${more}`}</Text> : null}
        </View>
        {hasMore ? (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
        ) : null}
      </Pressable>
      {open && hasMore ? (
        <View style={{ gap: Spacing.two }}>
          {plan.meals.map((m, i) => (
            <View key={i} style={styles.planMeal}>
              <Text style={styles.planMealName}>{m.name}</Text>
              {m.food ? <Text style={styles.planMealFood}>{m.food}</Text> : null}
            </View>
          ))}
          {plan.notes ? (
            <View style={styles.planMeal}>
              <Text style={styles.planMealName}>Notes</Text>
              <Text style={styles.planMealFood}>{plan.notes}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  content: {
    // The same side margins as the other tabs.
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dayLabel: {
    flex: 1,
    alignItems: 'center',
  },
  dayTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  daySub: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  meal: {
    padding: Spacing.three,
    paddingBottom: Spacing.one,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  mealTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  mealKcal: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  food: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    marginHorizontal: -Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  foodName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  foodMeta: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  foodKcal: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  addText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  noteText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  optionLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  optionDetail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  plan: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  planTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  planToggle: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  planTargets: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  planMeal: {
    gap: 2,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  planMealName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  planMealFood: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
}));
