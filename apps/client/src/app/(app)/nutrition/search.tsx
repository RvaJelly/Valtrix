import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FoodRow, FoodSheet } from '@/components/food-sheet';
import { Body, ErrorText } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
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

  const list = (title: string, key: string, foods: Food[]) =>
    foods.length ? (
      <View key={key} style={{ gap: Spacing.two }}>
        <Text style={styles.section}>{title}</Text>
        {foods.map((f, i) => (
          <FoodRow
            key={`${key}-${f.barcode ?? f.name}-${i}`}
            food={f}
            loading={opening === `${key}-${i}`}
            onPress={() => open(f, `${key}-${i}`)}
          />
        ))}
      </View>
    ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: recentFirst ? 'Recent foods' : 'Search foods' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={Colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="For example Weet-Bix"
              placeholderTextColor={Colors.textSecondary}
              selectionColor={Colors.accent}
              accessibilityLabel="Search foods"
              autoFocus={!recentFirst}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={search}
              style={styles.searchInput}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={search}
            disabled={!query.trim() || searching}
            style={({ pressed }) => [
              styles.searchButton,
              pressed && { backgroundColor: Colors.accentPressed },
              !query.trim() && { opacity: 0.5 },
            ]}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>

        <View style={styles.shortcuts}>
          <Shortcut
            icon="barcode-outline"
            label="Scan a barcode"
            onPress={() => router.replace({ pathname: '/nutrition/scan', params: { meal, day } })}
          />
          <Shortcut icon="create-outline" label="Enter it yourself" onPress={() => enterYourself()} />
        </View>

        <ErrorText>{error}</ErrorText>

        {sections.map((s) => list(s.title, s.key, s.foods))}

        {recent && recentFirst && !recent.length && !query.trim() ? (
          <Body secondary>Foods you add will show here, so you can add them again in one tap.</Body>
        ) : null}

        {searching ? (
          <View style={styles.searching}>
            <ActivityIndicator color={Colors.textSecondary} />
            <Body secondary>Searching…</Body>
          </View>
        ) : null}

        {results && !searching ? (
          results.foods.length ? (
            <View style={{ gap: Spacing.two }}>
              {list('Products', 'results', results.foods)}
              <Text style={styles.credit}>{FOOD_CREDIT}. South African products show first.</Text>
            </View>
          ) : (
            <View style={{ gap: Spacing.two }}>
              <Body secondary>
                Nothing found for “{results.query}”. Try other words, scan the barcode, or enter it yourself.
              </Body>
            </View>
          )
        ) : null}

        {!results && !searching && query.trim() ? (
          <Text style={styles.hint}>Tap Search to look through thousands of products.</Text>
        ) : null}
      </ScrollView>

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

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      <Ionicons name={icon} size={20} color={Colors.text} />
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  content: {
    // The same side margins as the other tabs.
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.text,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  searchButton: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.accent,
  },
  searchButtonText: {
    color: Colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  shortcut: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shortcutText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  credit: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  hint: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
}));
