import { useState } from 'react';

import { AuthPage } from '@/components/auth-page';
import { PasswordField } from '@/components/password-field';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// Shown after a client opens the reset link from their email.
export default function NewPassword() {
  const { finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(plainError(error));
    // The root layout then opens the app.
    finishRecovery();
  }

  return (
    <AuthPage
      title="Choose a new password"
      icon="key-outline"
      intro="You’ll use it the next time you sign in."
      footer={
        <>
          <Button title="Save password" onPress={save} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={signOut} />
        </>
      }>
      <PasswordField
        label="New password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        onSubmitEditing={save}
        error={error}
      />
    </AuthPage>
  );
}
