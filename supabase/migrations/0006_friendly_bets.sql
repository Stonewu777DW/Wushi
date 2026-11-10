-- Friendly bets: a member (the maker) sets a two-sided line about something or someone in the group.
-- Everyone else bets even money on a side (winners get 2x their stake back).
-- The maker is judged on the line:
--   * one-sided (80%+ of the coins on the winning side): the maker pays the gap, winners' payout minus losers' stakes;
--   * 40%+ of the coins on the losing side: the maker earns a bonus;
--   * in between: nothing. The app covers any shortfall and keeps any surplus.
-- If the maker picks app_banks, the app is the bookie: the maker is never punished and holds no escrow.
-- Every ledger entry written here sets ref_id = bet id.

create type bet_side as enum ('a', 'b');
create type bet_significance as enum ('small', 'medium', 'big');
create type bet_status as enum ('open', 'resolved', 'cancelled');

create table friendly_bets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  maker_id uuid not null references profiles,
  subject_id uuid references profiles, -- who the bet is about; null for a bet about something
  title text not null check (length(title) between 1 and 120),
  side_a text not null check (length(side_a) between 1 and 60),
  side_b text not null check (length(side_b) between 1 and 60),
  closes_at timestamptz not null, -- betting stops here; the maker resolves afterwards
  status bet_status not null default 'open',
  winning_side bet_side,
  app_banks boolean not null default false, -- the app, not the maker, backs the bet
  significance bet_significance not null, -- chosen by the maker
  reward_multiplier int not null check (reward_multiplier >= 1), -- significance x duration, fixed at creation
  min_wager int not null, -- scales with the multiplier: bigger, longer bets demand more and allow more
  max_wager int not null,
  escrow_held int not null default 0, -- maker's worst-case payout, held from their balance while open
  maker_reward int, -- coins credited (+) or charged (-) to the maker at settlement
  created_at timestamptz not null default now(),
  check (maker_id <> subject_id),
  check ((status = 'resolved') = (winning_side is not null))
);
create index on friendly_bets (group_id, created_at desc);

create table friendly_wagers (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references friendly_bets on delete cascade,
  user_id uuid not null references profiles,
  side bet_side not null,
  amount int not null check (amount > 0),
  payout int, -- coins returned at settlement (2x amount if won, 0 if lost, amount if cancelled)
  created_at timestamptz not null default now()
);
create index on friendly_wagers (bet_id);

-- The subject must not know a bet exists until it is no longer open.
create function is_hidden_bet(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendly_bets where id = b and subject_id = auth.uid() and status = 'open');
$$;

alter table friendly_bets enable row level security;
alter table friendly_wagers enable row level security;

create policy "members read bets" on friendly_bets for select to authenticated
  using (is_member(group_id) and not is_hidden_bet(id));
create policy "members read wagers" on friendly_wagers for select to authenticated
  using (exists (select 1 from friendly_bets where id = bet_id)); -- inherits the bet's visibility

-- Stakes and escrow in the ledger would reveal a hidden bet, so hide those rows too.
drop policy "members read ledger" on ledger_entries;
create policy "members read ledger" on ledger_entries for select to authenticated
  using (is_member(group_id) and (ref_id is null or not is_hidden_bet(ref_id)));

-- Serialises balance changes for the given members so two bets can't both spend the same coins.
create function lock_members(g uuid, u1 uuid, u2 uuid) returns void
language sql security definer set search_path = public as $$
  select 1 from group_members where group_id = g and user_id in (u1, u2) order by user_id for update;
$$;

