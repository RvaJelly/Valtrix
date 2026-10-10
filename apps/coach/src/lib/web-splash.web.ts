// Fades out the V that public/index.html shows while the app starts, then removes it. Taps and
// scrolls go straight to the app while it fades.
export function hideWebSplash() {
  const splash = typeof document === 'undefined' ? null : document.getElementById('voltrix-splash');
  if (!splash) return;
  splash.style.pointerEvents = 'none';
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 250);
}
