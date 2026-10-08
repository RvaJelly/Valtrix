import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// The name of the phone's face or fingerprint unlock, or null when it has none set up.
export async function biometricName(): Promise<string | null> {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !enrolled) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
    return Platform.OS === 'ios' ? 'Face ID' : 'face unlock';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
    return Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint';
  return 'biometrics';
}

// Shows the phone's own Face ID or fingerprint prompt. The phone's PIN works as a fallback.
export async function confirmIdentity(reason: string) {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
  return result.success;
}
