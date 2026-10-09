import { Ionicons } from '@expo/vector-icons';
import { memo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { PlanVideo } from '@/components/plan-video';
import { Sheet } from '@/components/sheet';
import { Body } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { newId } from '@/lib/chat';
import { dayMonth } from '@/lib/days';
import { isNewBest, type ActiveExercise, type ActiveSet } from '@/lib/active-workout';
import { formatWeight, restLabel, weightLabel, type WeightUnit } from '@/lib/units';

type ExerciseCardProps = {
  exercise: ActiveExercise;
  index: number;
  unit: WeightUnit;
  // Typing, Add set, Remove set.
  onChange: (index: number, next: ActiveExercise) => void;
  onTick: (index: number, setIndex: number, done: boolean) => void;
  // Where the card is, for scrolling to the next exercise.
  onLayoutY: (index: number, y: number) => void;
};

const MAX_SETS = 30;

// "57.5 × 8 · 57.5 × 8 · 55 × 7 kg": last time's sets, in the person's unit.
function lastTimeLine(last: NonNullable<ActiveExercise['last']>, unit: WeightUnit) {
  const anyWeight = last.sets.some((s) => s.weight_kg !== null && s.weight_kg > 0);
  const anyReps = last.sets.some((s) => s.reps !== null);
  const sets = last.sets.map((s) => {
    const weight = s.weight_kg !== null && s.weight_kg > 0 ? formatWeight(s.weight_kg, unit, false) : null;
    if (weight && s.reps !== null) return `${weight} × ${s.reps}`;
    if (weight) return weight;
    if (s.reps !== null) return String(s.reps);
    return '✓';
  });
  const suffix = anyWeight ? ` ${unit}` : anyReps ? ' reps' : '';
  return `Last time (${dayMonth(last.day)}): ${sets.join(' · ')}${suffix}`;
}

function targetLine(exercise: ActiveExercise, unit: WeightUnit) {
  const { target } = exercise;
  const parts = [`${target.sets} × ${target.reps}`];
  if (target.weight) {
    const weight = weightLabel(target.weight, target.weightUnit, unit);
    parts.push(weight.also ? `${weight.value} (${weight.also})` : weight.value);
  }
  parts.push(exercise.restSeconds > 0 ? `Rest ${restLabel(exercise.restSeconds)}` : 'No rest');
  return parts.join(' · ');
}

// One exercise in the live workout: what the trainer planned, last time's numbers, and a row
// per set to fill in and tick. Only redraws when its own exercise changes.
function ExerciseCardView({ exercise, index, unit, onChange, onTick, onLayoutY }: ExerciseCardProps) {
  const [info, setInfo] = useState(false);
  const { target } = exercise;
  const hasInfo = !!(target.notes || target.instructions || target.videoPath);
  const lastSet = exercise.sets[exercise.sets.length - 1];

  function changeSet(setIndex: number, changes: Partial<ActiveSet>) {
    onChange(index, { ...exercise, sets: exercise.sets.map((s, j) => (j === setIndex ? { ...s, ...changes } : s)) });
  }

  function addSet() {
    if (exercise.sets.length >= MAX_SETS) return;
    const copy: ActiveSet = {
      key: newId(),
      weight: lastSet?.weight ?? '',
      kg: lastSet?.kg ?? null,
      reps: lastSet?.reps ?? '',
      done: false,
      doneAt: null,
    };
    onChange(index, { ...exercise, sets: [...exercise.sets, copy] });
  }

  function removeSet() {
    if (exercise.sets.length <= 1 || lastSet?.done) return;
    onChange(index, { ...exercise, sets: exercise.sets.slice(0, -1) });
  }

  return (
    <View style={styles.card} onLayout={(e) => onLayoutY(index, e.nativeEvent.layout.y)}>
      <View style={styles.header}>
        <Text style={styles.number}>{index + 1}</Text>
        <Text style={styles.name}>{exercise.name}</Text>
        {hasInfo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`How to do ${exercise.name}`}
            onPress={() => setInfo(true)}
            style={({ pressed }) => [styles.info, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="information-circle-outline" size={26} color={Colors.accentText} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.target}>{targetLine(exercise, unit)}</Text>
      <Text style={styles.last}>{exercise.last ? lastTimeLine(exercise.last, unit) : 'First time — set the bar!'}</Text>

      <View style={styles.columns} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[styles.columnText, styles.setColumn]}>Set</Text>
        <Text style={[styles.columnText, styles.weightColumn]}>{unit}</Text>
        <View style={styles.times} />
        <Text style={[styles.columnText, styles.repsColumn]}>Reps</Text>
        <View style={styles.tickColumn} />
      </View>
      {exercise.sets.map((set, setIndex) => (
        <SetRow
          key={set.key}
          set={set}
          number={setIndex + 1}
          unit={unit}
          repsPlaceholder={/^\s*\d+(\s*[-–]\s*\d+)?\s*(reps?)?\s*$/i.test(target.reps) ? '–' : target.reps}
          newBest={isNewBest(exercise, set, unit)}
          testIDPrefix={`set-${index}-${setIndex}`}
          onWeight={(weight) => changeSet(setIndex, { weight: weight.replace(/[^0-9.,]/g, ''), kg: null })}
          onReps={(reps) => changeSet(setIndex, { reps: reps.replace(/\D/g, '') })}
          onTick={(done) => onTick(index, setIndex, done)}
        />
      ))}

      <View style={styles.setButtons}>
        {exercise.sets.length < MAX_SETS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add a set to ${exercise.name}`}
            testID={`add-set-${index}`}
            onPress={addSet}
            style={({ pressed }) => [styles.setButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="add" size={18} color={Colors.accentText} />
            <Text style={styles.setButtonText}>Add set</Text>
          </Pressable>
        ) : null}
        {exercise.sets.length > 1 && !lastSet?.done ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove the last set of ${exercise.name}`}
            onPress={removeSet}
            style={({ pressed }) => [styles.setButton, pressed && { backgroundColor: Colors.surfaceRaised }]}>
            <Ionicons name="remove" size={18} color={Colors.textSecondary} />
            <Text style={[styles.setButtonText, { color: Colors.textSecondary }]}>Remove set</Text>
          </Pressable>
        ) : null}
      </View>

      <Sheet visible={info} onClose={() => setInfo(false)} title={exercise.name}>
        {target.notes ? <Body>{target.notes}</Body> : null}
        {target.instructions ? <Body secondary>{target.instructions}</Body> : null}
        {target.videoPath ? <PlanVideo path={target.videoPath} label="Demo video" title={exercise.name} /> : null}
      </Sheet>
    </View>
  );
}

