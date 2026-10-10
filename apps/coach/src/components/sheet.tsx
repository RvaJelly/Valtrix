import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { Duration, Ease, NATIVE_DRIVER, Spring, useReducedMotion } from '@/constants/motion';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';

type Props = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  /** Called once the sheet has fully gone (iPhone and web only). */
  onClosed?: () => void;
  title?: string;
}>;

// A panel that rises from the bottom, within thumb reach, over a dimmed page. Tapping outside, the
// back button or Esc closes it. On a wide window it is a 560 wide panel in the middle instead.
export function Sheet({ visible, onClose, onClosed, title, children }: Props) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const wide = width > 600;
  // The modal stays up while the sheet slides away, then goes.
  const [open, setOpen] = useState(visible);
  if (visible && !open) setOpen(true);
  const [shown] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    const anim = visible
      ? reduceMotion
        ? Animated.timing(shown, { toValue: 1, duration: Duration.small, useNativeDriver: NATIVE_DRIVER })
        : Animated.spring(shown, { toValue: 1, ...Spring.sheet, useNativeDriver: NATIVE_DRIVER })
      : Animated.timing(shown, {
          toValue: 0,
          duration: Duration.exit,
          easing: Ease.exit,
          useNativeDriver: NATIVE_DRIVER,
        });
    anim.start(({ finished }) => {
      if (finished && !visible) setOpen(false);
    });
    return () => anim.stop();
  }, [reduceMotion, shown, visible]);

  // Slides up by its own height (a short rise on a wide window); only fades with reduced motion.
  const travel = reduceMotion ? 0 : wide ? 24 : sheetHeight || height;
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] });
  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} onDismiss={onClosed}>
      <KeyboardAvoidingView
        style={[styles.wrap, wide && styles.wrapWide]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            wide
              ? [styles.sheetWide, { maxHeight: height * 0.86 }]
              : { paddingBottom: insets.bottom + Spacing.three, maxHeight: height * 0.92 },
            { transform: [{ translateY }] },
            reduceMotion || wide ? { opacity: shown } : null,
          ]}>
          {wide ? null : <View style={styles.grabber} />}
          {title ? (
            <Text variant="title" accessibilityRole="header" numberOfLines={2} style={styles.title}>
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wrapWide: {
    justifyContent: 'center',
    padding: Spacing.four,
  },
  scrim: {
    backgroundColor: Colors.scrim,
  },
  sheet: {
    width: '100%',
    paddingTop: Spacing.two,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceHigh,
    boxShadow: Colors.shadowFloating,
    // On dark themes a hairline catches the top edge, where a shadow can't show.
    ...(Colors.scheme === 'dark'
      ? { borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: Colors.borderStrong }
      : null),
  },
  sheetWide: {
    width: 560,
    maxWidth: '100%',
    alignSelf: 'center',
    paddingTop: Spacing.gutter,
    paddingBottom: Spacing.gutter,
    borderRadius: Radius.xl,
    borderBottomWidth: Colors.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.tight,
    backgroundColor: Colors.borderStrong,
  },
  title: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.tight,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
}));
