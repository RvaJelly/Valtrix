import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { DaySummary } from '@/components/day-summary';
import {
  Button,
  Card,
  Divider,
  ErrorText,
  Group,
  IconButton,
  Section,
  Skeleton,
  StatStrip,
  Text,
  TextField,
} from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import type { Client } from '@/lib/clients';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
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
import { weekdayShort } from '@/lib/format';
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
      setError(plainError(e, 'Could not save the plan. Try again.'));
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
      setError(plainError(e, 'Could not remove the plan. Try again.'));
    }
  }

  const macroKcal = draft
    ? kcalFromMacros(whole(draft.protein) ?? 0, whole(draft.carbs) ?? 0, whole(draft.fat) ?? 0)
    : 0;
  const draftKcal = draft ? whole(draft.kcal) : null;
  const emptyMeals = draft ? draft.meals.filter((m) => !m.food.trim()).length : 0;

  return (
    <Section
      title="Nutrition plan"
      action={{
        label: 'Check a food',
        onPress: () => router.push('/nutrition/check'),
        accessibilityLabel: 'Check a food: look up calories and macros',
      }}>
      {plan === undefined && !loadError ? (
        <Card style={{ gap: Spacing.tight }}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="60%" height={28} />
          <Skeleton width="100%" height={14} />
        </Card>
      ) : null}
      <ErrorText>{loadError}</ErrorText>

      {draft ? (
        <Card style={{ gap: Spacing.three }}>
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
                ['protein', 'Protein (g)'],
                ['carbs', 'Carbs (g)'],
                ['fat', 'Fat (g)'],
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
          <Text variant="footnote" tone="secondary">
            {macroKcal > 0
              ? `Protein, carbs and fat add up to ${formatKcal(macroKcal)}.${
                  draftKcal && Math.abs(draftKcal - macroKcal) >= 1
                    ? ` That’s ${formatKcal(Math.abs(draftKcal - macroKcal))} ${
                        macroKcal < draftKcal ? 'under' : 'over'
                      } the daily calories.`
                    : ''
                }`
              : 'Protein and carbs have 4 kcal a gram, fat has 9.'}
          </Text>

          <Divider />
          <Text variant="label" tone="secondary" accessibilityRole="header">
            Meals
          </Text>
          {draft.meals.map((meal, i) => (
            <View key={i} style={[styles.mealEditor, i > 0 && styles.mealEditorLine]}>
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
                <IconButton
                  icon="trash-outline"
                  tone="secondary"
                  label={`Remove ${meal.name || `meal ${i + 1}`}`}
                  onPress={() => edit({ meals: draft.meals.filter((_, j) => j !== i) })}
                  style={{ marginBottom: 4 }}
                />
              </View>
              <TextField
                label="What to eat"
                value={meal.food}
                onChangeText={(t) => editMeal(i, { food: t })}
                placeholder="For example: 3 eggs, 2 slices of brown toast, coffee"
                multiline
                maxLength={1000}
                style={styles.multiline}
              />
            </View>
          ))}
          {draft.meals.length < MAX_MEALS ? (
            <Button
              title="Add a meal"
              icon="add"
              variant="ghost"
              size="medium"
              onPress={() => edit({ meals: [...draft.meals, { name: '', food: '' }] })}
              style={{ alignSelf: 'flex-start', marginLeft: -Spacing.three }}
            />
          ) : null}

          <Divider />
          <TextField
            label="Plan notes"
            value={draft.notes}
            onChangeText={(t) => edit({ notes: t })}
            placeholder="For example: drink 2 litres of water a day"
            multiline
            maxLength={4000}
            style={styles.multiline}
          />
          {emptyMeals ? (
            <Text variant="footnote" tone="secondary">
              {emptyMeals === 1
                ? 'The meal with nothing in “What to eat” won’t be saved.'
                : 'Meals with nothing in “What to eat” won’t be saved.'}
            </Text>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <View style={{ gap: Spacing.tight }}>
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
            {plan ? <Button title="Remove plan" variant="destructive" onPress={remove} disabled={saving} /> : null}
          </View>
        </Card>
      ) : plan ? (
        <PlanView plan={plan} client={client} onEdit={() => setDraft(draftFrom(plan))} />
      ) : plan === null ? (
        <Card style={{ gap: Spacing.three }}>
          <Text variant="callout" tone="secondary">
            {client.user_id
              ? `Set ${client.first_name}’s daily calories, protein, carbs and fat, and what to eat at each meal. They see it in the Voltrix app.`
              : `Set ${client.first_name}’s daily calories, protein, carbs and fat, and what to eat at each meal. They’ll see it once they accept your invite in the Voltrix app.`}
          </Text>
          <Button
            title="Set a nutrition plan"
            icon="add"
            variant="secondary"
            size="medium"
            onPress={() => setDraft(draftFrom(null))}
          />
        </Card>
      ) : null}

      {client.user_id ? <FoodDiary client={client} targets={targetsOf(plan)} /> : null}
    </Section>
  );
}

function PlanView({ plan, client, onEdit }: { plan: NutritionPlan; client: Client; onEdit: () => void }) {
  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" tone="secondary">
          Daily calories
        </Text>
        <Text variant="stat" style={Tabular}>
          {plan.kcal ? formatKcal(plan.kcal) : 'Not set'}
        </Text>
      </View>
      <StatStrip
        items={[
          { value: plan.protein_g === null ? '–' : `${plan.protein_g} g`, label: 'Protein' },
          { value: plan.carbs_g === null ? '–' : `${plan.carbs_g} g`, label: 'Carbs' },
          { value: plan.fat_g === null ? '–' : `${plan.fat_g} g`, label: 'Fat' },
        ]}
      />
      {plan.meals.length || plan.notes ? (
        <View>
          {plan.meals.map((m, i) => (
            <View key={i} style={styles.planMeal}>
              <Text variant="rowTitle">{m.name}</Text>
              {m.food ? <Text variant="callout">{m.food}</Text> : null}
            </View>
          ))}
          {plan.notes ? (
            <View style={styles.planMeal}>
              <Text variant="rowTitle">Notes</Text>
              <Text variant="callout">{plan.notes}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Text variant="footnote" tone="secondary">
        {client.user_id
          ? `${client.first_name} sees this plan in the Voltrix app.`
          : `${client.first_name} will see this plan once they accept your invite in the Voltrix app.`}
      </Text>
      <Button title="Edit plan" variant="secondary" size="medium" icon="create-outline" onPress={onEdit} />
    </Card>
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
    <View style={{ gap: Spacing.tight, marginTop: Spacing.three }}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        Food diary
      </Text>
      <View style={styles.dayNav}>
        <IconButton icon="chevron-back" variant="tonal" label="Day before" onPress={() => go(shiftDay(day, -1))} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={day === today ? 'Today' : `${dayTitle(day, fromDayKey(today))}. Go to today`}
          onPress={() => setPicked(null)}
          style={styles.dayTitle}>
          <Text variant="headline">{dayTitle(day, fromDayKey(today))}</Text>
        </Pressable>
        <IconButton icon="chevron-forward" variant="tonal" label="Day after" onPress={() => go(shiftDay(day, 1))} />
      </View>

      {failedDay === day && !shown ? (
        <ErrorText>Could not load the food diary. Check your internet connection and try again.</ErrorText>
      ) : null}
      {!shown && failedDay !== day ? <Skeleton height={56} radius={Radius.large} /> : null}

      {shown ? (
        <>
          <View style={styles.week}>
            {week.map((key) => {
              const kcal = totalsOf(shown.filter((e) => e.day === key)).kcal;
              const logged = shown.some((e) => e.day === key);
              const selected = key === day;
              const weekday = weekdayShort(fromDayKey(key));
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${dayTitle(key, fromDayKey(today))}: ${logged ? formatKcal(kcal) : 'nothing logged'}`}
                  onPress={() => go(key)}
                  style={({ pressed }) => [
                    styles.weekDay,
                    pressed && { backgroundColor: Colors.tint },
                    selected && { backgroundColor: Colors.text },
                  ]}>
                  <Text variant="label" tone="secondary" style={selected && { color: Colors.background }}>
                    {weekday}
                  </Text>
                  <Text
                    variant="footnote"
                    style={[styles.weekKcal, selected && { color: Colors.background }]}
                    numberOfLines={1}>
                    {logged ? formatNumber(kcal) : '–'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <DaySummary totals={totalsOf(onDay)} targets={targets} />
          {onDay.length === 0 ? (
            <Text variant="callout" tone="secondary">
              {client.first_name} hasn’t logged any food on this day.
            </Text>
          ) : (
            MEALS.map((meal) => {
              const items = onDay.filter((e) => e.meal === meal.key);
              if (!items.length) return null;
              return (
                <Group key={meal.key}>
                  <View style={styles.mealHeader}>
                    <Text variant="headline" style={{ flex: 1 }}>
                      {meal.label}
                    </Text>
                    <Text variant="footnote" tone="secondary" style={Tabular}>
                      {formatKcal(totalsOf(items).kcal)}
                    </Text>
                  </View>
                  {items.map((e) => (
                    <View
                      key={e.id}
                      style={styles.food}
                      accessible
                      accessibilityLabel={`${e.name}, ${formatAmount(e.amount, e.unit)}, ${formatKcal(e.kcal)}`}>
                      <View style={{ flex: 1 }}>
                        <Text variant="rowTitle" numberOfLines={2}>
                          {e.name}
                        </Text>
                        <Text variant="footnote" tone="secondary" numberOfLines={1}>
                          {[e.brand, formatAmount(e.amount, e.unit)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text variant="callout" style={Tabular}>
                        {formatNumber(e.kcal)}
                      </Text>
                    </View>
                  ))}
                </Group>
              );
            })
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  multiline: {
    minHeight: 88,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  mealEditor: {
    gap: Spacing.tight,
  },
  mealEditorLine: {
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  mealEditorTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  planMeal: {
    gap: 2,
    paddingVertical: Spacing.tight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayTitle: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  weekKcal: {
    ...Tabular,
    fontFamily: Fonts.textMedium,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  food: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.two,
  },
}));
