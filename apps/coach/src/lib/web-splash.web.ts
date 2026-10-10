// Fades out the V that public/index.html shows while the app starts, then removes it.
export function hideWebSplash() {
  const splash = typeof document === 'undefined' ? null : document.getElementById('voltrix-splash');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 250);
}
