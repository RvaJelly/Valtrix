import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';

import { DaySummary } from '@/components/day-summary';
import { Body, Button, ErrorText, TextField } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { Client } from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import {
  dayKey,
  dayTitle,
  formatAmount,
  formatKcal,
  formatNumber,
  fromDayKey,
  kcalFromMacros,
  MEALS,
  shiftDay,
  totalsOf,
  type DiaryEntry,
  type Targets,
} from '@/lib/food';
import { deletePlan, loadClientDiary, loadPlan, savePlan, type NutritionPlan } from '@/lib/nutrition';

type Draft = {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  meals: { name: string; food: string }[];
  notes: string;
};

const MAX_MEALS = 12;

function draftFrom(plan: NutritionPlan | null): Draft {
  const text = (n: number | null) => (n === null || n === undefined ? '' : String(n));
  return {
    kcal: text(plan?.kcal ?? null),
    protein: text(plan?.protein_g ?? null),
    carbs: text(plan?.carbs_g ?? null),
    fat: text(plan?.fat_g ?? null),
    // A new plan starts with the usual meals to fill in.
    meals: plan
      ? plan.meals.map((m) => ({ name: m.name, food: m.food ?? '' }))
      : MEALS.map((m) => ({ name: m.label, food: '' })),
    notes: plan?.notes ?? '',
  };
}

// Whole numbers, or null when left empty.
function whole(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : undefined;
}

function targetsOf(plan: NutritionPlan | null | undefined): Targets | null {
  if (!plan || (!plan.kcal && plan.protein_g === null && plan.carbs_g === null && plan.fat_g === null)) return null;
  return { kcal: plan.kcal, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fat_g: plan.fat_g };
}

