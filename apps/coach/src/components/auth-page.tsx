import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { Text, Title } from '@/components/ui';
import { Colors, Layout, Radius, Spacing, themed } from '@/constants/theme';

// A sign-in page: the logo and a big title at the top, the fields under them, and the main button with
// its links held at the bottom, above the keyboard.
export function AuthPage({
  title,
  intro,
  step,
  icon,
  footer,
  children,
}: PropsWithChildren<{
  title: string;
  intro?: ReactNode;
  // "Step 1 of 2", above the title.
  step?: string;
  // A tile above the title, for "Check your email".
  icon?: 'mail-outline' | 'key-outline';
  footer: ReactNode;
}>) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Logo style={styles.logo} />
          <View style={{ gap: Spacing.tight }}>
            {icon ? (
              <View style={styles.tile}>
                <Ionicons name={icon} size={28} color={Colors.text} />
              </View>
            ) : null}
            {step ? (
              <Text variant="label" tone="secondary">
                {step}
              </Text>
            ) : null}
            <Title accessibilityRole="header">{title}</Title>
            {typeof intro === 'string' ? (
              <Text variant="callout" tone="secondary">
                {intro}
              </Text>
            ) : (
              intro
            )}
          </View>
          {children ? <View style={styles.fields}>{children}</View> : null}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // The welcome screen's 20 gutter and column, and room at the top for the back arrow.
  content: {
    width: '100%',
    maxWidth: Layout.maxWelcome,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  logo: {
    width: 148,
    alignSelf: 'flex-start',
    // The image carries the brand kit's clear space; this lines the V up with the text below.
    marginLeft: -12,
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
    marginBottom: Spacing.one,
  },
  fields: {
    gap: Spacing.gutter,
  },
  footer: {
    width: '100%',
    maxWidth: Layout.maxWelcome,
    alignSelf: 'center',
    gap: Spacing.tight,
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.tight,
    paddingBottom: Spacing.three,
  },
}));
