import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { Button, ErrorText, TextField } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import type { Client } from '@/lib/clients';

export type ClientInput = Pick<Client, 'first_name' | 'last_name' | 'email' | 'phone' | 'goal' | 'notes'>;

type Props = {
  initial?: Partial<ClientInput>;
  submitLabel: string;
  onSubmit: (input: ClientInput) => Promise<string | null>;
  children?: React.ReactNode;
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ClientForm({ initial, submitLabel, onSubmit, children }: Props) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!firstName.trim()) {
      setError('Enter the client’s first name.');
      return;
    }
    if (email.trim() && !EMAIL.test(email.trim())) {
      setError('That email address does not look right.');
      return;
    }
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField label="First name" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
        <TextField label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Optional, lets them join the Valtrix app"
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Optional"
        />
        <TextField label="Goal" value={goal} onChangeText={setGoal} placeholder="For example: lose 5 kg by summer" />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Injuries, preferences, anything useful"
          style={{ minHeight: 100, paddingTop: Spacing.three, textAlignVertical: 'top' }}
        />
        <ErrorText>{error}</ErrorText>
        <Button title={submitLabel} onPress={submit} loading={busy} />
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
}));
