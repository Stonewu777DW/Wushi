// Mirrors supabase/migrations. Replace with `supabase gen types typescript` once a project exists.
export type Group = {
  id: string;
  name: string;
  invite_code: string;
  starting_coins: number;
  created_by: string;
  created_at: string;
};

export type Standing = { user_id: string; username: string; balance: number };
