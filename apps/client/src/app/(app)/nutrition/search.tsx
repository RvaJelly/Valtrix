import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodRow, FoodSheet } from '@/components/food-sheet';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconTile,
  ListRow,
  SearchField,
  Section,
  SkeletonRows,
  Text,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import {
  dayKey,
  FOOD_CREDIT,
  FoodError,
  fullProduct,
  hasNutrition,
  isDayKey,
  isMeal,
  mealForNow,
  mealLabel,
  searchFoods,
  type Food,
} from '@/lib/food';
import { addToDiary, loadMyFoods, loadRecent } from '@/lib/nutrition';

function matches(food: Food, query: string) {
  const q = query.trim().toLowerCase();
  return !q || `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(q);
}

// Find a food by name: the person's own foods and recent foods straight away, and
// products from Open Food Facts when they search.
export default function SearchFood() {
  const params = useLocalSearchParams<{ meal?: string; day?: string; mode?: string }>();
  const meal = isMeal(params.meal) ? params.meal : mealForNow();
  const day = isDayKey(params.day) ? params.day : dayKey(new Date());
  const recentFirst = params.mode === 'recent';
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Food[] | null>(null);
  const [mine, setMine] = useState<Food[]>([]);
  const [results, setResults] = useState<{ query: string; foods: Food[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Promise.all([loadRecent().catch(() => [] as Food[]), loadMyFoods().catch(() => [] as Food[])]).then(([r, m]) => {
      setRecent(r);
      setMine(m);
    });
  }, []);

  async function search() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setError(null);
    try {
      setResults({ query: q, foods: await searchFoods(q) });
    } catch (e) {
      setError(e instanceof FoodError ? e.message : "Couldn't search right now. Try again.");
    }
    setSearching(false);
  }

  function enterYourself(from?: Food | null) {
    router.push({
      pathname: '/nutrition/custom',
      params: { meal, day, barcode: from?.barcode ?? '', name: from?.name ?? query.trim(), brand: from?.brand ?? '' },
    });
  }

  // Products from a search open from their full product page, which has the serving size.
  async function open(item: Food, key: string) {
    setError(null);
    if (item.source !== 'off' || !item.barcode) return hasNutrition(item) ? setFood(item) : enterYourself(item);
    setOpening(key);
    try {
      const full = await fullProduct(item);
      if (hasNutrition(full)) setFood(full);
      else enterYourself(full);
    } catch (e) {
      setError(e instanceof FoodError ? e.message : "Couldn't open that one. Try again.");
    }
    setOpening(null);
  }

  const myMatches = mine.filter((f) => matches(f, query));
  const recentMatches = (recent ?? []).filter((f) => matches(f, query));
  const recentSection = { key: 'recent', title: 'Recent foods', foods: recentMatches };
  const mineSection = { key: 'mine', title: 'Your foods', foods: myMatches };
  // While searching, the person's own foods come first; otherwise what they had lately.
  const sections = !recentFirst && query.trim() ? [mineSection, recentSection] : [recentSection, mineSection];
  // The one orange button: search for what's typed, until it has been searched.
  const canSearch = !!query.trim() && results?.query !== query.trim();

  const list = (title: string, key: string, foods: Food[]) =>
    foods.length ? (
      <Section key={key} title={title}>
        <Group>
          {foods.map((f, i) => (
            <FoodRow
              key={`${key}-${f.barcode ?? f.name}-${i}`}
              food={f}
              grouped
              last={i === foods.length - 1}
              loading={opening === `${key}-${i}`}
              onPress={() => open(f, `${key}-${i}`)}
            />
          ))}
        </Group>
      </Section>
    ) : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: recentFirst ? 'Recent foods' : 'Search foods' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods, like Weet-Bix"
          accessibilityLabel="Search foods"
          autoFocus={!recentFirst}
          onSubmitEditing={search}
        />

        <Group>
          <ListRow
            title="Scan a barcode"
            leading={<IconTile icon="barcode-outline" />}
            onPress={() => router.replace({ pathname: '/nutrition/scan', params: { meal, day } })}
            compact
          />
          <ListRow
            title="Enter it yourself"
            leading={<IconTile icon="create-outline" />}
            onPress={() => enterYourself()}
            compact
            last
          />
        </Group>

        <ErrorText>{error}</ErrorText>

        {sections.map((s) => list(s.title, s.key, s.foods))}

        {searching ? (
          <Section title="Products">
            <SkeletonRows count={4} avatar />
          </Section>
        ) : null}

        {results && !searching ? (
          results.foods.length ? (
            <View style={{ gap: Spacing.tight }}>
              {list('Products', 'results', results.foods)}
              <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
                {FOOD_CREDIT}. South African products show first.
              </Text>
            </View>
          ) : (
            <EmptyState
              compact
              icon="search-outline"
              title={`Nothing found for “${results.query}”`}
              message="Try other words, scan the barcode, or enter it yourself."
            />
          )
        ) : null}

        {recent && recentFirst && !recent.length && !query.trim() ? (
          <EmptyState
            compact
            icon="time-outline"
            title="No recent foods"
            message="Foods you add show here, so you can add them again in one tap."
          />
        ) : null}
      </ScrollView>

      {canSearch && !searching ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Button
            title={`Search for “${query.trim()}”`}
            icon="search-outline"
            onPress={search}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      <FoodSheet
        mode="add"
        food={food}
        actionLabel={`Add to ${mealLabel(meal)}`}
        onClose={() => setFood(null)}
        onSubmit={async (amount, unit) => {
          if (!food) return;
          await addToDiary(food, amount, unit, meal, day);
          setFood(null);
          router.dismissTo('/nutrition');
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    // The same side margins as the other tabs.
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.four,
  },
  footer: {
    paddingTop: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  footerButton: {
    width: '100%',
    maxWidth: Layout.maxClient - Spacing.gutter * 2,
    alignSelf: 'center',
  },
}));
