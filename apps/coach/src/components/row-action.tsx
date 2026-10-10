import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { ListRow } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';

type Box = { x: number; y: number; width: number; height: number };

// A row with its own small button at the end ("Approve", "Mark paid", "Sell"), beside the row's
// rather than inside it, so a screen reader reaches both and a tap on one never opens the other. The
// row keeps a gap the button's size, and the button sits over the gap. `before` shows in front of
// the gap, above it with `stacked` (an amount over its button).
export function RowWithAction({
  action,
  before,
  stacked,
  ...row
}: Omit<ComponentProps<typeof ListRow>, 'trailing' | 'chevron'> & {
  action: ReactNode;
  before?: ReactNode;
  stacked?: boolean;
}) {
  const wrap = useRef<View>(null);
  const gap = useRef<View>(null);
  // The button's own size, then where the gap sits in the row.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [at, setAt] = useState<Box | null>(null);

  function place() {
    if (!gap.current || !wrap.current) return;
    gap.current.measureLayout(
      wrap.current,
      (x, y, width, height) =>
        setAt((old) =>
          old && old.x === x && old.y === y && old.width === width && old.height === height
            ? old
            : { x, y, width, height },
        ),
      () => {},
    );
  }

  return (
    <View ref={wrap} onLayout={place}>
      <ListRow
        {...row}
        chevron={false}
        trailing={
          <View style={stacked ? styles.stacked : styles.inline}>
            {before}
            <View ref={gap} onLayout={place} style={size ?? styles.guess} />
          </View>
        }
      />
      <View
        pointerEvents="box-none"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
        }}
        style={[styles.action, at ? { left: at.x, top: at.y } : styles.unplaced]}>
        {action}
      </View>
    </View>
  );
}

const styles = themed(() => ({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stacked: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  // Until the button has been measured.
  guess: {
    width: 88,
    height: 36,
  },
  action: {
    position: 'absolute',
  },
  // Hidden until placed, so it never shows in the wrong spot.
  unplaced: {
    right: Spacing.gutter,
    top: 0,
    opacity: 0,
  },
}));
