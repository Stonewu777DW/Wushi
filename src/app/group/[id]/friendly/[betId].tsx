import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text } from '../../../../lib/Text';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { cancelBet, getBet, listMembers, listWagers, placeWager, resolveBet, timeLeft } from '../../../../lib/friendlyBets';
import type { BetSide as Side, FriendlyBet, FriendlyWager as Wager } from '../../../../lib/types';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { colors, placeholder, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

export default function FriendlyBetScreen() {
  const { betId } = useLocalSearchParams<{ betId: string }>();
  const me = useSession().session!.user.id;
  const [bet, setBet] = useState<FriendlyBet | null>(null);
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [balance, setBalance] = useState(0);
  const [side, setSide] = useState<Side>('a');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const b = await getBet(betId);
      const [w, m, bal] = await Promise.all([
        listWagers(betId),
        listMembers(b.group_id),
        supabase.from('group_balances').select('balance').eq('group_id', b.group_id).eq('user_id', me).maybeSingle(),
      ]);
      setBet(b);
      setWagers(w);
      setNames(new Map(m.map((x) => [x.user_id, x.name])));
      setBalance((bal.data?.balance as number | undefined) ?? 0);
    } catch {
      // RLS hides the bet from its subject until it resolves, so "not found" is expected for them.
      setMissing(true);
    }
  }, [betId, me]);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setAmount('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (missing) {
    return (
      <View style={ui.screen}>
        <Text style={ui.muted}>This bet isn't available to you.</Text>
      </View>
    );
  }
  if (!bet) return <View style={ui.screen} />;

  const label = (s: Side) => (s === 'a' ? bet.side_a : bet.side_b);
  const name = (id: string) => (id === me ? 'You' : names.get(id) ?? '…');
  const total = (s: Side) => wagers.filter((w) => w.side === s).reduce((n, w) => n + w.amount, 0);
  const pot = total('a') + total('b');
  const isMaker = bet.maker_id === me;
  const isOpen = bet.status === 'open';
  const bettingOpen = isOpen && new Date(bet.closes_at) > new Date();
  const amountNum = Number.parseInt(amount, 10);
  const amountOk = amountNum >= bet.min_wager && amountNum <= bet.max_wager && amountNum <= balance;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[ui.screen, { flexGrow: 1 }]}>
      <Stack.Screen options={{ title: 'Friendly bet' }} />
      <Text style={ui.title}>{bet.title}</Text>
      <Text style={ui.muted}>
        Line by {name(bet.maker_id)}
        {bet.subject_id && ` · about ${name(bet.subject_id)}`} · {isOpen ? timeLeft(bet.closes_at) : bet.status} · {bet.significance} · {bet.reward_multiplier}x maker bonus{bet.app_banks && ' · app backs it'}
      </Text>

      {/* The book: how the money splits across the two sides. An even split means a good line. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['a', 'b'] as const).map((s) => {
          const won = bet.winning_side === s;
          const share = pot ? Math.round((total(s) / pot) * 100) : 50;
          return (
            <View key={s} style={[ui.card, { flex: 1 }, won && { borderColor: colors.accent }]}>
              <Text style={[{ fontWeight: '700' }, won && { color: colors.accent }]}>
                {label(s)}
                {won && ' ✓'}
              </Text>
              <WuCoin amount={total(s)} size={18} />
              <Text style={ui.muted}>{share}% of the pot</Text>
            </View>
          );
        })}
      </View>

      {bet.status === 'resolved' && bet.maker_reward !== null && (
        <View style={[ui.card, bet.maker_reward > 0 && { borderColor: colors.accent }, bet.maker_reward < 0 && { borderColor: colors.danger }]}>
          <Text>
            {bet.maker_reward > 0 && `${name(bet.maker_id)} earned a bonus for ${isMaker ? 'your' : 'this'} line`}
            {bet.maker_reward < 0 && `${name(bet.maker_id)} paid for a one-sided line`}
            {bet.maker_reward === 0 && `${name(bet.maker_id)} broke even on ${isMaker ? 'your' : 'this'} line`}
          </Text>
          {bet.maker_reward !== 0 && <WuCoin amount={Math.abs(bet.maker_reward)} size={22} />}
          <Text style={ui.muted}>
            {bet.maker_reward > 0 && '40% or more of the coins were on the losing side.'}
            {bet.maker_reward < 0 && '80% or more of the coins were on the winning side, so the maker covered the gap.'}
            {bet.maker_reward === 0 && 'No bonus and no penalty.'}
          </Text>
        </View>
      )}

      {bettingOpen && !isMaker && bet.subject_id !== me && (
        <View style={ui.card}>
          <Text>Place a bet</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={ui.muted}>Stake</Text>
            <WuCoin amount={bet.min_wager} size={16} />
            <Text style={ui.muted}>to</Text>
            <WuCoin amount={bet.max_wager} size={16} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['a', 'b'] as const).map((s) => (
              <Pressable key={s} onPress={() => setSide(s)}
                style={[side === s ? ui.button : ui.buttonOutline, { flex: 1 }]}>
                <Text style={side === s ? ui.buttonText : ui.buttonOutlineText}>{label(s)}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder={`${bet.min_wager}–${bet.max_wager}`} keyboardType="number-pad"
            value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={ui.muted}>Balance</Text>
            <WuCoin amount={balance} size={16} />
          </View>
          <Pressable style={[ui.button, !amountOk && { opacity: 0.4 }]} disabled={!amountOk}
            onPress={() => run(() => placeWager(bet.id, side, amountNum))}>
            <Text style={ui.buttonText}>{amountOk ? `Bet ${amountNum} on ${label(side)}` : amountNum > balance ? 'Not enough WuCoins' : `Enter ${bet.min_wager}–${bet.max_wager}`}</Text>
          </Pressable>
        </View>
      )}

      {isMaker && bettingOpen && (
        <View style={ui.card}>
          <Text>Your line</Text>
          {bet.app_banks ? (
            <Text style={ui.muted}>The app backs this bet, so you can't lose coins on it.</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={ui.muted}>Held in case 80%+ ends up on the winner</Text>
              <WuCoin amount={bet.escrow_held} size={16} />
            </View>
          )}
          <Text style={ui.muted}>You can settle once betting closes, or cancel now and refund every bet.</Text>
          <Pressable style={[ui.buttonOutline, { borderColor: colors.danger }]}
            onPress={() => run(() => cancelBet(bet.id))}>
            <Text style={[ui.buttonOutlineText, { color: colors.danger }]}>Cancel bet</Text>
          </Pressable>
        </View>
      )}

      {isMaker && isOpen && !bettingOpen && (
        <View style={ui.card}>
          <Text>Settle your line</Text>
          <Text style={ui.muted}>Pick the side that won. Winners are paid and your reward is settled.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['a', 'b'] as const).map((s) => (
              <Pressable key={s} style={[ui.button, { flex: 1 }]} onPress={() => run(() => resolveBet(bet.id, s))}>
                <Text style={ui.buttonText}>{label(s)} won</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {error && <Text style={ui.error}>{error}</Text>}

      <Text style={[{ fontWeight: '700', marginTop: 4 }]}>Bets</Text>
      {wagers.length === 0 && <Text style={ui.muted}>No bets yet.</Text>}
      {wagers.map((w) => (
        <View key={w.id} style={[ui.row, { alignItems: 'center' }]}>
          <Text>
            {name(w.user_id)} · {label(w.side)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <WuCoin amount={w.amount} size={16} />
            {w.payout !== null && (
              <Text style={{ color: w.payout > 0 ? colors.accent : colors.muted, fontWeight: '700' }}>
                {w.payout > 0 ? `+${w.payout}` : 'lost'}
              </Text>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
