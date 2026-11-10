import { supabase } from './supabase';
import type { EventKind } from './types';

export const KINDS: { key: EventKind; label: string }[] = [
  { key: 'golf', label: 'Golf' },
  { key: 'poker', label: 'Poker' },
  { key: 'other', label: 'Other' },
];
export const kindLabel = (k: EventKind) => KINDS.find((x) => x.key === k)!.label;

// Payout per place for n players, matching complete_event(): only the first n shares count,
// each place gets floor(pot * share / total), rounding leftovers go to 1st.
export function payouts(pot: number, shares: number[], n: number) {
  const used = Array.from({ length: n }, (_, i) => shares[i] ?? 0);
  const total = used.reduce((a, b) => a + b, 0);
  const amounts = used.map((s) => Math.floor((pot * s) / total));
  if (n > 0) amounts[0] += pot - amounts.reduce((a, b) => a + b, 0);
  return amounts;
}

// Poker: the pot split in proportion to chips, matching complete_poker_event() (leftovers to the biggest stack).
export function chipPayout(pot: number, chips: number, totalChips: number) {
  return totalChips > 0 ? Math.floor((pot * chips) / totalChips) : 0;
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// Display names of everyone in the group, by user id.
export async function memberNames(groupId: string) {
  const { data } = await supabase.from('group_members').select('user_id, profiles(username, display_name)').eq('group_id', groupId);
  return new Map(
    (data ?? []).map((m) => {
      const p = m.profiles as unknown as { username: string; display_name: string | null };
      return [m.user_id as string, p.display_name ?? p.username];
    }),
  );
}
