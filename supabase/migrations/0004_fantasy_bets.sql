-- Fantasy football bets: the app is the house. Matchups and scores come from Yahoo via the
-- fantasy-sync Edge Function, which also calls settle_fantasy_bets().
-- Lines come from Yahoo's projected points and are locked at the moment a bet is placed.
-- Every bet pays -110 (win 100 per 110 staked).

create type fantasy_market as enum ('spread', 'over', 'under');
create type fantasy_bet_status as enum ('open', 'won', 'lost', 'push');

create table fantasy_matchups (
  id text primary key, -- '<team1_key>:<week>'
  league_key text not null,
  league_name text not null,
  week int not null,
  starts_at timestamptz not null, -- betting closes here
  completed boolean not null default false,
  team1_key text not null,
  team1_name text not null,
  team1_points numeric not null default 0,
  team1_projected numeric,
  team2_key text not null,
  team2_name text not null,
  team2_points numeric not null default 0,
  team2_projected numeric,
  updated_at timestamptz not null default now()
);
create index on fantasy_matchups (league_key, week);

create table fantasy_bets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  matchup_id text not null references fantasy_matchups,
  market fantasy_market not null,
  team_key text not null, -- spread: the team picked; over/under: the team whose weekly score is bet on
  point numeric not null, -- spread: handicap added to the picked team's margin; over/under: the score line
  price int not null default -110,
  stake int not null check (stake > 0),
  status fantasy_bet_status not null default 'open',
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index on fantasy_bets (matchup_id) where status = 'open';
create index on fantasy_bets (group_id, user_id);

alter table fantasy_matchups enable row level security;
alter table fantasy_bets enable row level security;

create policy "matchups readable" on fantasy_matchups for select to authenticated using (true);
create policy "members read fantasy bets" on fantasy_bets for select to authenticated using (is_member(group_id));
-- No write policies: bets go through place_fantasy_bet, matchups are written by the service role.

create function place_fantasy_bet(p_group uuid, p_matchup text, p_market fantasy_market, p_team text, p_stake int)
returns fantasy_bets
language plpgsql security definer set search_path = public as $$
declare
  m fantasy_matchups;
  mine numeric; -- projected points of p_team
  theirs numeric;
  line numeric;
  b fantasy_bets;
  bal int;
begin
  -- Lock the membership row so two concurrent bets can't both pass the balance check.
  perform 1 from group_members where group_id = p_group and user_id = auth.uid() for update;
  if not found then raise exception 'Not a member of this group'; end if;

  select * into m from fantasy_matchups where id = p_matchup and starts_at > now();
  if m.id is null then raise exception 'Betting is closed for this matchup'; end if;
  if p_team not in (m.team1_key, m.team2_key) then raise exception 'Team is not in this matchup'; end if;
  if m.team1_projected is null or m.team2_projected is null then raise exception 'No line for this matchup yet'; end if;

  mine := case when p_team = m.team1_key then m.team1_projected else m.team2_projected end;
  theirs := case when p_team = m.team1_key then m.team2_projected else m.team1_projected end;
  -- Lines are rounded to the half point so a push is rare.
  line := round((case when p_market = 'spread' then theirs - mine else mine end) * 2) / 2;

  select coalesce(sum(amount), 0) into bal from ledger_entries where group_id = p_group and user_id = auth.uid();
  if p_stake <= 0 or p_stake > bal then raise exception 'Stake must be between 1 and your balance (%)', bal; end if;

  insert into fantasy_bets (group_id, user_id, matchup_id, market, team_key, point, stake)
  values (p_group, auth.uid(), p_matchup, p_market, p_team, line, p_stake)
  returning * into b;

  insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
  values (p_group, auth.uid(), -p_stake, 'bet_stake', b.id);
  return b;
end $$;

-- Settles every open bet on a completed matchup.
create function settle_fantasy_bets() returns int
language plpgsql security definer set search_path = public as $$
declare
  b record;
  margin numeric; -- > 0 win, = 0 push, < 0 loss, from the bettor's side
  mine numeric;
  theirs numeric;
  result fantasy_bet_status;
  n int := 0;
begin
  for b in
    select fb.*, m.team1_key, m.team1_points, m.team2_points
    from fantasy_bets fb join fantasy_matchups m on m.id = fb.matchup_id
    where fb.status = 'open' and m.completed
    for update of fb
  loop
    mine := case when b.team_key = b.team1_key then b.team1_points else b.team2_points end;
    theirs := case when b.team_key = b.team1_key then b.team2_points else b.team1_points end;
    margin := case b.market
      when 'spread' then mine - theirs + b.point
      when 'over'   then mine - b.point
      when 'under'  then b.point - mine
    end;
    result := case when margin > 0 then 'won' when margin = 0 then 'push' else 'lost' end;

    update fantasy_bets set status = result, settled_at = now() where id = b.id;

    if result = 'won' then
      insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
      values (b.group_id, b.user_id, b.stake + floor(b.stake * 100.0 / -b.price)::int, 'bet_payout', b.id);
    elsif result = 'push' then
      insert into ledger_entries (group_id, user_id, amount, reason, ref_id)
      values (b.group_id, b.user_id, b.stake, 'bet_refund', b.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function place_fantasy_bet from anon;
revoke execute on function settle_fantasy_bets from public, anon, authenticated;
