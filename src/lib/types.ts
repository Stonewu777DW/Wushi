// Mirrors supabase/migrations. Replace with `supabase gen types typescript` once a project exists.
export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  starting_coins: number;
  created_by: string;
  created_at: string;
};

export type Standing = { user_id: string; name: string; avatar_url: string | null; balance: number };

export type Award = { user_id: string; kind: 'month' | 'year'; period_start: string; net: number };

export type SportsMarket = 'h2h' | 'spreads' | 'totals';
export type SportsOutcome = 'home' | 'away' | 'over' | 'under';

export type GameLine = { market: SportsMarket; outcome: SportsOutcome; point: number | null; price: number };

export type Game = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
  game_lines: GameLine[];
};

export type SportsBet = {
  id: string;
  game_id: string;
  market: SportsMarket;
  outcome: SportsOutcome;
  point: number | null;
  price: number;
  stake: number;
  status: 'open' | 'won' | 'lost' | 'push';
  created_at: string;
  games: Pick<Game, 'home_team' | 'away_team'>;
};

export type FantasyTeam = {
  team_key: string;
  user_id: string;
  team_name: string;
  league_name: string;
  logo_url: string | null;
  wins: number;
  losses: number;
  ties: number;
  rank: number | null;
  points_for: number;
  synced_at: string;
};

export type EventKind = 'other' | 'golf' | 'poker';

export type GroupEvent = {
  id: string;
  group_id: string;
  host_id: string;
  name: string;
  kind: EventKind;
  buy_in: number;
  payout_shares: number[] | null; // parts by place, e.g. [4, 3, 1, 0]; null for poker
  status: 'open' | 'completed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
};

export type EventPlayer = { event_id: string; user_id: string; chips: number | null; place: number | null; payout: number | null };

export type GolfRound = {
  id: string;
  group_id: string;
  user_id: string;
  event_id: string | null;
  course: string;
  par: number;
  score: number;
  played_on: string;
};

export type GolfStanding = { user_id: string; score: number; handicap: number; net: number };
