-- Wushi: profiles, private groups, invites, and the WuCoin ledger.
-- WuCoins are per group: each group is its own league, and everyone starts equal.
-- Balances are never stored; they are the sum of ledger entries.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text check (length(display_name) <= 40),
  bio text check (length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Accounts are username + password. Sign-up passes the username in user metadata and
-- the profile is created together with the account (a taken or invalid username fails sign-up).
create function create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;

create trigger create_profile after insert on auth.users
  for each row execute function create_profile_for_new_user();

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  starting_coins int not null default 1000 check (starting_coins > 0),
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create type ledger_reason as enum ('starting_coins', 'bet_stake', 'bet_payout', 'bet_refund', 'maker_escrow', 'maker_settlement');

create table ledger_entries (
  id bigint generated always as identity primary key,
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  amount int not null check (amount <> 0),
  reason ledger_reason not null,
  ref_id uuid, -- the bet/prediction this entry belongs to, if any
  created_at timestamptz not null default now()
);
create index on ledger_entries (group_id, user_id);

create view group_balances with (security_invoker = true) as
  select group_id, user_id, sum(amount)::int as balance
  from ledger_entries
  group by group_id, user_id;

-- Security definer so RLS policies can call it without recursing into group_members' own policy.
create function is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table ledger_entries enable row level security;

create policy "profiles readable by signed-in users" on profiles for select to authenticated using (true);
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid());

create policy "members read group" on groups for select to authenticated using (is_member(id));
create policy "members read membership" on group_members for select to authenticated using (is_member(group_id));
create policy "members read ledger" on ledger_entries for select to authenticated using (is_member(group_id));
-- No insert/update/delete policies: groups, memberships and coins change only through the functions below.

create function create_group(group_name text) returns groups
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  insert into groups (name, created_by) values (group_name, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  insert into ledger_entries (group_id, user_id, amount, reason) values (g.id, auth.uid(), g.starting_coins, 'starting_coins');
  return g;
end $$;

create function join_group(code text) returns groups
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  select * into g from groups where invite_code = upper(trim(code));
  if g.id is null then raise exception 'Invalid invite code'; end if;
  if is_member(g.id) then return g; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  insert into ledger_entries (group_id, user_id, amount, reason) values (g.id, auth.uid(), g.starting_coins, 'starting_coins');
  return g;
end $$;

revoke execute on function create_group, join_group from anon;
