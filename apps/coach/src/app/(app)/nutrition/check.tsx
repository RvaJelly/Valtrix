import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
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
import { FOOD_CREDIT, FoodError, hasNutrition, lookupBarcode, searchFoods, type Food } from '@/lib/food';

// Look up any food's calories, protein, carbs and fat, by barcode or by name.
export default function CheckFood() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; foods: Food[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);

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

  // Search results can be missing details that the full product page has.
  async function open(item: Food, index: number) {
    setError(null);
    if (hasNutrition(item) || !item.barcode) return setFood(item);
    setOpening(index);
    try {
      setFood((await lookupBarcode(item.barcode)) ?? item);
    } catch (e) {
      setError(e instanceof FoodError ? e.message : "Couldn't open that one. Try again.");
    }
    setOpening(null);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Check a food' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/nutrition/scan')}
          style={({ pressed }) => [styles.scan, pressed && { backgroundColor: Colors.accentPressed }]}>
          <Ionicons name="barcode-outline" size={28} color={Colors.onAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan a barcode</Text>
            <Text style={styles.scanDetail}>Point the camera at the pack</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.onAccent} />
        </Pressable>

        <Text style={styles.or}>or search by name</Text>
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

        <ErrorText>{error}</ErrorText>
        {searching ? (
          <View style={styles.searching}>
            <ActivityIndicator color={Colors.accentText} />
            <Body secondary>Searching…</Body>
          </View>
        ) : null}

        {results && !searching ? (
          results.foods.length ? (
            <View style={{ gap: Spacing.two }}>
              {results.foods.map((f, i) => (
                <FoodRow
                  key={`${f.barcode ?? f.name}-${i}`}
                  food={f}
                  loading={opening === i}
                  onPress={() => open(f, i)}
                />
              ))}
              <Text style={styles.credit}>{FOOD_CREDIT}. South African products show first.</Text>
            </View>
          ) : (
            <Body secondary>Nothing found for “{results.query}”. Try other words or scan the barcode.</Body>
          )
        ) : null}
      </ScrollView>

      <FoodSheet mode="info" food={food} onClose={() => setFood(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 72,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.large,
    backgroundColor: Colors.accent,
  },
  scanTitle: {
    color: Colors.onAccent,
    fontSize: 17,
    fontWeight: '800',
  },
  scanDetail: {
    color: Colors.onAccent,
    fontSize: 14,
    opacity: 0.8,
  },
  or: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
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
}));
