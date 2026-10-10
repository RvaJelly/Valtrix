import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';

import { Field } from '@/components/field';
import { StickyFooter } from '@/components/sticky-footer';
import { Button, ErrorText, Section, Text } from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
import type { Client } from '@/lib/clients';

export type ClientInput = Pick<Client, 'first_name' | 'last_name' | 'email' | 'phone' | 'goal' | 'notes'>;

type Props = {
  initial?: Partial<ClientInput>;
  submitLabel: string;
  onSubmit: (input: ClientInput) => Promise<string | null>;
  // Shown above the fields (the client page's profile and sections).
  header?: ReactNode;
  // The two group titles: the name, then contact and goal.
  titles?: [string, string];
  // Adding a client: the button sits in a bar at the bottom and the email says what it does.
  adding?: boolean;
  // Shown under the button.
  children?: ReactNode;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ClientForm({
  initial,
  submitLabel,
  onSubmit,
  header,
  titles = ['Client', 'Contact and goal (optional)'],
  adding,
  children,
}: Props) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const goalRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  async function submit() {
    setError(null);
    const noName = !firstName.trim();
    const badEmail = !!email.trim() && !EMAIL.test(email.trim());
    setNameError(noName ? 'Enter the client’s first name.' : undefined);
    setEmailError(badEmail ? 'That email address doesn’t look right. Check it for typos.' : undefined);
    if (noName || badEmail) return;
    setBusy(true);
    const problem = await onSubmit({
      first_name: firstName.trim(),
      last_name: orNull(lastName),
      email: orNull(email),
      phone: orNull(phone),
      goal: orNull(goal),
      notes: orNull(notes),
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  const button = <Button title={submitLabel} onPress={submit} loading={busy} />;

  // maxLength matches the limits the database checks.
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, adding && styles.narrow]} keyboardShouldPersistTaps="handled">
        {header}
        <Section title={titles[0]}>
          <View style={styles.fields}>
            <Field
              label="First name"
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                if (text.trim()) setNameError(undefined);
              }}
              error={nameError}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              enterKeyHint="next"
              submitBehavior="submit"
              onSubmitEditing={() => lastRef.current?.focus()}
              maxLength={200}
            />
            <Field
              ref={lastRef}
              label="Last name"
              optional
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              enterKeyHint="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
              maxLength={200}
            />
          </View>
        </Section>
        <Section title={titles[1]}>
          <View style={styles.fields}>
            <View style={{ gap: Spacing.two }}>
              <Field
                ref={emailRef}
                label="Email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError(undefined);
                }}
                error={emailError}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder="name@email.com"
                enterKeyHint="next"
                submitBehavior="submit"
                onSubmitEditing={() => phoneRef.current?.focus()}
                maxLength={320}
              />
              {adding && !emailError ? (
                <Text variant="footnote" tone="secondary">
                  We’ll send them an invite to the Voltrix app.
                </Text>
              ) : null}
            </View>
            <Field
              ref={phoneRef}
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              autoComplete="tel"
              textContentType="telephoneNumber"
              keyboardType="phone-pad"
              enterKeyHint="next"
              submitBehavior="submit"
              onSubmitEditing={() => goalRef.current?.focus()}
              maxLength={30}
            />
            <Field
              ref={goalRef}
              label="Goal"
              value={goal}
              onChangeText={setGoal}
              autoCapitalize="sentences"
              placeholder="For example: lose 5 kg by summer"
              enterKeyHint="next"
              submitBehavior="submit"
              onSubmitEditing={() => notesRef.current?.focus()}
              maxLength={500}
            />
            <Field
              ref={notesRef}
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              autoCapitalize="sentences"
              maxLength={10000}
              multiline
              placeholder="Injuries, preferences, anything useful"
              style={styles.notes}
            />
          </View>
        </Section>
        <ErrorText>{error}</ErrorText>
        {adding ? null : button}
        {children}
      </ScrollView>
      {adding ? <StickyFooter>{button}</StickyFooter> : null}
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
  },
  narrow: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
  },
  fields: {
    gap: Spacing.three,
  },
  notes: {
    minHeight: 112,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
}));
