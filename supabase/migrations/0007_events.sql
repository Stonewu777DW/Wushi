-- Events: real-life group get-togethers (golf, poker, anything else) with WuCoins on the line.
-- Players buy in, the pot is paid out when the event ends, and every coin movement is a ledger
-- entry with ref_id = event id.
--
-- Three ways to split the pot:
--   other: the creator sets payout shares by place (e.g. {4,3,1,0} on a 400 pot pays 200/150/50/0);
--          the host ranks the players.
--   golf:  same shares, but players log rounds and the app ranks by net score (score - handicap).
--   poker: players enter their final chip counts and the pot is divided in proportion to chips.

alter type ledger_reason add value 'event_buy_in';
alter type ledger_reason add value 'event_payout';
alter type ledger_reason add value 'event_refund';

create type event_kind as enum ('other', 'golf', 'poker');
create type event_status as enum ('open', 'completed', 'cancelled');

create table events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  host_id uuid not null references profiles,
  name text not null check (length(name) between 1 and 60),
  kind event_kind not null default 'other',
  buy_in int not null check (buy_in > 0),
  -- Payout parts by place (validated in create_event). Null for poker, which pays by chips.
  payout_shares int[] check (cardinality(payout_shares) between 1 and 20),
  status event_status not null default 'open',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on events (group_id);

create table event_players (
  event_id uuid not null references events on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  chips int check (chips >= 0), -- poker only
  place int check (place > 0),  -- set on completion
  payout int check (payout > 0),
  primary key (event_id, user_id)
);

create table golf_rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  event_id uuid references events on delete set null,
  course text not null check (length(course) between 1 and 60),
  par int not null check (par between 27 and 80),
  score int not null check (score between 1 and 200),
  played_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on golf_rounds (group_id, user_id, played_on desc);
create unique index on golf_rounds (event_id, user_id) where event_id is not null;

alter table events enable row level security;
alter table event_players enable row level security;
alter table golf_rounds enable row level security;

create policy "members read events" on events for select to authenticated using (is_member(group_id));
create policy "members read event players" on event_players for select to authenticated
  using (is_member((select group_id from events where id = event_id)));
create policy "members read golf rounds" on golf_rounds for select to authenticated using (is_member(group_id));
-- No write policies: everything changes through the functions below.

create function create_event(g uuid, event_name text, event_type event_kind, buy_in_amount int, shares int[] default null) returns events
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  if not is_member(g) then raise exception 'Not a member of this group'; end if;
  if event_type = 'poker' then
    shares := null;
  elsif shares is null or (select bool_or(s is null or s < 0) from unnest(shares) s) or shares[1] is null or shares[1] <= 0 then
    raise exception 'Payout shares must be whole numbers with a positive first place';
  end if;
  insert into events (group_id, host_id, name, kind, buy_in, payout_shares)
    values (g, auth.uid(), event_name, event_type, buy_in_amount, shares) returning * into e;
  return e;
end $$;

