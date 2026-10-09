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
  // null for the built-in Voltrix library.
  trainer_id: string | null;
  name: string;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  instructions: string | null;
  // The exercise's demo video in the workout-videos bucket, for a trainer's own exercises.
  video_path: string | null;
};

export const EXERCISE_COLUMNS = 'id, trainer_id, name, muscle_group, equipment, instructions, video_path';

export type Workout = {
  id: string;
  name: string;
  notes: string | null;
  updated_at: string;
  // A video for the whole workout, like a follow-along.
  video_path: string | null;
};

export const WORKOUT_COLUMNS = 'id, name, notes, updated_at, video_path';

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  weight: string | null;
  // The unit the weight was written in. Empty for weights saved before units were kept,
  // which read in the trainer's current unit.
  weight_unit: 'kg' | 'lb' | null;
  rest_seconds: number | null;
  notes: string | null;
  // A demo for this exercise in this workout. Without one, the exercise's own demo shows.
  video_path: string | null;
  exercises: Pick<Exercise, 'name' | 'muscle_group' | 'equipment' | 'video_path'>;
};

export const WORKOUT_EXERCISE_COLUMNS =
  'id, workout_id, exercise_id, position, sets, reps, weight, weight_unit, rest_seconds, notes, video_path, exercises(name, muscle_group, equipment, video_path)';