// A client's nutrition plan (which they see in the Voltrix app) and, once they have
// accepted the invite there, what they logged in their food diary. onUnsavedChange says whether
// the plan editor holds changes that aren't saved yet.
export function ClientNutrition({
  client,
  onUnsavedChange,
}: {
  client: Client;
  onUnsavedChange?: (unsaved: boolean) => void;
}) {
  const [plan, setPlan] = useState<NutritionPlan | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlan(client.id).then(setPlan, () => setLoadError('Could not load the nutrition plan. Try again later.'));
  }, [client.id]);

  function setDraft(next: Draft | null) {
    setDraftState(next);
    onUnsavedChange?.(!!next && JSON.stringify(next) !== JSON.stringify(draftFrom(plan ?? null)));
  }

  function edit(next: Partial<Draft>) {
    if (draft) setDraft({ ...draft, ...next });
  }

  function editMeal(index: number, next: Partial<Draft['meals'][number]>) {
    if (draft) setDraft({ ...draft, meals: draft.meals.map((m, i) => (i === index ? { ...m, ...next } : m)) });
  }

  async function save() {
    if (!draft) return;
    const [kcal, protein, carbs, fat] = [draft.kcal, draft.protein, draft.carbs, draft.fat].map(whole);
    if ([kcal, protein, carbs, fat].includes(undefined)) {
      return setError('Use whole numbers for calories, protein, carbs and fat.');
    }
    if (kcal != null && (kcal < 500 || kcal > 10000)) {
      return setError('Daily calories should be between 500 and 10 000.');
    }
    if ((protein ?? 0) > 1000 || (carbs ?? 0) > 2000 || (fat ?? 0) > 1000) {
      return setError('Those grams look too high. Check them.');
    }
    const meals = draft.meals
      .map((m, i) => ({ name: (m.name.trim() || `Meal ${i + 1}`).slice(0, 100), food: m.food.trim().slice(0, 1000) }))
      .filter((m) => m.food);
    const notes = draft.notes.trim().slice(0, 4000) || null;
    if (kcal == null && protein == null && carbs == null && fat == null && !meals.length && !notes) {
      return setError('Add daily calories, a meal or a note first.');
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await savePlan(
        client.id,
        { kcal: kcal ?? null, protein_g: protein ?? null, carbs_g: carbs ?? null, fat_g: fat ?? null, meals, notes },
        plan?.id,
      );
      setPlan(saved);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan. Try again.');
    }
    setSaving(false);
  }

  async function remove() {
    if (!plan) return;
    const ok = await confirm(
      'Remove nutrition plan?',
      `${client.first_name} will no longer see it in the Voltrix app.`,
      'Remove',
    );
    if (!ok) return;
    try {
      await deletePlan(plan.id);
      setPlan(null);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the plan. Try again.');
    }
  }

  const macroKcal = draft
    ? kcalFromMacros(whole(draft.protein) ?? 0, whole(draft.carbs) ?? 0, whole(draft.fat) ?? 0)
    : 0;
  const draftKcal = draft ? whole(draft.kcal) : null;
  const emptyMeals = draft ? draft.meals.filter((m) => !m.food.trim()).length : 0;

  return (
    <>
      <Text style={styles.section}>Nutrition plan</Text>
      {plan === undefined && !loadError ? <ActivityIndicator color={Colors.accentText} /> : null}
      <ErrorText>{loadError}</ErrorText>

      {draft ? (
        <View style={styles.card}>
          <TextField
            label="Daily calories (kcal)"
            value={draft.kcal}
            onChangeText={(t) => edit({ kcal: t.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            placeholder="For example 2000"
            maxLength={5}
          />
          <View style={styles.row}>
            {(
              [
                ['protein', 'Protein g'],
                ['carbs', 'Carbs g'],
                ['fat', 'Fat g'],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={{ flex: 1 }}>
                <TextField
                  label={label}
                  value={draft[key]}
                  onChangeText={(t) => edit({ [key]: t.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="0"
                  maxLength={4}
                />
              </View>
            ))}
          </View>
          {macroKcal > 0 ? (
            <Body secondary style={{ fontSize: 14, lineHeight: 20 }}>
              Protein, carbs and fat add up to {formatKcal(macroKcal)}.
              {draftKcal && Math.abs(draftKcal - macroKcal) >= 1
                ? ` That’s ${formatKcal(Math.abs(draftKcal - macroKcal))} ${
                    macroKcal < draftKcal ? 'under' : 'over'
                  } the daily calories.`
                : ''}
            </Body>
          ) : (
            <Body secondary style={{ fontSize: 14 }}>
              Protein and carbs have 4 kcal a gram, fat has 9.
            </Body>
          )}

          <Text style={styles.label}>Meals</Text>
          {draft.meals.map((meal, i) => (
            <View key={i} style={styles.mealEditor}>
              <View style={styles.mealEditorTop}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={`Meal ${i + 1}`}
                    value={meal.name}
                    onChangeText={(t) => editMeal(i, { name: t })}
                    placeholder="For example Breakfast"
                    maxLength={100}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${meal.name || `meal ${i + 1}`}`}
                  onPress={() => edit({ meals: draft.meals.filter((_, j) => j !== i) })}
                  hitSlop={8}
                  style={styles.removeMeal}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </Pressable>
              </View>
              <TextField
                label="What to eat"
                value={meal.food}
                onChangeText={(t) => editMeal(i, { food: t })}
                placeholder="For example: 3 eggs, 2 slices of brown toast, coffee"
                multiline
                maxLength={1000}
                style={{ minHeight: 76, paddingTop: Spacing.three, textAlignVertical: 'top' }}
              />
            </View>
          ))}
          {draft.meals.length < MAX_MEALS ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => edit({ meals: [...draft.meals, { name: '', food: '' }] })}
              style={({ pressed }) => [styles.addMeal, pressed && { opacity: 0.6 }]}>
              <Ionicons name="add-circle" size={22} color={Colors.accentText} />
              <Text style={styles.addMealText}>Add a meal</Text>
            </Pressable>
          ) : null}

          <TextField
            label="Plan notes"
            value={draft.notes}
            onChangeText={(t) => edit({ notes: t })}
            placeholder="For example: drink 2 litres of water a day"
            multiline
            maxLength={4000}
            style={{ minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' }}
          />
          {emptyMeals ? (
            <Body secondary style={{ fontSize: 14, lineHeight: 20 }}>
              {emptyMeals === 1
                ? 'The meal with nothing in “What to eat” won’t be saved.'
                : 'Meals with nothing in “What to eat” won’t be saved.'}
            </Body>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button title="Save plan" onPress={save} loading={saving} />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => {
              setDraft(null);
              setError(null);
            }}
            disabled={saving}
          />
          {plan ? (
            <Pressable
              accessibilityRole="button"
              onPress={remove}
              disabled={saving}
              style={({ pressed }) => [styles.removePlan, pressed && { opacity: 0.6 }]}>
              <Text style={styles.removePlanText}>Remove plan</Text>
            </Pressable>
          ) : null}
        </View>
      ) : plan ? (
        <PlanView plan={plan} client={client} onEdit={() => setDraft(draftFrom(plan))} />
      ) : plan === null ? (
        <View style={styles.card}>
          <Body secondary style={{ fontSize: 15 }}>
            {client.user_id
              ? `Set ${client.first_name}'s daily calories, protein, carbs and fat, and what to eat at each meal. They see it in the Voltrix app.`
              : `Set ${client.first_name}'s daily calories, protein, carbs and fat, and what to eat at each meal. They'll see it once they accept your invite in the Voltrix app.`}
          </Body>
          <Button title="Set a nutrition plan" onPress={() => setDraft(draftFrom(null))} />
        </View>
      ) : null}

      {client.user_id ? <FoodDiary client={client} targets={targetsOf(plan)} /> : null}
    </>
  );
}

function PlanView({ plan, client, onEdit }: { plan: NutritionPlan; client: Client; onEdit: () => void }) {
  const macros = [
    ['Protein', plan.protein_g],
    ['Carbs', plan.carbs_g],
    ['Fat', plan.fat_g],
  ] as const;
  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.label}>Daily calories</Text>
        <Text style={styles.bigNumber}>{plan.kcal ? formatKcal(plan.kcal) : 'Not set'}</Text>
      </View>
      <View style={styles.row}>
        {macros.map(([label, grams]) => (
          <View key={label} style={styles.tile}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.tileValue}>{grams === null ? '–' : `${grams} g`}</Text>
          </View>
        ))}
      </View>
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
      <Body secondary style={{ fontSize: 13 }}>
        {client.user_id
          ? `${client.first_name} sees this plan in the Voltrix app.`
          : `${client.first_name} will see this plan once they accept your invite in the Voltrix app.`}
      </Body>
      <Button title="Edit plan" variant="secondary" onPress={onEdit} />
    </View>
  );
}

function FoodDiary({ client, targets }: { client: Client; targets: Targets | null }) {
  // The date on the phone, checked again when the page shows or the app comes back.
  const [today, setToday] = useState(() => dayKey(new Date()));
  // The day picked with the arrows; null is today, whichever day that is.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const [data, setData] = useState<{ day: string; entries: DiaryEntry[] } | null>(null);
  const [failedDay, setFailedDay] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const check = () => setToday(dayKey(new Date()));
      check();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') check();
      });
      return () => subscription.remove();
    }, []),
  );

  // The shown day and the six before it, for the week strip. Loaded again each time the
  // page shows, so food the client logged since then appears.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadClientDiary(client.id, shiftDay(day, -6), day).then(
        (entries) => {
          if (alive) setData({ day, entries });
        },
        () => {
          if (alive) setFailedDay(day);
        },
      );
      return () => {
        alive = false;
      };
    }, [client.id, day]),
  );

  // Going back to today's date follows today from then on.
  function go(key: string) {
    setPicked(key === today ? null : key);
  }

  const week = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 6));
  const shown = data?.day === day ? data.entries : null;
  const onDay = (shown ?? []).filter((e) => e.day === day);

  return (
    <>
      <Text style={[styles.section, { marginTop: Spacing.two }]}>Food diary</Text>
      <View style={styles.dayNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Day before"
          onPress={() => go(shiftDay(day, -1))}
          hitSlop={8}
          style={({ pressed }) => [styles.dayButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={day === today ? 'Today' : `${dayTitle(day, fromDayKey(today))}. Go to today`}
          onPress={() => setPicked(null)}
          style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.dayTitle}>{dayTitle(day, fromDayKey(today))}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Day after"
          onPress={() => go(shiftDay(day, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.dayButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </Pressable>
      </View>

      {failedDay === day && !shown ? (
        <ErrorText>Could not load the food diary. Check your internet connection and try again.</ErrorText>
      ) : null}
      {!shown && failedDay !== day ? <ActivityIndicator color={Colors.accentText} /> : null}

      {shown ? (
        <>
          <View style={styles.week}>
            {week.map((key) => {
              const kcal = totalsOf(shown.filter((e) => e.day === key)).kcal;
              const logged = shown.some((e) => e.day === key);
              const selected = key === day;
              const weekday = fromDayKey(key).toLocaleDateString(undefined, { weekday: 'short' });
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${dayTitle(key, fromDayKey(today))}: ${logged ? formatKcal(kcal) : 'nothing logged'}`}
                  onPress={() => go(key)}
                  style={[styles.weekDay, selected && { backgroundColor: Colors.accent }]}>
                  <Text style={[styles.weekName, selected && { color: Colors.onAccent }]}>{weekday}</Text>
                  <Text style={[styles.weekKcal, selected && { color: Colors.onAccent }]} numberOfLines={1}>
                    {logged ? formatNumber(kcal) : '–'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <DaySummary totals={totalsOf(onDay)} targets={targets} />
          {onDay.length === 0 ? (
            <Body secondary>{client.first_name} hasn’t logged any food on this day.</Body>
          ) : (
            MEALS.map((meal) => {
              const items = onDay.filter((e) => e.meal === meal.key);
              if (!items.length) return null;
              return (
                <View key={meal.key} style={styles.meal}>
                  <View style={styles.mealHeader}>
                    <Text style={styles.mealTitle}>{meal.label}</Text>
                    <Text style={styles.mealKcal}>{formatKcal(totalsOf(items).kcal)}</Text>
                  </View>
                  {items.map((e) => (
                    <View
                      key={e.id}
                      style={styles.food}
                      accessible
                      accessibilityLabel={`${e.name}, ${formatAmount(e.amount, e.unit)}, ${formatKcal(e.kcal)}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.foodName} numberOfLines={2}>
                          {e.name}
                        </Text>
                        <Text style={styles.foodMeta} numberOfLines={1}>
                          {[e.brand, formatAmount(e.amount, e.unit)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={styles.foodKcal}>{formatNumber(e.kcal)}</Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}
        </>
      ) : null}
    </>
  );
}

const styles = themed(() => ({
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  bigNumber: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  tile: {
    flex: 1,
    gap: 2,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  tileValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
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
  mealEditor: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.background,
  },
  mealEditorTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  removeMeal: {
    width: 48,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  addMealText: {
    color: Colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  removePlan: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  removePlanText: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dayTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  week: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.surface,
  },
  weekName: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  weekKcal: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  meal: {
    padding: Spacing.three,
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
    fontSize: 16,
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
    paddingVertical: Spacing.two,
  },
  foodName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  foodMeta: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  foodKcal: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
}));
