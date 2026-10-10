import { createContext, useContext, useEffect, useEffectEvent, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { Duration, Ease, NATIVE_DRIVER, useReducedMotion } from '@/constants/motion';
import { Colors, Fonts, Layout, Radius, Spacing, themed } from '@/constants/theme';

type ToastAction = { label: string; onPress: () => void };
type ShownToast = { id: number; message: string; action?: ToastAction };
type ShowToast = (message: string, options?: { action?: ToastAction }) => void;

const ToastContext = createContext<ShowToast>(() => {});

// Shows a short confirmation at the bottom of the screen: "Saved", "Copied", or an undo.
//   const toast = useToast();
//   toast('Saved');
//   toast('Removed', { action: { label: 'Undo', onPress: undo } });
export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

// One toast at a time: a new one replaces the one showing.
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ShownToast | null>(null);
  const show: ShowToast = (message, options) => setToast({ id: nextId++, message, action: options?.action });
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <ToastView key={toast.id} toast={toast} onDone={() => setToast((t) => (t?.id === toast.id ? null : t))} />
      ) : null}
    </ToastContext.Provider>
  );
}

const SHOWN_FOR = 2500;

function ToastView({ toast, onDone }: { toast: ShownToast; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(0));
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(toast.message);
    const enter = Animated.timing(shown, {
      toValue: 1,
      duration: Duration.medium,
      easing: Ease.enter,
      useNativeDriver: NATIVE_DRIVER,
    });
    const exit = Animated.timing(shown, {
      toValue: 0,
      duration: Duration.exit,
      easing: Ease.exit,
      useNativeDriver: NATIVE_DRIVER,
    });
    enter.start();
    const timer = setTimeout(() => exit.start(({ finished }) => finished && done()), SHOWN_FOR);
    return () => {
      clearTimeout(timer);
      enter.stop();
      exit.stop();
    };
  }, [shown, toast.message]);

  const rise = shown.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 8, 0] });
  // Above the tab bar on a phone; the sidebar leaves the bottom free on a wide window.
  const bottom = insets.bottom + (width >= Layout.wide ? Spacing.four : 80);
  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[styles.toast, { opacity: shown, transform: [{ translateY: rise }] }]}>
        <Text variant="callout" style={styles.message}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.action?.onPress();
              onDone();
            }}
            hitSlop={8}
            style={styles.action}>
            <Text variant="callout" style={styles.actionText}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = themed(() => ({
  layer: {
    position: 'absolute',
    left: Spacing.gutter,
    right: Spacing.gutter,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    maxWidth: 400,
    minHeight: 44,
    paddingVertical: Spacing.tight,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    backgroundColor: Colors.toast,
    boxShadow: Colors.shadowFloating,
  },
  message: {
    flexShrink: 1,
    color: Colors.onToast,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  actionText: {
    fontFamily: Fonts.textSemi,
    color: Colors.onToast,
  },
}));
