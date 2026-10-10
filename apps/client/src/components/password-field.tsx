import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { ErrorText, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, themed, Type } from '@/constants/theme';

// A password box that looks like TextField, with an eye to show what was typed. (TextField has
// no slot for a button inside the box, so this mirrors its look.)
export function PasswordField({
  label,
  error,
  onFocus,
  onBlur,
  ...rest
}: Omit<TextInputProps, 'secureTextEntry' | 'style'> & { label: string; error?: string | null }) {
  const [shown, setShown] = useState(false);
  const [focused, setFocused] = useState(false);
  const border = error ? Colors.danger : focused ? Colors.text : 'transparent';
  return (
    <View style={{ gap: Spacing.two }}>
      <Text variant="footnote" tone="secondary" style={{ fontFamily: Fonts.textMedium }}>
        {label}
      </Text>
      <View style={[styles.box, { borderColor: border }]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={Colors.textSecondary}
          selectionColor={Colors.accent}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
          {...rest}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          onPress={() => setShown((s) => !s)}
          style={({ pressed }) => [styles.eye, pressed && { opacity: 0.6 }]}>
          <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = themed(() => ({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 2,
    backgroundColor: Colors.tint,
    paddingLeft: Spacing.three,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
    color: Colors.text,
    ...Type.body,
    // The box draws the focus; the browser's own outline would sit inside it.
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  eye: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
