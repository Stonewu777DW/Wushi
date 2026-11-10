import { createClient } from 'npm:@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('YAHOO_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('YAHOO_CLIENT_SECRET')!;
const API = 'https://fantasysports.yahooapis.com/fantasy/v2';

// Must match the redirect URI registered on the Yahoo developer app.
export const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/yahoo-callback`;

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export function authorizeUrl(state: string) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', state });
  return `https://api.login.yahoo.com/oauth2/request_auth?${params}`;
}

/** Returns the signed-in user's id from the request's Supabase JWT. */
export async function requireUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ redirect_uri: REDIRECT_URI, ...body }),
  });
  if (!res.ok) throw new Error(`Yahoo token request failed: ${await res.text()}`);
  return res.json();
}

async function saveToken(userId: string, t: TokenResponse) {
  const expires_at = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  const { error } = await admin.from('yahoo_tokens').upsert({ user_id: userId, access_token: t.access_token, refresh_token: t.refresh_token, expires_at });
  if (error) throw error;
  return t.access_token;
}

export async function exchangeCode(userId: string, code: string) {
  return saveToken(userId, await requestToken({ grant_type: 'authorization_code', code }));
}

async function accessToken(userId: string) {
  const { data } = await admin.from('yahoo_tokens').select('*').eq('user_id', userId).single();
  if (!data) throw new Error('Yahoo account not linked');
  if (new Date(data.expires_at) > new Date()) return data.access_token as string;
  return saveToken(userId, await requestToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token }));
}

// Yahoo's JSON wraps collections as {"0": {...}, "1": {...}, "count": 2}
// and resources as arrays of single-key objects. These two helpers flatten that.
type Json = any; // Yahoo's response shape is irregular; parsed by hand below.
const items = (collection: Json): Json[] =>
  Object.entries(collection ?? {}).filter(([k]) => k !== 'count').map(([, v]) => v);
const merge = (parts: Json[]): Json =>
  Object.assign({}, ...parts.flat().filter((p: Json) => p && typeof p === 'object' && !Array.isArray(p)));

async function get(token: string, path: string): Promise<Json> {
  const res = await fetch(`${API}/${path}?format=json`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Yahoo API ${path} failed: ${res.status}`);
  return (await res.json()).fantasy_content;
}

/** Replaces the user's fantasy_teams rows with their current-season Yahoo NFL teams. */
export async function syncTeams(userId: string) {
  const token = await accessToken(userId);
  const user = await get(token, 'users;use_login=1/games;game_keys=nfl/teams');
  const game = items(user.users)[0]?.user[1].games['0'];
  const teamKeys: string[] = game ? items(game.game[1].teams).map((t) => merge(t.team[0]).team_key) : [];

  const rows = await Promise.all(teamKeys.map(async (key) => {
    const leagueKey = key.split('.t.')[0];
    const [team, league] = await Promise.all([get(token, `team/${key};out=standings`), get(token, `league/${leagueKey}`)]);
    const meta = merge(team.team[0]);
    const standings = merge(team.team.slice(1)).team_standings;
    return {
      team_key: key,
      user_id: userId,
      team_name: meta.name,
      league_name: league.league[0].name,
      logo_url: meta.team_logos?.[0]?.team_logo.url ?? null,
      wins: Number(standings.outcome_totals.wins),
      losses: Number(standings.outcome_totals.losses),
      ties: Number(standings.outcome_totals.ties),
      rank: standings.rank ? Number(standings.rank) : null,
      points_for: Number(standings.points_for),
      synced_at: new Date().toISOString(),
    };
  }));

  await admin.from('fantasy_teams').delete().eq('user_id', userId);
  if (rows.length) {
    const { error } = await admin.from('fantasy_teams').insert(rows);
    if (error) throw error;
  }
  return rows;
}

/**
 * Refreshes this and last week's matchups for every league the user is in (last week so it
 * can be settled), then settles finished bets. Anyone in a league can pull the whole league's
 * scoreboard, so one linked user per league is enough.
 */
export async function syncMatchups(userId: string) {
  const token = await accessToken(userId);
  const { data: teams } = await admin.from('fantasy_teams').select('team_key').eq('user_id', userId);
  const leagueKeys = [...new Set((teams ?? []).map((t) => t.team_key.split('.t.')[0]))];

  const rows = (await Promise.all(leagueKeys.map(async (leagueKey) => {
    const league = (await get(token, `league/${leagueKey}`)).league[0];
    const current = Number(league.current_week);
    const weeks = [current, current - 1].filter((w) => w >= 1);
    return Promise.all(weeks.map(async (week) => {
      const scoreboard = (await get(token, `league/${leagueKey}/scoreboard;week=${week}`)).league[1].scoreboard;
      return items(scoreboard.matchups).map((entry) => {
        const matchup = entry.matchup;
        const [t1, t2] = items(matchup['0'].teams).map((t) => ({
          meta: merge(t.team[0]),
          stats: merge(t.team.slice(1)),
        }));
        return {
          id: `${t1.meta.team_key}:${week}`,
          league_key: leagueKey,
          league_name: league.name,
          week,
          starts_at: new Date(`${matchup.week_start}T00:00:00Z`).toISOString(),
          completed: matchup.status === 'postevent',
          team1_key: t1.meta.team_key,
          team1_name: t1.meta.name,
          team1_points: Number(t1.stats.team_points.total),
          team1_projected: t1.stats.team_projected_points ? Number(t1.stats.team_projected_points.total) : null,
          team2_key: t2.meta.team_key,
          team2_name: t2.meta.name,
          team2_points: Number(t2.stats.team_points.total),
          team2_projected: t2.stats.team_projected_points ? Number(t2.stats.team_projected_points.total) : null,
          updated_at: new Date().toISOString(),
        };
      });
    }));
  }))).flat(2);

  if (rows.length) {
    const { error } = await admin.from('fantasy_matchups').upsert(rows);
    if (error) throw error;
  }
  const { error } = await admin.rpc('settle_fantasy_bets');
  if (error) throw error;
  return rows;
}
