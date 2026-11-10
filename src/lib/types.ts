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
