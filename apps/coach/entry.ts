// Where the app starts. A link from a sign-up or password email is taken out of the address first, before Expo
// Router or Supabase read it (see takeHeldLink in lib/links.ts); then Expo Router starts the app as usual.
import './src/lib/links';
import 'expo-router/entry';
