import { Ionicons } from '@expo/vector-icons';
import { Fragment, memo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { PlanVideo } from '@/components/plan-video';
import { Sheet } from '@/components/sheet';
import { Body, Button, IconButton, StatusPill, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, Type, themed } from '@/constants/theme';
import { newId } from '@/lib/chat';
import { haptic } from '@/lib/haptics';
import { dayMonth } from '@/lib/days';
import { isNewBest, plannedReps, type ActiveExercise, type ActiveSet } from '@/lib/active-workout';
import { formatWeight, parseNumber, restLabel, trim, weightLabel, type WeightUnit } from '@/lib/units';

type ExerciseCardProps = {
  exercise: ActiveExercise;
  index: number;
  unit: WeightUnit;
  // Save was tried: nothing can change until it is saved or the person keeps logging.
  locked: boolean;
  // The set the person is on, drawn large with steppers and the screen's one orange button. Null
  // when the person is on another exercise.
  current: number | null;
  // Typing, steppers, Add set, Remove set.
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

// One stepper press: weights move to the next 2.5 kg or 5 lb mark, so 57.5 → 60 and 220.46 → 225.
function stepWeight(text: string, unit: WeightUnit, direction: 1 | -1) {
  const step = unit === 'kg' ? 2.5 : 5;
  const value = parseNumber(text) ?? 0;
  const marks = value / step;
  const next = direction > 0 ? (Math.floor(marks + 1e-9) + 1) * step : (Math.ceil(marks - 1e-9) - 1) * step;
  return trim(Math.max(0, next));
}

// Reps move by one. An empty field starts from the plan's reps.
function stepReps(text: string, planned: number | null, direction: 1 | -1) {
  const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  if (value === null) return direction > 0 ? String(planned ?? 1) : text;
  return String(Math.max(0, Math.min(1000, value + direction)));
}

// One exercise in the live workout: what the trainer planned, last time's numbers, the set the
// person is on (large) and a compact row for every other set. Only redraws when its own exercise
// or its current set changes.
function ExerciseCardView({ exercise, index, unit, locked, current, onChange, onTick, onLayoutY }: ExerciseCardProps) {
  const [info, setInfo] = useState(false);
  const { target } = exercise;
  const hasInfo = !!(target.notes || target.instructions || target.videoPath);
  const lastSet = exercise.sets[exercise.sets.length - 1];
  const repsPlaceholder = /^\s*\d+(\s*[-–]\s*\d+)?\s*(reps?)?\s*$/i.test(target.reps) ? '–' : target.reps;
  const planned = plannedReps(target.reps);
  const done = exercise.sets.filter((s) => s.done).length;
  const isCurrent = (setIndex: number) => setIndex === current && !locked && !exercise.sets[setIndex]?.done;
  // The column names sit over the compact rows, so they come after the current set when it is first.
  const firstRow = exercise.sets.findIndex((_, setIndex) => !isCurrent(setIndex));

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
        <View style={[styles.number, done === exercise.sets.length && styles.numberDone]}>
          {done === exercise.sets.length ? (
            <Ionicons name="checkmark" size={16} color={Colors.background} />
          ) : (
            <Text variant="footnote" style={styles.numberText}>
              {index + 1}
            </Text>
          )}
        </View>
        <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
          {exercise.name}
        </Text>
        {hasInfo ? (
          <IconButton
            icon="information-circle-outline"
            label={`How to do ${exercise.name}`}
            onPress={() => setInfo(true)}
            style={{ marginRight: -Spacing.two }}
          />
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="callout" style={{ fontFamily: Fonts.textMedium }}>
          {targetLine(exercise, unit)}
        </Text>
        <Text variant="footnote" tone="secondary">
          {exercise.last ? lastTimeLine(exercise.last, unit) : 'First time: today sets your baseline.'}
        </Text>
      </View>

      <View style={styles.sets}>
        {exercise.sets.map((set, setIndex) => {
          const shared = {
            set,
            name: exercise.name,
            number: setIndex + 1,
            unit,
            repsPlaceholder,
            testIDPrefix: `set-${index}-${setIndex}`,
            onWeight: (weight: string) => changeSet(setIndex, { weight: weight.replace(/[^0-9.,]/g, ''), kg: null }),
            onReps: (reps: string) => changeSet(setIndex, { reps: reps.replace(/\D/g, '') }),
            onTick: (on: boolean) => onTick(index, setIndex, on),
          };
          return isCurrent(setIndex) ? (
            <CurrentSet
              key={set.key}
              {...shared}
              of={exercise.sets.length}
              onStepWeight={(direction) =>
                changeSet(setIndex, { weight: stepWeight(set.weight, unit, direction), kg: null })
              }
              onStepReps={(direction) => changeSet(setIndex, { reps: stepReps(set.reps, planned, direction) })}
            />
          ) : (
            <Fragment key={set.key}>
              {setIndex === firstRow ? <Columns unit={unit} /> : null}
              <SetRow {...shared} locked={locked} newBest={isNewBest(exercise, set, unit)} />
            </Fragment>
          );
        })}
      </View>

      {!locked ? (
        <View style={styles.setButtons}>
          {exercise.sets.length < MAX_SETS ? (
            <Button
              title="Add set"
              icon="add"
              variant="ghost"
              size="small"
              accessibilityLabel={`Add a set to ${exercise.name}`}
              testID={`add-set-${index}`}
              onPress={addSet}
            />
          ) : null}
          {exercise.sets.length > 1 && !lastSet?.done ? (
            <Button
              title="Remove set"
              icon="remove"
              variant="ghost"
              size="small"
              accessibilityLabel={`Remove the last set of ${exercise.name}`}
              onPress={removeSet}
            />
          ) : null}
        </View>
      ) : null}

      <Sheet visible={info} onClose={() => setInfo(false)} title={exercise.name}>
        {target.notes ? <Body>{target.notes}</Body> : null}
        {target.instructions ? <Body secondary>{target.instructions}</Body> : null}
        {target.videoPath ? <PlanVideo path={target.videoPath} label="Demo video" title={exercise.name} /> : null}
      </Sheet>
    </View>
  );
}

// Set, kg, Reps over the compact rows. A screen reader hears each field's own label instead.
function Columns({ unit }: { unit: WeightUnit }) {
  return (
    <View style={styles.columns} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text variant="label" tone="tertiary" style={[styles.columnText, styles.setColumn]}>
        Set
      </Text>
      <Text variant="label" tone="tertiary" style={[styles.columnText, styles.weightColumn]}>
        {unit}
      </Text>
      <View style={styles.times} />
      <Text variant="label" tone="tertiary" style={[styles.columnText, styles.repsColumn]}>
        Reps
      </Text>
      <View style={styles.tickColumn} />
    </View>
  );
}

type SetProps = {
  set: ActiveSet;
  // The exercise, so a screen reader can tell set 1 of one exercise from set 1 of the next.
  name: string;
  number: number;
  unit: WeightUnit;
  repsPlaceholder: string;
  testIDPrefix: string;
  onWeight: (text: string) => void;
  onReps: (text: string) => void;
  onTick: (done: boolean) => void;
};

// What both kinds of set row give their two fields: decimal weight, whole reps, the labels a screen
// reader says and the test ids.
function inputProps({ set, name, number, unit, repsPlaceholder, testIDPrefix, onWeight, onReps }: SetProps) {
  const common: TextInputProps = {
    placeholderTextColor: Colors.textTertiary,
    selectionColor: Colors.text,
    selectTextOnFocus: true,
  };
  const weight: TextInputProps = {
    ...common,
    value: set.weight,
    onChangeText: onWeight,
    keyboardType: 'decimal-pad',
    placeholder: '–',
    returnKeyType: 'next',
    submitBehavior: 'submit',
    accessibilityLabel: `${name}, set ${number} weight in ${unit}`,
    testID: `${testIDPrefix}-weight`,
  };
  const reps: TextInputProps = {
    ...common,
    value: set.reps,
    onChangeText: onReps,
    keyboardType: 'number-pad',
    placeholder: repsPlaceholder,
    returnKeyType: 'done',
    accessibilityLabel: `${name}, set ${number} reps`,
    testID: `${testIDPrefix}-reps`,
  };
  return { weight, reps };
}

// The set the person is on: big numbers they can type or nudge with large steppers, and Log set.
function CurrentSet({
  of,
  onStepWeight,
  onStepReps,
  ...props
}: SetProps & { of: number; onStepWeight: (direction: 1 | -1) => void; onStepReps: (direction: 1 | -1) => void }) {
  const { set, name, number, unit, repsPlaceholder, testIDPrefix, onTick } = props;
  const reps = useRef<TextInput>(null);
  const fields = inputProps(props);
  return (
    <View style={styles.current}>
      <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
        Set {number} of {of}
      </Text>
      <Stepper
        label="Weight"
        hint={unit}
        less={`Less weight for set ${number}`}
        more={`More weight for set ${number}`}
        onStep={onStepWeight}
        canLower={(parseNumber(set.weight) ?? 0) > 0}>
        <TextInput
          {...fields.weight}
          onSubmitEditing={() => reps.current?.focus()}
          style={styles.bigInput}
          maxFontSizeMultiplier={1.3}
        />
      </Stepper>
      <Stepper
        label="Reps"
        hint={repsPlaceholder !== '–' ? repsPlaceholder : undefined}
        less={`One rep fewer for set ${number}`}
        more={`One rep more for set ${number}`}
        onStep={onStepReps}
        canLower={/^\d+$/.test(set.reps) && Number(set.reps) > 0}>
        <TextInput
          {...fields.reps}
          ref={reps}
          onSubmitEditing={() => onTick(true)}
          style={styles.bigInput}
          maxFontSizeMultiplier={1.3}
        />
      </Stepper>
      <Button
        title="Log set"
        icon="checkmark"
        accessibilityLabel={`Log set ${number} of ${name}`}
        testID={`${testIDPrefix}-tick`}
        onPress={() => onTick(true)}
      />
    </View>
  );
}

// The field's name, then − value + in one quiet pill the width of the panel.
function Stepper({
  label,
  hint,
  less,
  more,
  canLower,
  onStep,
  children,
}: {
  label: string;
  hint?: string;
  less: string;
  more: string;
  canLower: boolean;
  onStep: (direction: 1 | -1) => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.stepperBlock}>
      <View style={styles.stepperLabel}>
        <Text variant="rowTitle">{label}</Text>
        {hint ? (
          <Text variant="footnote" tone="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.stepper}>
        <StepButton icon="remove" label={less} disabled={!canLower} onPress={() => onStep(-1)} />
        {children}
        <StepButton icon="add" label={more} onPress={() => onStep(1)} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.stepButton, pressed && { backgroundColor: Colors.tintPressed }]}>
      <Ionicons name={icon} size={24} color={disabled ? Colors.textTertiary : Colors.text} />
    </Pressable>
  );
}

// A set that isn't the one the person is on: compact, with a round tick.
function SetRow({ locked, newBest, ...props }: SetProps & { locked: boolean; newBest: boolean }) {
  const { set, name, number, testIDPrefix, onTick } = props;
  const reps = useRef<TextInput>(null);
  const fields = inputProps(props);
  return (
    <View>
      <View style={styles.setRow}>
        <Text
          variant="callout"
          tone={set.done ? 'secondary' : 'primary'}
          style={[styles.setColumn, Tabular, { textAlign: 'center', fontFamily: Fonts.textMedium }]}>
          {number}
        </Text>
        <TextInput
          {...fields.weight}
          onSubmitEditing={() => reps.current?.focus()}
          editable={!locked}
          style={[styles.input, styles.weightColumn, locked && styles.lockedInput]}
        />
        <Text variant="callout" tone="tertiary" style={styles.times}>
          ×
        </Text>
        <TextInput
          {...fields.reps}
          ref={reps}
          onSubmitEditing={() => {
            if (!set.done && !locked) onTick(true);
          }}
          editable={!locked}
          style={[styles.input, styles.repsColumn, locked && styles.lockedInput]}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.done, disabled: locked }}
          accessibilityLabel={`${name}, set ${number} done`}
          testID={`${testIDPrefix}-tick`}
          hitSlop={4}
          disabled={locked}
          onPress={() => {
            haptic.select(!set.done);
            onTick(!set.done);
          }}
          style={[styles.tickColumn, locked && { opacity: 0.5 }]}>
          <View style={[styles.tick, set.done && styles.ticked]}>
            {set.done ? <Ionicons name="checkmark" size={20} color={Colors.background} /> : null}
          </View>
        </Pressable>
      </View>
      {newBest ? (
        <View style={styles.best}>
          <StatusPill tone="success" label="New best" />
        </View>
      ) : null}
    </View>
  );
}

