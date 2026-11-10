# Wushi

Betting between friends with WuCoins. Expo (React Native) + TypeScript, Supabase for auth and Postgres.

## Setup

1. Create a Supabase project. Under Authentication > Sign In / Providers > Email, turn off "Confirm email". Accounts are username + password; the app maps each username to a placeholder email that never receives mail.
2. Run `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push`). `0002` creates the public `avatars` storage bucket.
3. `cp .env.example .env` (it already points at the shared Supabase project).
4. `npm install && npx expo start`

## Web link

`.github/workflows/deploy-web.yml` deploys the web build to Expo Hosting (needs the `EXPO_TOKEN` repo secret). Pull request #N gets a preview at https://wushi--pr-N.expo.app; merging to `main` updates https://wushi.expo.app, the link to share with friends.

### Sports lines and auto-settlement

The app is the house for sports bets on NFL, NBA, MLB and NHL. `supabase/functions/sync-sports` pulls games and lines (moneyline, spread, total; DraftKings when listed) and final scores from [The Odds API](https://the-odds-api.com), then settles open bets. To add a league, add its Odds API key to `SPORTS` in `src/lib/sports.ts` and in the function (leagues that can draw, like soccer, need a `draw` outcome first).

1. Get an Odds API key, then set the function's secrets and deploy it (the cron call authenticates with `CRON_SECRET`, not a JWT):
   ```sh
   supabase secrets set ODDS_API_KEY=... CRON_SECRET=$(openssl rand -hex 16)
   supabase functions deploy sync-sports --no-verify-jwt
   ```
2. Enable the `pg_cron` and `pg_net` extensions, store the URL and secret in Vault, and schedule it:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<same CRON_SECRET>', 'cron_secret');
   select cron.schedule('sync-sports', '0 14 * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-sports',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
     );
   $$);
   ```
   Each run costs 5 Odds API credits per in-season league (3 for odds, 2 for scores); off-season leagues are skipped. Daily is about 150 credits a month per league, so three leagues in season fit the free tier's 500. Lines are only as fresh as the schedule, and a bet locks the line it was placed at, so stale lines are the house's risk. Running more often (every 6 hours with three leagues is about 1,800 a month) needs a paid plan.

## How coins work

- WuCoins are per group: each group is its own league and everyone starts with `starting_coins`.
- Balances are never stored. `ledger_entries` records every coin movement and `group_balances` sums it.
- Clients cannot write groups, memberships or ledger rows directly (RLS). They go through `create_group` / `join_group` and `place_sports_bet`.
- A sports bet locks the line it was placed at and closes at kickoff. Wins pay stake plus profit at American odds (rounded down), pushes refund the stake.

## Layout

- `src/app/` — screens (Expo Router)
- `src/lib/` — Supabase client, session, shared types and styles
- `supabase/migrations/` — schema, RLS and database functions

## Leaderboards and awards

- Each group has a monthly and a yearly leaderboard ranked by net WuCoins won on bets settled in that period (`period_standings`). A bet counts in the period it settles, so stakes and payouts never split across months.
- `awards` lists the winner of every finished month (🏅) and year (🏆). Ties share the award; a winner must finish positive. Awards are derived from the ledger, so nothing needs to run at month end.
- Periods use the database clock (UTC).