create function balance_of(g uuid, u uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ledger_entries where group_id = g and user_id = u;
$$;

-- Multiplier = significance (small 1x, medium 2x, big 3x) x duration (<1 day 1x, <1 week 2x, <1 month 3x, longer 5x).
-- It scales the maker's bonus and the wager limits: min 10 x multiplier, max 50 x multiplier.
create function reward_multiplier_for(sig bet_significance, closes timestamptz) returns int
language sql stable as $$
  select (case sig when 'small' then 1 when 'medium' then 2 else 3 end) * (case
    when closes - now() < interval '1 day' then 1
    when closes - now() < interval '7 days' then 2
    when closes - now() < interval '30 days' then 3
    else 5 end);
$$;

create function create_friendly_bet(
  p_group_id uuid, p_title text, p_side_a text, p_side_b text, p_subject_id uuid, p_closes_at timestamptz,
  p_significance bet_significance, p_app_banks boolean default false
) returns friendly_bets
language plpgsql security definer set search_path = public as $$
declare b friendly_bets; m int;
begin
  if not is_member(p_group_id) then raise exception 'Not a member of this group'; end if;
  if p_subject_id is not null and not exists (select 1 from group_members where group_id = p_group_id and user_id = p_subject_id) then
    raise exception 'Subject is not in this group';
  end if;
  if p_closes_at <= now() then raise exception 'Closing time must be in the future'; end if;
  m := reward_multiplier_for(p_significance, p_closes_at);
  insert into friendly_bets (group_id, maker_id, subject_id, title, side_a, side_b, closes_at, significance, app_banks, reward_multiplier, min_wager, max_wager)
  values (p_group_id, auth.uid(), p_subject_id, p_title, p_side_a, p_side_b, p_closes_at, p_significance, p_app_banks, m, 10 * m, 50 * m)
  returning * into b;
  return b;
end $$;

create function place_friendly_wager(p_bet_id uuid, p_side bet_side, p_amount int) returns friendly_wagers
language plpgsql security definer set search_path = public as $$
declare
  b friendly_bets;
  w friendly_wagers;
  pool_a int; pool_b int; needed int;
begin
  select * into b from friendly_bets where id = p_bet_id for update;
  if b.id is null or not is_member(b.group_id) then raise exception 'Bet not found'; end if;
  if b.status <> 'open' or b.closes_at <= now() then raise exception 'Betting is closed'; end if;
  if auth.uid() in (b.maker_id, b.subject_id) then raise exception 'The maker and the subject cannot bet'; end if;
  if p_amount < b.min_wager or p_amount > b.max_wager then
    raise exception 'Wager must be between % and % WuCoins', b.min_wager, b.max_wager;
  end if;
  perform lock_members(b.group_id, auth.uid(), b.maker_id);

  if balance_of(b.group_id, auth.uid()) < p_amount then raise exception 'Not enough WuCoins'; end if;
  insert into friendly_wagers (bet_id, user_id, side, amount) values (p_bet_id, auth.uid(), p_side, p_amount) returning * into w;
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
  values (b.group_id, auth.uid(), -p_amount, 'bet_stake', b.id);

  -- Maker's worst case: if one side holds 80%+ of the coins and wins, the maker pays the gap. Hold that.
  select coalesce(sum(amount) filter (where side = 'a'), 0), coalesce(sum(amount) filter (where side = 'b'), 0)
    into pool_a, pool_b from friendly_wagers where bet_id = b.id;
  needed := case when not b.app_banks and greatest(pool_a, pool_b) * 10 >= (pool_a + pool_b) * 8
                 then abs(pool_a - pool_b) else 0 end;
  if needed > b.escrow_held then
    if balance_of(b.group_id, b.maker_id) < needed - b.escrow_held then
      raise exception 'The maker cannot cover this wager yet';
    end if;
  end if;
  if needed <> b.escrow_held then
    insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (b.group_id, b.maker_id, b.escrow_held - needed, 'maker_escrow', b.id);
    update friendly_bets set escrow_held = needed where id = b.id;
  end if;
  return w;
end $$;

-- Pays out an open bet. winner = null cancels it and refunds every stake.
create function settle_friendly_bet(b friendly_bets, winner bet_side) returns friendly_bets
language plpgsql security definer set search_path = public as $$
declare
  won int; lost int; reward int;
begin
  perform lock_members(b.group_id, b.maker_id, b.maker_id);
  if b.escrow_held > 0 then
    insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (b.group_id, b.maker_id, b.escrow_held, 'maker_escrow', b.id);
  end if;

  if winner is null then
    update friendly_wagers set payout = amount where bet_id = b.id;
    insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
      select b.group_id, user_id, sum(amount), 'bet_refund', b.id from friendly_wagers where bet_id = b.id group by user_id;
    update friendly_bets set status = 'cancelled', escrow_held = 0 where id = b.id returning * into b;
    return b;
  end if;

  update friendly_wagers set payout = case when side = winner then amount * 2 else 0 end where bet_id = b.id;
  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    select b.group_id, user_id, sum(payout), 'bet_payout', b.id
    from friendly_wagers where bet_id = b.id and side = winner group by user_id;

  select coalesce(sum(amount) filter (where side = winner), 0), coalesce(sum(amount) filter (where side <> winner), 0)
    into won, lost from friendly_wagers where bet_id = b.id;
  reward := 0;
  if not b.app_banks and won * 10 >= (won + lost) * 8 then
    reward := lost - won; -- one-sided line: the maker pays the gap
  end if;
  if lost * 10 >= (won + lost) * 4 then
    reward := reward + (least(won, lost) / 10) * b.reward_multiplier; -- 10% of the matched volume x multiplier
  end if;
  if reward <> 0 then
    insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
    values (b.group_id, b.maker_id, reward, 'maker_settlement', b.id);
  end if;
  update friendly_bets set status = 'resolved', winning_side = winner, maker_reward = reward, escrow_held = 0
    where id = b.id returning * into b;
  return b;
end $$;

create function resolve_friendly_bet(p_bet_id uuid, p_winning_side bet_side) returns friendly_bets
language plpgsql security definer set search_path = public as $$
declare b friendly_bets;
begin
  select * into b from friendly_bets where id = p_bet_id for update;
  if b.id is null or b.maker_id <> auth.uid() then raise exception 'Only the maker can resolve this bet'; end if;
  if b.status <> 'open' then raise exception 'Bet is already settled'; end if;
  if b.closes_at > now() then raise exception 'Betting has not closed yet'; end if;
  return settle_friendly_bet(b, p_winning_side);
end $$;

create function cancel_friendly_bet(p_bet_id uuid) returns friendly_bets
language plpgsql security definer set search_path = public as $$
declare b friendly_bets;
begin
  select * into b from friendly_bets where id = p_bet_id for update;
  if b.id is null or b.maker_id <> auth.uid() then raise exception 'Only the maker can cancel this bet'; end if;
  if b.status <> 'open' then raise exception 'Bet is already settled'; end if;
  if b.closes_at <= now() then raise exception 'Betting has closed; resolve the bet instead'; end if;
  return settle_friendly_bet(b, null);
end $$;

-- Internal helpers are not callable from the API.
revoke execute on function settle_friendly_bet, lock_members, balance_of, reward_multiplier_for from public, anon, authenticated;
revoke execute on function create_friendly_bet, place_friendly_wager, resolve_friendly_bet, cancel_friendly_bet from anon;

-- A friendly bet with no payout and no maker settlement (everyone lost) still counts as settled for leaderboards.
create or replace view settled_results with (security_invoker = true) as
  with settled as (
    select ref_id, max(created_at) as settled_at
    from ledger_entries
    where ref_id is not null
    group by ref_id
    having bool_or(reason in ('bet_payout', 'bet_refund', 'maker_settlement'))
      or ref_id in (select id from friendly_bets where status <> 'open')
  )
  select l.group_id, l.user_id, l.amount, s.settled_at
  from ledger_entries l
  join settled s using (ref_id);
