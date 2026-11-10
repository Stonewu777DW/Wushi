# Wushi

Betting between friends with WuCoins. Expo (React Native) + TypeScript, Supabase for auth and Postgres.

## Setup

1. Create a Supabase project. Under Authentication > Email, make the template send the `{{ .Token }}` code (the app signs in with a 6-digit code, not a link).
2. Run `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push`). `0002` creates the public `avatars` storage bucket.
3. `cp .env.example .env` and fill in the project URL and anon key.
4. `npm install && npx expo start`

### NFL lines and auto-settlement

The app is the house for sports bets. `supabase/functions/sync-sports` pulls NFL games and lines (moneyline, spread, total; DraftKings when listed) and final scores from [The Odds API](https://the-odds-api.com), then settles open bets.

1. Get an Odds API key, then set the function's secrets and deploy it (the cron call authenticates with `CRON_SECRET`, not a JWT):
   ```sh
   supabase secrets set ODDS_API_KEY=... CRON_SECRET=$(openssl rand -hex 16)
   supabase functions deploy sync-sports --no-verify-jwt
   ```
2. Enable the `pg_cron` and `pg_net` extensions, store the URL and secret in Vault, and schedule it:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<same CRON_SECRET>', 'cron_secret');
   select cron.schedule('sync-sports', '0 */6 * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-sports',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
     );
   $$);
   ```
   Each run costs 5 Odds API credits (3 for odds, 2 for scores). Every 6 hours is about 600 credits a month, just over the free tier's 500; every 8 hours fits.

## How coins work

- WuCoins are per group: each group is its own league and everyone starts with `starting_coins`.
- Balances are never stored. `ledger_entries` records every coin movement and `group_balances` sums it.
- Clients cannot write groups, memberships or ledger rows directly (RLS). They go through `create_group` / `join_group` and `place_sports_bet`.
- A sports bet locks the line it was placed at and closes at kickoff. Wins pay stake plus profit at American odds (rounded down), pushes refund the stake.

## Layout

- `src/app/` — screens (Expo Router)
- `src/lib/` — Supabase client, session, shared types and styles
- `supabase/migrations/` — schema, RLS and database functions
