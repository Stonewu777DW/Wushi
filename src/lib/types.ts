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