function SetRow({
  set,
  number,
  unit,
  repsPlaceholder,
  newBest,
  testIDPrefix,
  onWeight,
  onReps,
  onTick,
}: {
  set: ActiveSet;
  number: number;
  unit: WeightUnit;
  repsPlaceholder: string;
  newBest: boolean;
  testIDPrefix: string;
  onWeight: (text: string) => void;
  onReps: (text: string) => void;
  onTick: (done: boolean) => void;
}) {
  const reps = useRef<TextInput>(null);
  return (
    <View>
      <View style={[styles.setRow, set.done && { backgroundColor: Colors.surfaceRaised }]}>
        <Text style={[styles.setNumber, styles.setColumn]}>{number}</Text>
        <TextInput
          value={set.weight}
          onChangeText={onWeight}
          keyboardType="decimal-pad"
          placeholder="–"
          placeholderTextColor={Colors.textSecondary}
          selectionColor={Colors.accent}
          selectTextOnFocus
          returnKeyType="next"
          onSubmitEditing={() => reps.current?.focus()}
          submitBehavior="submit"
          accessibilityLabel={`Set ${number} weight in ${unit}`}
          testID={`${testIDPrefix}-weight`}
          style={[styles.input, styles.weightColumn]}
        />
        <Text style={[styles.times, styles.timesText]}>×</Text>
        <TextInput
          ref={reps}
          value={set.reps}
          onChangeText={onReps}
          keyboardType="number-pad"
          placeholder={repsPlaceholder}
          placeholderTextColor={Colors.textSecondary}
          selectionColor={Colors.accent}
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!set.done) onTick(true);
          }}
          accessibilityLabel={`Set ${number} reps`}
          testID={`${testIDPrefix}-reps`}
          style={[styles.input, styles.repsColumn]}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.done }}
          accessibilityLabel={`Set ${number} done`}
          testID={`${testIDPrefix}-tick`}
          hitSlop={8}
          onPress={() => onTick(!set.done)}
          style={styles.tickColumn}>
          <View style={[styles.tick, set.done && styles.ticked]}>
            {set.done ? <Ionicons name="checkmark" size={24} color={Colors.onAccent} /> : null}
          </View>
        </Pressable>
      </View>
      {newBest ? (
        <View style={styles.best}>
          <Ionicons name="trophy" size={14} color={Colors.accentText} />
          <Text style={styles.bestText}>New best!</Text>
        </View>
      ) : null}
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardView);

const styles = themed(() => ({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    color: Colors.onAccent,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
    overflow: 'hidden',
  },
  name: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  info: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  target: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  last: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  columnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  setColumn: {
    width: 28,
  },
  weightColumn: {
    flex: 5,
    minWidth: 80,
  },
  times: {
    width: 14,
  },
  timesText: {
    color: Colors.textSecondary,
    fontSize: 18,
    textAlign: 'center',
  },
  repsColumn: {
    flex: 4,
    minWidth: 64,
  },
  tickColumn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.one,
    borderRadius: Radius.medium,
  },
  setNumber: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
  },
  tick: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticked: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: 28 + Spacing.three,
    paddingTop: 2,
  },
  bestText: {
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '800',
  },
  setButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  setButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  setButtonText: {
    color: Colors.accentText,
    fontSize: 15,
    fontWeight: '700',
  },
}));
