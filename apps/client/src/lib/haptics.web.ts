// Browsers have no haptics worth using, so every call does nothing here (see haptics.ts).
const none = () => {};

export const haptic: { tap(): void; select(on?: boolean): void; success(): void; warning(): void } = {
  tap: none,
  select: none,
  success: none,
  warning: none,
};
