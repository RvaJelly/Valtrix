export type ClientStatus = 'active' | 'paused' | 'archived';

export type Client = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  goal: string | null;
  notes: string | null;
  status: ClientStatus;
  user_id: string | null;
  created_at: string;
};

export const CLIENT_COLUMNS = 'id, first_name, last_name, email, phone, goal, notes, status, user_id, created_at';

export function fullName(client: Pick<Client, 'first_name' | 'last_name'>) {
  return [client.first_name, client.last_name].filter(Boolean).join(' ');
}

export function initials(client: Pick<Client, 'first_name' | 'last_name'>) {
  return ((client.first_name[0] ?? '') + (client.last_name?.[0] ?? '')).toUpperCase();
}

export const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};