create function join_event(e_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  -- Serialize this user's coin spending so concurrent joins can't overdraw them.
  perform 1 from group_members where group_id = e.group_id and user_id = auth.uid() for update;
  if (select coalesce(sum(amount), 0) from ledger_entries where group_id = e.group_id and user_id = auth.uid()) < e.buy_in then
    raise exception 'Not enough WuCoins';
  end if;
  if exists (select 1 from event_players where event_id = e.id and user_id = auth.uid()) then
    raise exception 'You have already joined this event';
  end if;
  insert into event_players (event_id, user_id) values (e.id, auth.uid());
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (e.group_id, auth.uid(), -e.buy_in, 'event_buy_in', e.id);
end $$;

create function leave_event(e_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  delete from event_players where event_id = e.id and user_id = auth.uid();
  if not found then raise exception 'You have not joined this event'; end if;
  delete from golf_rounds where event_id = e.id and user_id = auth.uid();
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (e.group_id, auth.uid(), e.buy_in, 'event_refund', e.id);
end $$;

create function cancel_event(e_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.host_id <> auth.uid() then raise exception 'Only the host can cancel'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    select e.group_id, user_id, e.buy_in, 'event_refund', e.id from event_players where event_id = e.id;
  update events set status = 'cancelled' where id = e.id;
  insert into settlements (ref_id) values (e.id);
end $$;

-- Shared by the completion paths: pays out event_players.payout and closes the event.
-- plpgsql, not sql: a sql body is checked when created, and 'event_payout' (added above in this
-- same transaction) can't be used until it's committed.
create function pay_out_event(e events) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    select e.group_id, user_id, payout, 'event_payout', e.id
    from event_players where event_id = e.id and payout > 0;
  update events set status = 'completed', completed_at = now() where id = e.id;
  insert into settlements (ref_id) values (e.id);
end $$;
revoke execute on function pay_out_event from public, anon, authenticated;

-- Golf and other events. ranked = every player, 1st place down.
-- Pot = buy_in * players. Place i gets pot * shares[i] / (sum of the first n shares); places past the
-- end of the shares list get 0. Rounding leftovers go to 1st.
create function complete_event(e_id uuid, ranked uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  e events;
  n int;
  pot int;
  total int;
  leftover int;
  i int;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.host_id <> auth.uid() then raise exception 'Only the host can enter results'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  if e.kind = 'poker' then raise exception 'Poker events are completed with complete_poker_event'; end if;

  select count(*) into n from event_players where event_id = e.id;
  if cardinality(ranked) <> n then raise exception 'Rank all % players', n; end if;
  if (select count(distinct r) from unnest(ranked) r) <> n
     or exists (select 1 from unnest(ranked) r where not exists (
       select 1 from event_players where event_id = e.id and user_id = r)) then
    raise exception 'Rank each player who joined exactly once';
  end if;

  pot := e.buy_in * n;
  select coalesce(sum(s), 0) into total from unnest(e.payout_shares[1:n]) s;
  if total = 0 then raise exception 'The first place share must be positive'; end if;
  leftover := pot - (select sum(pot * s / total) from unnest(e.payout_shares[1:n]) s);

  for i in 1 .. n loop
    update event_players
      set place = i,
          payout = nullif(pot * coalesce(e.payout_shares[i], 0) / total + case when i = 1 then leftover else 0 end, 0)
      where event_id = e.id and user_id = ranked[i];
  end loop;
  perform pay_out_event(e);
end $$;

-- Poker: a player (or the host) records a player's final chip count while the event is open.
create function set_poker_chips(e_id uuid, player uuid, chip_count int) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.kind <> 'poker' then raise exception 'Not a poker event'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  if player <> auth.uid() and e.host_id <> auth.uid() then raise exception 'Only you or the host can set your chips'; end if;
  update event_players set chips = chip_count where event_id = e.id and user_id = player;
  if not found then raise exception 'That player has not joined this event'; end if;
end $$;

-- Poker: the pot is divided in proportion to final chips. Rounding leftovers go to the biggest stack.
create function complete_poker_event(e_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e events;
  pot int;
  total int;
begin
  select * into e from events where id = e_id for update;
  if e.id is null or not is_member(e.group_id) then raise exception 'Event not found'; end if;
  if e.host_id <> auth.uid() then raise exception 'Only the host can enter results'; end if;
  if e.status <> 'open' then raise exception 'Event is not open'; end if;
  if e.kind <> 'poker' then raise exception 'Not a poker event'; end if;
  if exists (select 1 from event_players where event_id = e.id and chips is null) then
    raise exception 'Every player needs a chip count';
  end if;
  select sum(chips), e.buy_in * count(*) into total, pot from event_players where event_id = e.id;
  if coalesce(total, 0) = 0 then raise exception 'Nobody has any chips'; end if;

  with shares as (
    select user_id, chips, pot * chips / total as amt,
           row_number() over (order by chips desc, user_id) as place
    from event_players where event_id = e.id
  )
  update event_players p
    set place = s.place,
        payout = nullif(s.amt + case when s.place = 1 then pot - (select sum(amt) from shares) else 0 end, 0)
    from shares s where p.event_id = e.id and p.user_id = s.user_id;
  perform pay_out_event(e);
end $$;

-- Golf: log a round, optionally for an event you've joined. Par and score are for the holes played.
create function record_golf_round(g uuid, course_name text, course_par int, round_score int, round_date date default current_date, for_event uuid default null) returns golf_rounds
language plpgsql security definer set search_path = public as $$
declare r golf_rounds;
begin
  if not is_member(g) then raise exception 'Not a member of this group'; end if;
  if for_event is not null and not exists (
    select 1 from events e join event_players p on p.event_id = e.id
    where e.id = for_event and e.group_id = g and e.kind = 'golf' and e.status = 'open' and p.user_id = auth.uid()) then
    raise exception 'You can only log a round for an open golf event you joined';
  end if;
  insert into golf_rounds (group_id, user_id, event_id, course, par, score, played_on)
    values (g, auth.uid(), for_event, course_name, course_par, round_score, round_date) returning * into r;
  return r;
end $$;

-- Handicap = average of the best 8 of the last 20 rounds' (score - par). Rounds of the event being
-- scored are left out so a round can't change its own handicap. Null until a first round exists.
create function golf_handicap(g uuid, u uuid, excluding_event uuid default null) returns numeric
language sql stable security invoker set search_path = public as $$
  select round(avg(diff), 1) from (
    select diff from (
      select score - par as diff from golf_rounds
      where group_id = g and user_id = u and event_id is distinct from excluding_event
      order by played_on desc, created_at desc limit 20
    ) last20
    order by diff limit 8
  ) best8;
$$;

-- Net standings for a golf event, best first. Players with no handicap yet play off scratch (0).
-- Ties are broken by lower gross score; the host can reorder before completing.
create function golf_event_standings(e_id uuid) returns table (user_id uuid, score int, handicap numeric, net numeric)
language sql stable security invoker set search_path = public as $$
  select r.user_id, r.score,
         coalesce(golf_handicap(r.group_id, r.user_id, e_id), 0),
         r.score - coalesce(golf_handicap(r.group_id, r.user_id, e_id), 0)
  from golf_rounds r
  where r.event_id = e_id
  order by 4, r.score, r.created_at;
$$;

revoke execute on function create_event, join_event, leave_event, cancel_event, complete_event, set_poker_chips,
  complete_poker_event, record_golf_round, golf_handicap, golf_event_standings from anon;
