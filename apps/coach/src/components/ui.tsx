import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Spacing } from '@/constants/theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: pressed ? Colors.orangePressed : Colors.orange },
        variant === 'secondary' && [styles.secondary, pressed && { backgroundColor: Colors.surfaceRaised }],
        variant === 'ghost' && pressed && { opacity: 0.6 },
        inactive && { opacity: 0.5 },
      ]}>
      {loading ? (
        <ActivityIndicator color={Colors.text} />
      ) : (
        <Text style={[styles.buttonText, variant === 'ghost' && { color: Colors.orange }]}>{title}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, ...rest }: FieldProps) {
  return (
    <View style={{ gap: Spacing.two }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.textSecondary}
        selectionColor={Colors.orange}
        style={[styles.input, error ? { borderColor: Colors.danger } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Title({ style, ...rest }: TextProps) {
  return <Text style={[styles.title, style]} {...rest} />;
}

export function Body({ style, secondary, ...rest }: TextProps & { secondary?: boolean }) {
  return <Text style={[styles.body, secondary && { color: Colors.textSecondary }, style]} {...rest} />;
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ComponentProps<typeof View>['style'] }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type EmptyStateProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={32} color={Colors.orange} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Body secondary style={{ textAlign: 'center' }}>
        {message}
      </Body>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  secondary: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
});
