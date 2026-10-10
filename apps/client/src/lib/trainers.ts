import type { Coords } from '@/lib/location';
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// A trainer the signed-in client is linked to (they accepted the trainer's invite).
// 'archived' means the trainer archived them: nothing is shared until the trainer makes
// them active again.
export type Trainer = {
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  client_status: 'active' | 'paused' | 'archived';
  trainer_avatar: string | null;
  joined_at: string | null;
};

// A trainer who added the client's email in Voltrix Coach and is waiting for a yes or no, or
// whose invite code the person entered.
export type Invite = {
  client_id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  trainer_avatar: string | null;
  invited_at: string;
  // Only from an invite code: the first name the trainer gave the person they invited, so
  // someone who got a code meant for another person sees it isn't theirs.
  client_first_name?: string | null;
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
export function sortTrainers<T extends PublicTrainer>(
  trainers: T[],
  sort: TrainerSort,
  distances?: Map<string, number> | null,
): T[] {
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

// The trainers the client accepted. Ones who archived the client are left out, unless
// withArchived (Settings lists them too, so the client can leave them).
export async function loadTrainers(withArchived = false) {
  const { data, error } = await supabase.rpc('my_trainers_v2');
  if (error) throw error;
  const list = (data ?? []) as Trainer[];
  return withArchived ? list : list.filter((t) => t.client_status !== 'archived');
}

// Trainers waiting for the client to accept or decline, newest first. Nobody is linked
// (or sees anything of the client's) until the client accepts.
export async function loadInvites() {
  const { data, error } = await supabase.rpc('my_invites');
  if (error) throw error;
  return (data ?? []) as Invite[];
}

export async function acceptInvite(clientId: string) {
  const { error } = await supabase.rpc('accept_trainer_invite', { p_client: clientId });
  if (error) throw error;
}

// How many invites it declined: 0 when there was nothing left to decline (withdrawn,
// archived, or answered on another phone).
export async function declineInvite(clientId: string) {
  const { data, error } = await supabase.rpc('decline_trainer_invite', { p_client: clientId });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

// Unlinks the client from the trainer. The trainer keeps their own notes.
export async function leaveTrainer(clientId: string) {
  const { error } = await supabase.rpc('leave_trainer', { p_client: clientId });
  if (error) throw error;
}

// The name on an invite or a trainer row: the trainer's own name, else their business.
export function trainerTitle(t: { trainer_name: string | null; business_name: string | null }) {
  return t.trainer_name || t.business_name || 'Your trainer';
}

// ---------- Asking a trainer to train you ----------

// Whether the signed-in person can ask this trainer now, and why not (the database decides):
// unconfirmed (email not confirmed), self, unavailable, not_taking, has_trainer, waiting (a request to
// someone else is waiting), declined (this trainer said no in the last 30 days), limit (3 today).
export type RequestState = {
  can_ask: boolean;
  why: 'unconfirmed' | 'self' | 'unavailable' | 'not_taking' | 'has_trainer' | 'waiting' | 'declined' | 'limit' | null;
  request: { id: string; status: string; created_at: string; answered_at: string | null } | null;
  waiting_with: string | null;
  ask_again_on: string | null;
};

export type MyPersonRequest = {
  id: string;
  trainer_id: string;
  trainer_name: string | null;
  business_name: string | null;
  trainer_avatar: string | null;
  note: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
};

// Null on an older database, where the profile keeps round 2's share-your-email flow.
export async function loadRequestState(trainerId: string): Promise<RequestState | null> {
  const answer = await callRpc<RequestState | null>('trainer_request_state', { p_trainer: trainerId });
  if (answer.missing || !answer.data) return null;
  const d = answer.data;
  return {
    can_ask: !!d.can_ask,
    why: d.why ?? null,
    request: d.request ?? null,
    waiting_with: d.waiting_with ?? null,
    ask_again_on: d.ask_again_on ? String(d.ask_again_on).slice(0, 10) : null,
  };
}

// Sends the request. Pressing Send under the words of what the trainer will see is the person's
// agreement, recorded with it. Returns the request's id.
export async function askTrainer(trainerId: string, note: string | null, phone: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('ask_trainer', {
    p_trainer: trainerId,
    p_note: note,
    p_phone: phone,
    p_consent: true,
  });
  if (error) throw error;
  return data as string;
}

// True when it was withdrawn now; false when the trainer had answered it already.
export async function withdrawAsk(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('withdraw_request', { p_request: id });
  if (error) throw error;
  return data === true;
}

// The person's requests to trainers, waiting or from the last 30 days, newest first. Null on an older
// database.
export async function loadMyAsks(): Promise<MyPersonRequest[] | null> {
  const answer = await callRpc<MyPersonRequest[] | null>('my_training_requests');
  if (answer.missing) return null;
  return answer.data ?? [];
}

export type ListedTrainer = PublicTrainer & { accepting_clients: boolean };

// The Trainers list with whether each is taking new clients. Empty for anyone who has a trainer. Null
// on an older database (the caller falls back to listTrainers).
export async function listTrainersV2(): Promise<ListedTrainer[] | null> {
  const answer = await callRpc<ListedTrainer[] | null>('list_trainers_v2');
  if (answer.missing) return null;
  return (answer.data ?? []).map((t) => ({ ...t, accepting_clients: t.accepting_clients !== false }));
}

// Whether a typed number can be a phone number, by the rules of the invite's WhatsApp numbers: South
// Africa's 10 digits from 0 (082 555 0303), or an international number with its country code.
export function isPhoneNumber(phone: string): boolean {
  const kept = phone.trim().replace(/[^\d+]/g, '');
  const plus = kept.startsWith('+');
  let digits = kept.replace(/\+/g, '');
  if (!digits) return false;
  if (plus) {
    // Already international.
  } else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  else if (!(digits.startsWith('27') && digits.length >= 11) && digits.length <= 10) digits = `27${digits}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return false;
  const known = [
    { code: '27', digits: 9 },
    { code: '1', digits: 10 },
    { code: '61', digits: 9 },
  ].find((c) => digits.startsWith(c.code));
  if (known) {
    const national = digits.slice(known.code.length);
    if (national.length !== known.digits || national.startsWith('0')) return false;
  }
  return true;
}
