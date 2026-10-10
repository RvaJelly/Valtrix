import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform } from 'react-native';

// Calm motion: short, decelerating, no bounce, and off when the phone asks for reduced motion.
// Built on React Native's own Animated, so the web bundle carries no animation library.
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

// Always pass mass 1. No bounce anywhere.
export const Spring = {
  press: { stiffness: 1600, damping: 80, mass: 1 },
  move: { stiffness: 700, damping: 47.6, mass: 1 },
  sheet: { stiffness: 300, damping: 31.2, mass: 1 },
} as const;

// The web has no native driver; everywhere else transforms and opacity run off the JS thread.
export const NATIVE_DRIVER = Platform.OS !== 'web';

// True while the phone (or the browser) asks for reduced motion.
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduce(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
