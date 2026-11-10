-- Tournaments: real-life events (golf, poker...) inside a group.
-- Players buy in with WuCoins, the host ranks the players when it's over, and the pot is paid out
-- by a split fixed at creation (e.g. {100} winner takes all, {60,40}, {50,30,20}).
-- Every coin movement is a ledger entry with ref_id = tournament id.

alter type ledger_reason add value 'tournament_buy_in';
alter type ledger_reason add value 'tournament_payout';
alter type ledger_reason add value 'tournament_refund';

create type tournament_status as enum ('open', 'completed', 'cancelled');

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  host_id uuid not null references profiles,
  name text not null check (length(name) between 1 and 60),
  buy_in int not null check (buy_in > 0),
  payout_split int[] not null check (cardinality(payout_split) between 1 and 5), -- percentages, validated in create_tournament
  status tournament_status not null default 'open',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on tournaments (group_id);

create table tournament_players (
  tournament_id uuid not null references tournaments on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  place int check (place > 0),     -- set on completion, only for paid places
  payout int check (payout > 0),
  primary key (tournament_id, user_id)
);

alter table tournaments enable row level security;
alter table tournament_players enable row level security;

create policy "members read tournaments" on tournaments for select to authenticated using (is_member(group_id));
create policy "members read tournament players" on tournament_players for select to authenticated
  using (is_member((select group_id from tournaments where id = tournament_id)));
-- No write policies: tournaments change only through the functions below.

create function create_tournament(g uuid, tournament_name text, buy_in_amount int, split int[]) returns tournaments
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  if not is_member(g) then raise exception 'Not a member of this group'; end if;
  if (select coalesce(bool_and(p > 0), false) from unnest(split) p) is not true or (select sum(p) from unnest(split) p) <> 100 then
    raise exception 'Payout split must be positive percentages adding up to 100';
  end if;
  insert into tournaments (group_id, host_id, name, buy_in, payout_split)
    values (g, auth.uid(), tournament_name, buy_in_amount, split) returning * into t;
  return t;
end $$;

create function join_tournament(t_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  select * into t from tournaments where id = t_id for update;
  if t.id is null or not is_member(t.group_id) then raise exception 'Tournament not found'; end if;
  if t.status <> 'open' then raise exception 'Tournament is not open'; end if;
  -- Serialize this user's coin spending so concurrent joins can't overdraw them.
  perform 1 from group_members where group_id = t.group_id and user_id = auth.uid() for update;
  if (select coalesce(sum(amount), 0) from ledger_entries where group_id = t.group_id and user_id = auth.uid()) < t.buy_in then
    raise exception 'Not enough WuCoins';
  end if;
  insert into tournament_players (tournament_id, user_id) values (t.id, auth.uid()); -- fails if already joined
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (t.group_id, auth.uid(), -t.buy_in, 'tournament_buy_in', t.id);
end $$;

create function leave_tournament(t_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  select * into t from tournaments where id = t_id for update;
  if t.id is null or not is_member(t.group_id) then raise exception 'Tournament not found'; end if;
  if t.status <> 'open' then raise exception 'Tournament is not open'; end if;
  delete from tournament_players where tournament_id = t.id and user_id = auth.uid();
  if not found then raise exception 'You have not joined this tournament'; end if;
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (t.group_id, auth.uid(), t.buy_in, 'tournament_refund', t.id);
end $$;

-- ranked = player ids from 1st place down, one per paid place in the split.
-- Pot = buy_in * players; each place gets floor(pot * share / 100), rounding leftovers go to 1st.
create function complete_tournament(t_id uuid, ranked uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tournaments;
  pot int;
  leftover int;
  i int;
begin
  select * into t from tournaments where id = t_id for update;
  if t.id is null or not is_member(t.group_id) then raise exception 'Tournament not found'; end if;
  if t.host_id <> auth.uid() then raise exception 'Only the host can enter results'; end if;
  if t.status <> 'open' then raise exception 'Tournament is not open'; end if;
  if cardinality(ranked) <> cardinality(t.payout_split) then
    raise exception 'Rank exactly % players', cardinality(t.payout_split);
  end if;
  if (select count(distinct r) from unnest(ranked) r) <> cardinality(ranked) then
    raise exception 'A player can only place once';
  end if;
  if exists (select 1 from unnest(ranked) r where not exists (
    select 1 from tournament_players where tournament_id = t.id and user_id = r)) then
    raise exception 'Ranked players must have joined the tournament';
  end if;

  pot := t.buy_in * (select count(*) from tournament_players where tournament_id = t.id);
  leftover := pot - (select sum(pot * p / 100) from unnest(t.payout_split) p);
  for i in 1 .. cardinality(ranked) loop
    update tournament_players
      set place = i, payout = nullif(pot * t.payout_split[i] / 100 + case when i = 1 then leftover else 0 end, 0)
      where tournament_id = t.id and user_id = ranked[i];
  end loop;

  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    select t.group_id, user_id, payout, 'tournament_payout', t.id
    from tournament_players where tournament_id = t.id and payout > 0;
  update tournaments set status = 'completed', completed_at = now() where id = t.id;
end $$;

create function cancel_tournament(t_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  select * into t from tournaments where id = t_id for update;
  if t.id is null or not is_member(t.group_id) then raise exception 'Tournament not found'; end if;
  if t.host_id <> auth.uid() then raise exception 'Only the host can cancel'; end if;
  if t.status <> 'open' then raise exception 'Tournament is not open'; end if;
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    select t.group_id, user_id, t.buy_in, 'tournament_refund', t.id from tournament_players where tournament_id = t.id;
  update tournaments set status = 'cancelled' where id = t.id;
end $$;

revoke execute on function create_tournament, join_tournament, leave_tournament, complete_tournament, cancel_tournament from anon;
