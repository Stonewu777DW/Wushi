-- One place that says when a bet, event or anything else with ledger entries (ref_id) is settled.
-- Leaderboards count a ref_id's entries in the period it settles. Before this, "settled" meant
-- "has a payout or refund entry", so a lost bet (stake only, nothing paid back) never counted.
-- Every settle/complete/cancel function must insert its ref_id here, once.

create table settlements (
  ref_id uuid primary key,
  settled_at timestamptz not null default now()
);
alter table settlements enable row level security;
-- Ids and times only, so any signed-in user may read them (settled_results runs as the caller).
create policy "read settlements" on settlements for select to authenticated using (true);
-- No write policy: only security definer settle functions insert.

insert into settlements (ref_id, settled_at)
  select id, settled_at from sports_bets where status <> 'open';

create or replace view settled_results with (security_invoker = true) as
  select l.group_id, l.user_id, l.amount, s.settled_at
  from ledger_entries l
  join settlements s using (ref_id);

create or replace function settle_sports_bets() returns int
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
    insert into settlements (ref_id) values (b.id);

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
