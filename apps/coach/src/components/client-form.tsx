import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';

import { StickyFooter } from '@/components/sticky-footer';
import { Button, ErrorText, Section, Text, TextField } from '@/components/ui';
import { Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import type { Client } from '@/lib/clients';
import { waNumber } from '@/lib/whatsapp';

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
  // Inside a Sheet, which scrolls and keeps clear of the keyboard itself: just the fields and button.
  inSheet?: boolean;
  // Shown under the button.
  children?: ReactNode;
  // Editing a client who is linked: a new email sends no invite.
  linked?: boolean;
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
  inSheet,
  children,
  linked,
}: Props) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  // Once they leave the phone field: a number WhatsApp can't open says so (saving still works).
  const [phoneLeft, setPhoneLeft] = useState(false);
  const country = useAuth().profile?.country ?? 'ZA';
  const phoneOff = phoneLeft && !!phone.trim() && !waNumber(phone, country);
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
  const newEmail = !!email.trim() && email.trim().toLowerCase() !== (initial?.email ?? '').trim().toLowerCase();

  // maxLength matches the limits the database checks.
  const fields = (
    <>
      <Section title={titles[0]}>
        <View style={styles.fields}>
          <TextField
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
          <TextField
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
            <TextField
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
            {emailError ? null : (
              <Text variant="footnote" tone="secondary">
                {!adding && !linked && newEmail
                  ? 'Saving sends a new invite to this email.'
                  : 'Optional. With an email they can also accept your invite by signing up with it.'}
              </Text>
            )}
          </View>
          <View style={{ gap: Spacing.two }}>
            <TextField
              ref={phoneRef}
              label="Phone"
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                setPhoneLeft(false);
              }}
              onBlur={() => setPhoneLeft(true)}
              autoComplete="tel"
              textContentType="telephoneNumber"
              keyboardType="phone-pad"
              enterKeyHint="next"
              submitBehavior="submit"
              onSubmitEditing={() => goalRef.current?.focus()}
              maxLength={30}
            />
            <Text variant="footnote" tone={phoneOff ? 'warning' : 'secondary'} testID="client-phone-hint">
              {phoneOff
                ? 'This doesn’t look like a full number. Check it, or WhatsApp will ask who to send your invite to.'
                : 'Their WhatsApp number, to invite them.'}
            </Text>
          </View>
          <TextField
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
          <TextField
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
    </>
  );

  if (inSheet) {
    return (
      <View style={styles.sheet}>
        {fields}
        {button}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, adding && styles.narrow]} keyboardShouldPersistTaps="handled">
        {header}
        {fields}
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
  sheet: {
    gap: Spacing.four,
    paddingBottom: Spacing.two,
  },
  notes: {
    minHeight: 112,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
}));
