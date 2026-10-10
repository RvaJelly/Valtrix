import { Platform } from 'react-native';
import { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';

// Calm motion: short, decelerating, no bounce, and off when the phone asks for reduced motion.
export const Duration = {
  press: 120,
  small: 200,
  medium: 250,
  enter: 300,
  exit: 200,
  screen: 350,
  pulse: 1200,
} as const;

export const Ease = {
  enter: Easing.bezier(0.05, 0.7, 0.1, 1), // emphasized decelerate
  exit: Easing.bezier(0.3, 0, 0.8, 0.15), // emphasized accelerate
  standard: Easing.bezier(0.2, 0, 0, 1),
};

// Reanimated's default mass is 4, so always pass mass 1. No bounce anywhere.
export const Spring = {
  press: { stiffness: 1600, damping: 80, mass: 1 },
  move: { stiffness: 700, damping: 47.6, mass: 1 },
  sheet: { stiffness: 300, damping: 31.2, mass: 1 },
} as const;

// First appearance of a card or group: up 8 pt and fade in. Only the first 6 items are staggered.
// Off on web, where the entering animation takes the view out of the layout and what follows overlaps it.
export function enterUp(index = 0) {
  if (Platform.OS === 'web') return undefined;
  return FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
    .duration(Duration.enter)
    .delay(Math.min(index, 5) * 40)
    .easing(Ease.enter)
    .reduceMotion(ReduceMotion.System);
}
