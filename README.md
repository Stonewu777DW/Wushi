# Wushi

Betting between friends with WuCoins. Expo (React Native) + TypeScript, Supabase for auth and Postgres.

## Setup

1. Create a Supabase project. Under Authentication > Sign In / Providers > Email, turn off "Confirm email". Accounts are username + password; the app maps each username to a placeholder email that never receives mail.
2. Run `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push`). `0002` creates the public `avatars` storage bucket.
3. `cp .env.example .env` (it already points at the shared Supabase project).
4. `npm install && npx expo start`

## Web link

`.github/workflows/deploy-web.yml` deploys the web build to Expo Hosting (needs the `EXPO_TOKEN` repo secret). Pull request #N gets a preview at https://wushi--pr-N.expo.app; merging to `main` updates https://wushi.expo.app, the link to share with friends.

## How coins work

- WuCoins are per group: each group is its own league and everyone starts with `starting_coins`.
- Balances are never stored. `ledger_entries` records every coin movement and `group_balances` sums it.
- Clients cannot write groups, memberships or ledger rows directly (RLS). They go through `create_group` / `join_group`, and later the betting functions.

## Layout

- `src/app/` — screens (Expo Router)
- `src/lib/` — Supabase client, session, shared types and styles
- `supabase/migrations/` — schema, RLS and database functions

## Leaderboards and awards

- Each group has a monthly and a yearly leaderboard ranked by net WuCoins won on bets settled in that period (`period_standings`). A bet counts in the period it settles, so stakes and payouts never split across months.
- `awards` lists the winner of every finished month (🏅) and year (🏆). Ties share the award; a winner must finish positive. Awards are derived from the ledger, so nothing needs to run at month end.
- Periods use the database clock (UTC).
