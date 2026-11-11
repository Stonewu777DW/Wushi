-- Demo data: a "Wushi Demo" group with four fake friends and something on every screen.
-- Run in the Supabase SQL editor after all migrations. Safe to re-run: it deletes the old demo first.
-- Every real account is added to the demo group, so whoever signs in sees it.
-- Everything goes through the app's own functions, acting as each user, so balances and rules hold.

do $$
declare
  jay uuid := 'de000000-0000-0000-0000-000000000001';
  kim uuid := 'de000000-0000-0000-0000-000000000002';
  lee uuid := 'de000000-0000-0000-0000-000000000003';
  mx uuid := 'de000000-0000-0000-0000-000000000004';
  friends uuid[] := array[jay, kim, lee, mx];
  real_users uuid[];
  first_real uuid;
  u uuid;
  g uuid;
  code text;
  b uuid;
  e uuid;
begin
  if to_regclass('public.friendly_bets') is null or to_regclass('public.events') is null then
    raise exception 'Run the database update first, then this file';
  end if;

  -- To act as a user, set the request's JWT claims: auth.uid() reads them.

  -- Remove a previous demo. Groups go first (they reference their creator), then the fake accounts.
  delete from groups where created_by = any (friends);
  delete from auth.users where id = any (friends);

  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  select id, 'authenticated', 'authenticated', name || '@users.wushi.app', jsonb_build_object('username', name), now(), now()
  from unnest(friends, array['demo_jay', 'demo_kim', 'demo_lee', 'demo_max']) as f(id, name);

  select array_agg(id order by created_at) into real_users from profiles where not (id = any (friends));
  first_real := real_users[1];

  -- Group: Jay creates it, everyone else joins with the invite code.
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  select id, invite_code into g, code from create_group('Wushi Demo');
  foreach u in array array[kim, lee, mx] || coalesce(real_users, '{}') loop
    perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
    perform join_group(code);
  end loop;

  -- Sports: one finished NFL game with bets, one NBA game coming up with lines to bet on.
  delete from games where id in ('demo-nfl-1', 'demo-nba-1');
  insert into games (id, sport, home_team, away_team, commence_time) values
    ('demo-nfl-1', 'americanfootball_nfl', 'Seattle Seahawks', 'San Francisco 49ers', now() + interval '1 hour'),
    ('demo-nba-1', 'basketball_nba', 'Golden State Warriors', 'Los Angeles Lakers', now() + interval '3 days');
  insert into game_lines (game_id, market, outcome, point, price) values
    ('demo-nfl-1', 'h2h', 'home', null, -120), ('demo-nfl-1', 'h2h', 'away', null, 100),
    ('demo-nfl-1', 'spreads', 'home', -2.5, -110), ('demo-nfl-1', 'spreads', 'away', 2.5, -110),
    ('demo-nba-1', 'h2h', 'home', null, -150), ('demo-nba-1', 'h2h', 'away', null, 130),
    ('demo-nba-1', 'spreads', 'home', -3.5, -110), ('demo-nba-1', 'spreads', 'away', 3.5, -110),
    ('demo-nba-1', 'totals', 'over', 228.5, -110), ('demo-nba-1', 'totals', 'under', 228.5, -110);
  perform set_config('request.jwt.claims', json_build_object('sub', kim)::text, true);
  perform place_sports_bet(g, 'demo-nfl-1', 'h2h', 'home', 120);
  perform set_config('request.jwt.claims', json_build_object('sub', lee)::text, true);
  perform place_sports_bet(g, 'demo-nfl-1', 'spreads', 'away', 100);
  perform set_config('request.jwt.claims', json_build_object('sub', mx)::text, true);
  perform place_sports_bet(g, 'demo-nba-1', 'totals', 'over', 50);
  update games set commence_time = now() - interval '4 hours', completed = true, home_score = 27, away_score = 20
    where id = 'demo-nfl-1';
  perform settle_sports_bets();

  -- Friendly bets.
  -- 1. Resolved: Lee's line on poker night. Counted last month, so last month has an award winner.
  perform set_config('request.jwt.claims', json_build_object('sub', lee)::text, true);
  select id into b from create_friendly_bet(g, 'Who wins poker night?', 'Kim', 'Anyone else', null, now() + interval '2 days', 'medium');
  perform set_config('request.jwt.claims', json_build_object('sub', kim)::text, true);
  perform place_friendly_wager(b, 'a', 100);
  perform set_config('request.jwt.claims', json_build_object('sub', mx)::text, true);
  perform place_friendly_wager(b, 'b', 80);
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  perform place_friendly_wager(b, 'b', 60);
  update friendly_bets set closes_at = now() - interval '1 minute' where id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', lee)::text, true);
  perform resolve_friendly_bet(b, 'a');
  update settlements set settled_at = date_trunc('month', now()) - interval '10 days' where ref_id = b;

  -- 2. Open, visible to everyone: you can bet on it.
  perform set_config('request.jwt.claims', json_build_object('sub', kim)::text, true);
  select id into b from create_friendly_bet(g, 'Max shows up on time to golf Saturday', 'On time', 'Late', mx, now() + interval '5 days', 'small');
  perform set_config('request.jwt.claims', json_build_object('sub', lee)::text, true);
  perform place_friendly_wager(b, 'b', 30);
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  perform place_friendly_wager(b, 'b', 20);

  -- 3. Open, about the first real account: hidden from that person until it closes.
  if first_real is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
    select id into b from create_friendly_bet(g, 'Breaks 90 at golf this month', 'Yes', 'No', first_real, now() + interval '20 days', 'big', true);
    perform set_config('request.jwt.claims', json_build_object('sub', kim)::text, true);
    perform place_friendly_wager(b, 'a', 120);
  end if;

  -- Events.
  -- Poker night, finished: paid out by chip count.
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  select id into e from create_event(g, 'Friday poker night', 'poker', 100);
  foreach u in array friends loop
    perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
    perform join_event(e);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  perform set_poker_chips(e, jay, 2500);
  perform set_poker_chips(e, kim, 4200);
  perform set_poker_chips(e, lee, 800);
  perform set_poker_chips(e, mx, 500);
  perform complete_poker_event(e);

  -- Golf: past rounds give everyone a handicap, plus an open event with rounds logged.
  foreach u in array friends loop
    perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
    for i in 1..5 loop
      perform record_golf_round(g, 'Pebble Creek', 72, 72 + (array[8, 15, 22, 12])[array_position(friends, u)] + (i % 3) * 2, current_date - i * 7);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', kim)::text, true);
  select id into e from create_event(g, 'Saturday golf', 'golf', 50, array[4, 3, 1, 0]);
  foreach u in array friends loop
    perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
    perform join_event(e);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', jay)::text, true);
  perform record_golf_round(g, 'Pebble Creek', 72, 79, current_date, e);
  perform set_config('request.jwt.claims', json_build_object('sub', lee)::text, true);
  perform record_golf_round(g, 'Pebble Creek', 72, 93, current_date, e);

  perform set_config('request.jwt.claims', '', true);
end $$;
