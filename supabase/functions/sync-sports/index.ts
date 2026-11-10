// Pulls games, lines and final scores from The Odds API for each in-season league, then settles finished bets.
// Run on a schedule (see README). Secrets: ODDS_API_KEY, CRON_SECRET.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Must match SPORTS in src/lib/sports.ts.
const SPORTS = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
const BOOKMAKER = 'draftkings'; // preferred book; falls back to the first US book listed
const API = 'https://api.the-odds-api.com/v4/sports';

type Outcome = { name: string; price: number; point?: number };
type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; markets: { key: 'h2h' | 'spreads' | 'totals'; outcomes: Outcome[] }[] }[];
};
type ScoreEvent = {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

async function fetchJson<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({ apiKey: Deno.env.get('ODDS_API_KEY')!, ...params });
  const res = await fetch(`${API}${path}?${query}`);
  if (!res.ok) throw new Error(`Odds API ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function syncSport(db: SupabaseClient, sport: string) {
  const odds = await fetchJson<OddsEvent[]>(`/${sport}/odds`, { regions: 'us', markets: 'h2h,spreads,totals', oddsFormat: 'american' });
  const games = odds.map((e) => ({ id: e.id, sport, home_team: e.home_team, away_team: e.away_team, commence_time: e.commence_time }));
  const lines = odds.flatMap((e) => {
    const book = e.bookmakers.find((b) => b.key === BOOKMAKER) ?? e.bookmakers[0];
    return (book?.markets ?? []).flatMap((m) =>
      m.outcomes.map((o) => ({
        game_id: e.id,
        market: m.key,
        outcome: o.name === e.home_team ? 'home' : o.name === e.away_team ? 'away' : o.name.toLowerCase(), // Over/Under
        point: o.point ?? null,
        price: o.price,
        updated_at: new Date().toISOString(),
      })),
    );
  });

  const scores = await fetchJson<ScoreEvent[]>(`/${sport}/scores`, { daysFrom: '3' });
  const finals = scores
    .filter((s) => s.completed && s.scores)
    .map((s) => {
      const score = (team: string) => Number(s.scores!.find((x) => x.name === team)!.score);
      return { id: s.id, home_score: score(s.home_team), away_score: score(s.away_team), completed: true };
    });

  const gamesRes = await db.from('games').upsert(games);
  if (gamesRes.error) throw gamesRes.error;
  const linesRes = await db.from('game_lines').upsert(lines);
  if (linesRes.error) throw linesRes.error;
  // Only games we already know about can have bets, so update rather than insert.
  for (const f of finals) {
    const { error } = await db.from('games').update(f).eq('id', f.id).eq('completed', false);
    if (error) throw error;
  }
  return { sport, games: games.length, lines: lines.length, finals: finals.length };
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // The /sports listing is free; skipping off-season leagues saves 5 credits each per run.
  const active = new Set((await fetchJson<{ key: string; active: boolean }[]>('')).filter((s) => s.active).map((s) => s.key));
  const synced = [];
  for (const sport of SPORTS.filter((s) => active.has(s))) synced.push(await syncSport(db, sport));

  const settled = await db.rpc('settle_sports_bets');
  if (settled.error) throw settled.error;
  return Response.json({ synced, settled: settled.data });
});
