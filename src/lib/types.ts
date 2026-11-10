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

export type BetSide = 'a' | 'b';

export type FriendlyBet = {
  id: string;
  group_id: string;
  maker_id: string;
  subject_id: string | null;
  title: string;
  side_a: string;
  side_b: string;
  closes_at: string;
  status: 'open' | 'resolved' | 'cancelled';
  winning_side: BetSide | null;
  app_banks: boolean;
  significance: 'small' | 'medium' | 'big';
  reward_multiplier: number;
  min_wager: number;
  max_wager: number;
  escrow_held: number;
  maker_reward: number | null;
  created_at: string;
};

export type FriendlyWager = {
  id: string;
  bet_id: string;
  user_id: string;
  side: BetSide;
  amount: number;
  payout: number | null;
  created_at: string;
};
