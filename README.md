# Wushi

Betting between friends with WuCoins. Expo (React Native) + TypeScript, Supabase for auth and Postgres.

## Setup

1. Create a Supabase project. Under Authentication > Email, make the template send the `{{ .Token }}` code (the app signs in with a 6-digit code, not a link).
2. Run `supabase/migrations/*.sql` in order (SQL editor, or `supabase db push`).
3. `cp .env.example .env` and fill in the project URL and anon key.
4. `npm install && npx expo start`

## How coins work

- WuCoins are per group: each group is its own league and everyone starts with `starting_coins`.
- Balances are never stored. `ledger_entries` records every coin movement and `group_balances` sums it.
- Clients cannot write groups, memberships or ledger rows directly (RLS). They go through `create_group` / `join_group`, and later the betting functions.

## Layout

- `src/app/` — screens (Expo Router)
- `src/lib/` — Supabase client, session, shared types and styles
- `supabase/migrations/` — schema, RLS and database functions
