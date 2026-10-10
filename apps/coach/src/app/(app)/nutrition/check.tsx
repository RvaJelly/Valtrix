import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { FoodRow, FoodSheet } from '@/components/food-sheet';
import { Body, ErrorText, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed, Type } from '@/constants/theme';
import { FOOD_CREDIT, FoodError, fullProduct, searchFoods, type Food } from '@/lib/food';

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

  // Products open from their full product page, which has the serving size.
  async function open(item: Food, index: number) {
    setError(null);
    if (!item.barcode) return setFood(item);
    setOpening(index);
    try {
      setFood(await fullProduct(item));
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
          style={({ pressed }) => [styles.scan, pressed && { backgroundColor: Colors.tint }]}>
          <Ionicons name="barcode-outline" size={28} color={Colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan a barcode</Text>
            <Text style={styles.scanDetail}>Point the camera at the pack</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
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
            <ActivityIndicator color={Colors.textSecondary} />
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
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.three,
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
    paddingHorizontal: Spacing.gutter,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  scanTitle: {
    color: Colors.text,
    fontFamily: Fonts.textSemi,
    fontSize: 17,
  },
  scanDetail: {
    color: Colors.textSecondary,
    fontFamily: Fonts.text,
    fontSize: 13,
  },
  or: {
    ...Type.label,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.tint,
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
    ...Type.button,
    color: Colors.onAccent,
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
