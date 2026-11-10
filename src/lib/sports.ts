// Leagues offered for sports bets. Keys are The Odds API sport keys and must match SPORTS in supabase/functions/sync-sports.
export const SPORTS = [
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL' },
] as const;
