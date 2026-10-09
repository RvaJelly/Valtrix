// In a browser, saving downloads the video like any other file.
export async function saveVideo(url: string, fileName: string): Promise<'saved' | 'denied'> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const link = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = link;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before letting go of the file.
  setTimeout(() => URL.revokeObjectURL(link), 60_000);
  return 'saved';
}
