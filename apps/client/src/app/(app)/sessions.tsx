import { Redirect, Stack } from 'expo-router';

// Sessions moved into the Plan tab. Old links and bookmarks to /sessions still land there.
export default function OldSessionsLink() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Redirect href={{ pathname: '/plan', params: { view: 'sessions' } }} />
    </>
  );
}
