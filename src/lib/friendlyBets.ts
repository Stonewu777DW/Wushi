// Friendly Bets API. All reads go through RLS, which hides a bet and its wagers from the bet's subject
// until it resolves, so the subject's queries simply return nothing for it.
import { supabase } from './supabase';
import type { BetSide, FriendlyBet, FriendlyWager } from './types';

export type Member = { user_id: string; name: string; avatar_url: string | null };

async function unwrap<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

export const listBets = (groupId: string) =>
  unwrap<FriendlyBet[]>(supabase.from('friendly_bets').select('*').eq('group_id', groupId).order('created_at', { ascending: false }));

export const getBet = (betId: string) =>
  unwrap<FriendlyBet>(supabase.from('friendly_bets').select('*').eq('id', betId).single());

export const listWagers = (betId: string) =>
  unwrap<FriendlyWager[]>(supabase.from('friendly_wagers').select('*').eq('bet_id', betId).order('created_at'));

export async function listMembers(groupId: string): Promise<Member[]> {
  const rows = await unwrap<{ user_id: string; profiles: unknown }[]>(
    supabase.from('group_members').select('user_id, profiles(username, display_name, avatar_url)').eq('group_id', groupId),
  );
  return rows.map((m) => {
    const p = m.profiles as { username: string; display_name: string | null; avatar_url: string | null };
    return { user_id: m.user_id, name: p.display_name ?? p.username, avatar_url: p.avatar_url };
  });
}

export const createBet = (args: { groupId: string; title: string; sideA: string; sideB: string; subjectId: string | null; closesAt: Date }) =>
  unwrap<FriendlyBet>(
    supabase
      .rpc('create_friendly_bet', {
        p_group_id: args.groupId,
        p_title: args.title,
        p_side_a: args.sideA,
        p_side_b: args.sideB,
        p_subject_id: args.subjectId,
        p_closes_at: args.closesAt.toISOString(),
      })
      .single(),
  );

export const placeWager = (betId: string, side: BetSide, amount: number) =>
  unwrap<FriendlyWager>(supabase.rpc('place_friendly_wager', { p_bet_id: betId, p_side: side, p_amount: amount }).single());

export const resolveBet = (betId: string, winningSide: BetSide) =>
  unwrap<FriendlyBet>(supabase.rpc('resolve_friendly_bet', { p_bet_id: betId, p_winning_side: winningSide }).single());

export const cancelBet = (betId: string) =>
  unwrap<FriendlyBet>(supabase.rpc('cancel_friendly_bet', { p_bet_id: betId }).single());

export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'awaiting result';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.ceil(ms / 60_000)}m left`;
  if (h < 48) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}
