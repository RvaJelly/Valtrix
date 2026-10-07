export const MUSCLE_GROUPS = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  full_body: 'Full body',
  cardio: 'Cardio',
} as const;

export const EQUIPMENT = {
  none: 'Bodyweight',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  cable: 'Cable',
  band: 'Band',
  other: 'Other',
} as const;

export type MuscleGroup = keyof typeof MUSCLE_GROUPS;
export type Equipment = keyof typeof EQUIPMENT;

export type Exercise = {
  id: string;
  // null for the built-in Valtrix library.
  trainer_id: string | null;
  name: string;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  instructions: string | null;
};

export const EXERCISE_COLUMNS = 'id, trainer_id, name, muscle_group, equipment, instructions';

export type Workout = {
  id: string;
  name: string;
  notes: string | null;
  updated_at: string;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  weight: string | null;
  rest_seconds: number | null;
  notes: string | null;
  exercises: Pick<Exercise, 'name' | 'muscle_group' | 'equipment'>;
};

export const WORKOUT_EXERCISE_COLUMNS =
  'id, workout_id, exercise_id, position, sets, reps, weight, rest_seconds, notes, exercises(name, muscle_group, equipment)';
