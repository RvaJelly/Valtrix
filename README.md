# Voltrix

Two mobile apps for personal trainers and their clients.

- `apps/coach` — Voltrix Coach, the trainer app (Expo, React Native).
- `apps/client` — Voltrix, the client app (Expo, React Native).
- `supabase/migrations` — database schema for the shared Supabase backend.
- `supabase/functions` — Edge Functions. `clean-expired-stories` deletes stories (and their files) once their
  24 hours are up; a database job calls it every hour without a key, so it must run with JWT verification turned
  off. `supabase/config.toml` sets that for `supabase functions deploy`; any other way of deploying it needs the
  setting turned off by hand.

## Run the trainer app

```bash
cd apps/coach
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone.
