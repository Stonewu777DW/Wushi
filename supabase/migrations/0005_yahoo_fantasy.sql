-- Yahoo Fantasy linking. Tokens and OAuth states are server-only (RLS on, no policies):
-- only the yahoo-* edge functions, using the service role, read or write them.

create table yahoo_oauth_states (
  state text primary key,
  user_id uuid not null references profiles on delete cascade,
  return_url text not null,
  created_at timestamptz not null default now()
);

create table yahoo_tokens (
  user_id uuid primary key references profiles on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);

-- A snapshot of each linked team, refreshed by the yahoo-sync function.
create table fantasy_teams (
  team_key text primary key, -- Yahoo key, e.g. 461.l.12345.t.3
  user_id uuid not null references profiles on delete cascade,
  team_name text not null,
  league_name text not null,
  logo_url text,
  wins int not null default 0,
  losses int not null default 0,
  ties int not null default 0,
  rank int,
  points_for numeric not null default 0,
  synced_at timestamptz not null default now()
);
create index on fantasy_teams (user_id);

alter table yahoo_oauth_states enable row level security;
alter table yahoo_tokens enable row level security;
alter table fantasy_teams enable row level security;

create policy "fantasy teams readable by signed-in users" on fantasy_teams for select to authenticated using (true);
