import { router, type Href } from 'expo-router';

// Closes the screen after saving. A screen opened from a link has nothing behind it to go
// back to, so it opens `fallback` instead of doing nothing.
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
