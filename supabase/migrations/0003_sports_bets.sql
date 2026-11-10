-- Sports bets: the app is the house. Games and lines come from The Odds API via the
-- sync-sports Edge Function, which also records final scores and calls settle_sports_bets().
-- A bet locks the line (point + American price) it was placed at.

create type sports_market as enum ('h2h', 'spreads', 'totals');
create type sports_outcome as enum ('home', 'away', 'over', 'under');
create type sports_bet_status as enum ('open', 'won', 'lost', 'push');

create table games (
  id text primary key, -- The Odds API event id
  sport text not null, -- e.g. americanfootball_nfl
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  home_score int,
  away_score int,
  completed boolean not null default false
);
create index on games (sport, commence_time);

create table game_lines (
  game_id text not null references games on delete cascade,
  market sports_market not null,
  outcome sports_outcome not null,
  point numeric, -- spread or total; null for moneyline
  price int not null check (price <= -100 or price >= 100), -- American odds
  updated_at timestamptz not null default now(),
  primary key (game_id, market, outcome)
);

create table sports_bets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  game_id text not null references games,
  market sports_market not null,
  outcome sports_outcome not null,
  point numeric,
  price int not null,
  stake int not null check (stake > 0),
  status sports_bet_status not null default 'open',
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index on sports_bets (game_id) where status = 'open';
create index on sports_bets (group_id, user_id);

alter table games enable row level security;
alter table game_lines enable row level security;
alter table sports_bets enable row level security;

create policy "games readable" on games for select to authenticated using (true);
create policy "lines readable" on game_lines for select to authenticated using (true);
create policy "members read sports bets" on sports_bets for select to authenticated using (is_member(group_id));
-- No write policies: bets go through place_sports_bet, games/lines are written by the service role.

create function place_sports_bet(p_group uuid, p_game text, p_market sports_market, p_outcome sports_outcome, p_stake int)
returns sports_bets
language plpgsql security definer set search_path = public as $$
declare
  l game_lines;
  b sports_bets;
  bal int;
begin
  -- Lock the membership row so two concurrent bets can't both pass the balance check.
  perform 1 from group_members where group_id = p_group and user_id = auth.uid() for update;
  if not found then raise exception 'Not a member of this group'; end if;

  if not exists (select 1 from games where id = p_game and commence_time > now()) then
    raise exception 'Betting is closed for this game';
  end if;

  select * into l from game_lines where game_id = p_game and market = p_market and outcome = p_outcome;
  if l.game_id is null then raise exception 'No line for this bet'; end if;

  select coalesce(sum(amount), 0) into bal from ledger_entries where group_id = p_group and user_id = auth.uid();
  if p_stake <= 0 or p_stake > bal then raise exception 'Stake must be between 1 and your balance (%)', bal; end if;

  insert into sports_bets (group_id, user_id, game_id, market, outcome, point, price, stake)
  values (p_group, auth.uid(), p_game, p_market, p_outcome, l.point, l.price, p_stake)
  returning * into b;

  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
  values (p_group, auth.uid(), -p_stake, 'bet_stake', b.id);
  return b;
end $$;

-- Settles every open bet on a completed game. Ties on a moneyline are a push (NFL has no draw line).
create function settle_sports_bets() returns int
language plpgsql security definer set search_path = public as $$
declare
  b record;
  margin numeric; -- > 0 win, = 0 push, < 0 loss, from the bettor's side
  result sports_bet_status;
  n int := 0;
begin
  for b in
    select sb.*, g.home_score, g.away_score
    from sports_bets sb join games g on g.id = sb.game_id
    where sb.status = 'open' and g.completed
    for update of sb
  loop
    margin := case b.outcome
      when 'home'  then b.home_score - b.away_score + coalesce(b.point, 0)
      when 'away'  then b.away_score - b.home_score + coalesce(b.point, 0)
      when 'over'  then b.home_score + b.away_score - b.point
      when 'under' then b.point - (b.home_score + b.away_score)
    end;
    result := case when margin > 0 then 'won' when margin = 0 then 'push' else 'lost' end;

    update sports_bets set status = result, settled_at = now() where id = b.id;

    if result = 'won' then
      insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
      values (b.group_id, b.user_id,
        b.stake + floor(case when b.price > 0 then b.stake * b.price / 100.0 else b.stake * 100.0 / -b.price end)::int,
        'bet_payout', b.id);
    elsif result = 'push' then
      insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
      values (b.group_id, b.user_id, b.stake, 'bet_refund', b.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function place_sports_bet from anon;
revoke execute on function settle_sports_bets from public, anon, authenticated;
