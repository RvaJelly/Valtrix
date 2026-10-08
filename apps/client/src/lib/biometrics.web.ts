// Browsers have no Face ID or fingerprint unlock for the app.
export async function biometricName(): Promise<string | null> {
  return null;
}

export async function confirmIdentity(_reason: string) {
  return true;
}
