import { ProfileForm, ProfilePhoto, SettingsPage } from '@/components/settings-parts';
import { useAuth } from '@/lib/auth';

// Your photo and name, as trainers and other members see them.
export default function ProfileSettings() {
  const { session, profile, refreshProfile } = useAuth();
  return (
    <SettingsPage>
      <ProfilePhoto
        userId={session?.user.id}
        name={profile?.full_name ?? null}
        url={profile?.avatar_url ?? null}
        onSaved={refreshProfile}
      />
      <ProfileForm
        key={profile?.id}
        initialName={profile?.full_name ?? ''}
        userId={session?.user.id}
        onSaved={refreshProfile}
      />
    </SettingsPage>
  );
}
