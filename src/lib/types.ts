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
  reward_multiplier: number;
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
