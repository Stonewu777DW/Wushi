import { supabase } from './supabase';

// Payout per place, matching complete_tournament(): floor(pot * share / 100), rounding leftovers go to 1st.
export function payouts(pot: number, split: number[]) {
  const amounts = split.map((p) => Math.floor((pot * p) / 100));
  amounts[0] += pot - amounts.reduce((a, b) => a + b, 0);
  return amounts;
}

export const placeLabel = (place: number) => ['1st', '2nd', '3rd', '4th', '5th'][place - 1];

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