export const ExerciseCard = memo(ExerciseCardView);

const styles = themed(() => ({
  card: {
    gap: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.gutter,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 44,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  numberDone: {
    backgroundColor: Colors.text,
  },
  numberText: {
    ...Tabular,
    fontFamily: Fonts.textSemi,
  },
  sets: {
    gap: Spacing.one,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  columnText: {
    textAlign: 'center',
  },
  // Wide enough for "SET" at the largest label size, so the header never breaks.
  setColumn: {
    width: 34,
  },
  weightColumn: {
    flex: 5,
    minWidth: 72,
  },
  times: {
    width: 14,
    textAlign: 'center',
  },
  repsColumn: {
    flex: 4,
    minWidth: 56,
  },
  tickColumn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
  },
  input: {
    ...Type.headline,
    ...Tabular,
    height: 44,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: Colors.tint,
    color: Colors.text,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
  },
  lockedInput: {
    color: Colors.textSecondary,
    backgroundColor: 'transparent',
  },
  tick: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticked: {
    borderColor: Colors.text,
    backgroundColor: Colors.text,
  },
  best: {
    flexDirection: 'row',
    paddingLeft: 28 + Spacing.two,
    paddingBottom: Spacing.one,
  },
  current: {
    gap: Spacing.tight,
    marginVertical: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
  },
  stepperBlock: {
    gap: Spacing.one,
  },
  stepperLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.tint,
    overflow: 'hidden',
  },
  stepButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigInput: {
    ...Tabular,
    flex: 1,
    minWidth: 0,
    height: 56,
    fontFamily: Fonts.displaySemi,
    fontSize: 30,
    color: Colors.text,
    textAlign: 'center',
    paddingHorizontal: 0,
  },
  setButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    // A small ghost button pads its label by 14: this lines the label up with the card's text.
    marginLeft: -14,
  },
}));
