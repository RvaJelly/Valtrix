import { useState } from 'react';

import { AuthPage } from '@/components/auth-page';
import { Button, Text, TextField, TextLink } from '@/components/ui';
import { coachAccess, TRIAL_DAYS } from '@/lib/access';
import { useAuth } from '@/lib/auth';
import { plainError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// The first step after signing up: the business name. A trainer without a plan goes on to start the
// free trial, so the page says it is step 1 of 2 and what comes next.
export default function BusinessSetup() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const twoSteps = coachAccess(profile).kind === 'none';
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createBusiness() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter the name clients will know your business by.');
    if (!session) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ business_name: trimmed }).eq('id', session.user.id);
    if (error) {
      setError(plainError(error));
      setBusy(false);
      return;
    }
    // Once the profile has a business name the root layout opens the next step.
    await refreshProfile();
    setBusy(false);
  }

  return (
    <AuthPage
      step={twoSteps ? 'Step 1 of 2' : undefined}
      title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
      intro="What is your training business called? Clients will see this name."
      footer={
        <>
          {twoSteps ? (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              Next: start your {TRIAL_DAYS}-day free trial.
            </Text>
          ) : null}
          <Button title="Continue" onPress={createBusiness} loading={busy} />
          <TextLink label="Sign out" onPress={signOut} />
        </>
      }>
      <TextField
        label="Business name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        autoCapitalize="words"
        autoComplete="organization"
        placeholder="For example: Strong Start Training"
        enterKeyHint="done"
        onSubmitEditing={createBusiness}
        error={error ?? undefined}
      />
    </AuthPage>
  );
}
