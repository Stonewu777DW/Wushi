-- Monthly and yearly leaderboards, plus the awards they produce.
-- Ranking = net WuCoins won in the period. A bet counts in the period it settles,
-- so a stake placed on Jan 31 and paid out on Feb 1 is all February's result.
-- Periods follow the database clock (UTC on Supabase).

-- Coins won or lost on settled bets, stamped with the bet's settle time.
-- A bet (ref_id) is settled once any payout, refund or maker settlement exists for it.
create view settled_results with (security_invoker = true) as
  with settled as (
    select ref_id, max(created_at) as settled_at
    from ledger_entries
    where ref_id is not null
    group by ref_id
    having bool_or(reason in ('bet_payout', 'bet_refund', 'maker_settlement'))
  )
  select l.group_id, l.user_id, l.amount, s.settled_at
  from ledger_entries l
  join settled s using (ref_id);

-- Net coins per member for the current month or year. Members with no settled bets are absent (net 0).
create function period_standings(g uuid, period text) returns table (user_id uuid, net int)
language sql stable security invoker set search_path = public as $$
  select user_id, sum(amount)::int
  from settled_results
  where group_id = g and settled_at >= date_trunc(period, now())
  group by user_id;
$$;

-- Winners of every finished month and year. Ties share the award; a winner must finish positive.
create view awards with (security_invoker = true) as
  with totals as (
    select group_id, user_id, kind, period_start, sum(amount)::int as net
    from settled_results,
      lateral (values ('month', date_trunc('month', settled_at)), ('year', date_trunc('year', settled_at))) p(kind, period_start)
    where period_start < date_trunc(kind, now())
    group by group_id, user_id, kind, period_start
  ),
  ranked as (
    select *, rank() over (partition by group_id, kind, period_start order by net desc) as place
    from totals
  )
  select group_id, user_id, kind, period_start::date, net
  from ranked
  where place = 1 and net > 0;

revoke execute on function period_standings from anon;
