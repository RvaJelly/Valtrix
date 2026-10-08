import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coords = { latitude: number; longitude: number };

export type Found = { coords: Coords } | { problem: 'denied' | 'failed' };

// Two decimals is about 1 km: close enough for clients to see how far away a
// trainer is, without saving anyone's exact spot.
export function roughly({ latitude, longitude }: Coords): Coords {
  return { latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100 };
}

// Asks for the phone's location (the phone only asks the person once) and finds it roughly.
export async function findMe(): Promise<Found> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { problem: 'denied' };
    // Browsers hand back their last fix however old it is unless told otherwise,
    // and the person may have moved since.
    const options =
      Platform.OS === 'web'
        ? { accuracy: Location.Accuracy.Balanced, maximumAge: 0 }
        : { accuracy: Location.Accuracy.Balanced };
    // A fix can take a while indoors, so give up after 15 seconds.
    const position = await Promise.race([
      Location.getCurrentPositionAsync(options),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), 15_000);
      }),
    ]);
    return { coords: roughly(position.coords) };
  } catch (e) {
    // Browsers report a refusal as an error rather than a permission answer.
    if (e && typeof e === 'object' && 'code' in e && e.code === 1) return { problem: 'denied' };
    return { problem: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

// The town at a spot, from the phone's map service. Browsers have none, so web gets null.
export async function townAt(coords: Coords): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const [place] = await Location.reverseGeocodeAsync(coords);
    const town = (place?.city || place?.subregion || '').trim();
    return town ? town.slice(0, 100) : null;
  } catch {
    return null;
  }
}
