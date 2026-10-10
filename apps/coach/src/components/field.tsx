import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactElement, type Ref } from 'react';
import { Pressable, useWindowDimensions, View, type TextInput } from 'react-native';

import { TextField } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';

type FieldProps = ComponentProps<typeof TextField> & { ref?: Ref<TextInput> };

// TextField with its ref typed, so Next on the keyboard can move to the next field. TextField passes
// every prop on to its TextInput, and React 19 hands `ref` over as a plain prop.
export const Field = TextField as (props: FieldProps) => ReactElement;

// A password box with a show / hide button on its right edge. The button covers the field's last 48
// so it never sits on the text.
export function PasswordField({ style, ...props }: Omit<FieldProps, 'secureTextEntry'>) {
  const [shown, setShown] = useState(false);
  // The label above the box is one footnote line (18, growing with text size) and a gap of 8; the box
  // is 52 high, so the 44 button sits 4 inside it.
  const top = 18 * useWindowDimensions().fontScale + Spacing.two + 4;
  return (
    <View>
      <Field
        {...props}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        style={[{ paddingRight: 52 }, style]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
        onPress={() => setShown((s) => !s)}
        hitSlop={4}
        style={[styles.eye, { top }]}>
        {({ pressed }) => (
          <Ionicons
            name={shown ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={pressed ? Colors.text : Colors.textSecondary}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  eye: {
    position: 'absolute',
    right: Spacing.one,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
}));
