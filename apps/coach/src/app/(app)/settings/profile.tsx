import { ProfileEditor } from '@/components/profile-editor';
import { SkeletonRows } from '@/components/ui';
import { SettingsPage } from '@/components/settings-parts';
import { useAuth } from '@/lib/auth';

// The trainer's profile, as clients see it in the Voltrix app.
export default function ProfileSettings() {
  const { profile, refreshProfile } = useAuth();
  if (!profile) {
    return (
      <SettingsPage>
        <SkeletonRows count={3} />
      </SettingsPage>
    );
  }
  return <ProfileEditor key={profile.id} profile={profile} onSaved={refreshProfile} />;
}
