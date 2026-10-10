// A person's private calendar link. Voltrix and Voltrix Coach show it in Settings, Calendar link;
// the person adds it to Google Calendar, Apple Calendar or Outlook, which fetch it every few
// hours: GET /functions/v1/calendar-feed/<token>.ics returns their sessions as an .ics file.
//
// Calendar apps can't sign in, so the function is deployed without Supabase's login check
// (verify_jwt = false in supabase/config.toml); the long random token in the link is the key.
// Resetting the link in the app makes a new token, and the old link stops working at once.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handle } from './feed.ts';

const env = {
  rest: `${Deno.env.get('SUPABASE_URL')!}/rest/v1`,
  key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
};

Deno.serve((req) => handle(req, env));
