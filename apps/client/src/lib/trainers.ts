import type { Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';

// A trainer the signed-in client is linked to.
export type Trainer = {
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  client_status: 'active' | 'paused';
};

// A trainer's public profile, as every client can see it.
export type PublicTrainer = {
  id: string;
  full_name: string | null;
  business_name: string | null;
  avatar_url: string | null;
  specialties: string[];
  bio: string | null;
  city: string | null;
  years_experience: number | null;
};

// Every trainer on Voltrix with an active plan.
export async function listTrainers() {
  const { data, error } = await supabase.rpc('list_trainers');
  if (error) throw error;
  return (data ?? []) as PublicTrainer[];
}

// How far each trainer who shared a location is from the client, in km, by trainer id.
// The server works it out, so clients never see where a trainer is.
export async function trainerDistances({ latitude, longitude }: Coords) {
  const { data, error } = await supabase.rpc('trainer_distances', { p_lat: latitude, p_lng: longitude });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; distance_km: number | string }[];
  return new Map(rows.map((r) => [r.id, Number(r.distance_km)]));
}

export function distanceLabel(km: number) {
  return km < 1 ? 'Under 1 km away' : `${Math.round(km)} km away`;
}

export function yearsLabel(years: number) {
  return years === 1 ? '1 year' : `${years} years`;
}

export type TrainerSort = 'default' | 'nearest' | 'experience';

// Missing numbers go last.
function ascending(a: number | null | undefined, b: number | null | undefined) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return a - b;
}

// Trainers in the chosen order, A to Z for ties. A to Z goes by the name on each card,
// which is the business name for trainers who left their own name out.
export function sortTrainers(trainers: PublicTrainer[], sort: TrainerSort, distances?: Map<string, number> | null) {
  const byName = [...trainers].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }),
  );
  if (sort === 'experience') {
    return byName.sort((a, b) =>
      ascending(
        a.years_experience == null ? null : -a.years_experience,
        b.years_experience == null ? null : -b.years_experience,
      ),
    );
  }
  if (sort === 'nearest' && distances) {
    return byName.sort((a, b) => ascending(distances.get(a.id), distances.get(b.id)));
  }
  return byName;
}

// Trainers type their own town, so "cape town " and "Cape Town" must match.
function tidyTown(city: string | null | undefined) {
  return city?.trim().replace(/\s+/g, ' ') ?? '';
}

export function townKey(city: string | null | undefined) {
  return tidyTown(city).toLowerCase();
}

export type Town = { key: string; name: string; count: number };

// The towns trainers are in, the busiest first. Each is spelled the way most of its
// trainers spell it, with capitals added if nobody used any.
export function trainerTowns(trainers: PublicTrainer[]): Town[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const t of trainers) {
    const name = tidyTown(t.city);
    if (!name) continue;
    const forTown = spellings.get(name.toLowerCase()) ?? new Map<string, number>();
    forTown.set(name, (forTown.get(name) ?? 0) + 1);
    spellings.set(name.toLowerCase(), forTown);
  }
  const hasCapitals = (s: string) => s !== s.toLowerCase();
  return [...spellings]
    .map(([key, forTown]) => {
      const [best] = [...forTown.keys()].sort(
        (a, b) =>
          forTown.get(b)! - forTown.get(a)! || Number(hasCapitals(b)) - Number(hasCapitals(a)) || a.localeCompare(b),
      );
      const name = hasCapitals(best)
        ? best
        : best
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
      return { key, name, count: [...forTown.values()].reduce((sum, n) => sum + n, 0) };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function displayName(t: { full_name: string | null; business_name: string | null }) {
  return t.full_name || t.business_name || 'Trainer';
}

// Link the client to any trainer who saved their email, then list their trainers.
export async function loadTrainers() {
  await supabase.rpc('claim_my_invites');
  const { data, error } = await supabase.rpc('my_trainers');
  if (error) throw error;
  return (data ?? []) as Trainer[];
}
