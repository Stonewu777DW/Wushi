import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../lib/Text';
import { supabase } from '../../../lib/supabase';
import { SPORTS } from '../../../lib/sports';
import type { Game, GameLine, SportsBet } from '../../../lib/types';
import { colors, placeholder, ui } from '../../../lib/ui';
import { WuCoin } from '../../../lib/WuCoin';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function lineLabel(l: Pick<GameLine, 'market' | 'outcome' | 'point' | 'price'>, game: Pick<Game, 'home_team' | 'away_team'>) {
  const side = l.outcome === 'home' ? game.home_team : l.outcome === 'away' ? game.away_team : l.outcome === 'over' ? 'Over' : 'Under';
  const point = l.market === 'spreads' ? ` ${signed(l.point!)}` : l.market === 'totals' ? ` ${l.point}` : '';
  return `${side}${point} (${signed(l.price)})`;
}

// Profit on a winning bet at American odds; matches settle_sports_bets().
const toWin = (stake: number, price: number) => Math.floor(price > 0 ? (stake * price) / 100 : (stake * 100) / -price);

const MARKETS = ['h2h', 'spreads', 'totals'] as const;
const MARKET_NAMES = { h2h: 'Moneyline', spreads: 'Spread', totals: 'Total' };

export default function SportScreen() {
  const { id, sport } = useLocalSearchParams<{ id: string; sport: string }>();
  const label = SPORTS.find((s) => s.key === sport)?.label ?? sport;
  const [games, setGames] = useState<Game[]>([]);
  const [bets, setBets] = useState<SportsBet[]>([]);
  const [pick, setPick] = useState<{ game: Game; line: GameLine } | null>(null);
  const [stake, setStake] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    supabase
      .from('games')
      .select('*, game_lines(market, outcome, point, price)')
      .eq('sport', sport)
      .gt('commence_time', now.toISOString())
      .lt('commence_time', weekOut.toISOString())
      .order('commence_time')
      .then(({ data, error }) => {
        setError(error?.message ?? null);
        setGames((data ?? []) as Game[]);
      });
    supabase.auth.getUser().then(({ data }) =>
      supabase
        .from('sports_bets')
        .select('*, games!inner(home_team, away_team, sport)')
        .eq('games.sport', sport)
        .eq('group_id', id)
        .eq('user_id', data.user!.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => setBets((data ?? []) as SportsBet[])),
    );
  }, [id, sport]);
  useFocusEffect(load);

  async function placeBet() {
    if (!pick) return;
    const { error } = await supabase.rpc('place_sports_bet', {
      p_group: id,
      p_game: pick.game.id,
      p_market: pick.line.market,
      p_outcome: pick.line.outcome,
      p_stake: Number(stake),
    });
    if (error) return setError(error.message);
    setPick(null);
    setStake('');
    load();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: `${label} this week` }} />
      {error && <Text style={ui.error}>{error}</Text>}

      {pick && (
        <View style={[ui.card, { borderColor: colors.accent }]}>
          <Text style={{ fontWeight: '600' }}>{lineLabel(pick.line, pick.game)}</Text>
          <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder="Stake (WuCoins)" keyboardType="number-pad" value={stake} onChangeText={setStake} />
          {Number(stake) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={ui.muted}>To win</Text>
              <WuCoin amount={toWin(Number(stake), pick.line.price)} size={16} />
            </View>
          )}
          <Pressable style={ui.button} onPress={placeBet}>
            <Text style={ui.buttonText}>Place bet</Text>
          </Pressable>
        </View>
      )}

      {games.length === 0 && <Text style={ui.muted}>No {label} games with lines in the next 7 days.</Text>}
      {games.map((game) => (
        <View key={game.id} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontWeight: '600' }}>
            {game.away_team} @ {game.home_team}
          </Text>
          <Text style={ui.muted}>{new Date(game.commence_time).toLocaleString()}</Text>
          {MARKETS.map((market) => {
            const lines = game.game_lines.filter((l) => l.market === market);
            if (lines.length === 0) return null;
            return (
              <View key={market} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[ui.muted, { width: 80 }]}>{MARKET_NAMES[market]}</Text>
                {lines.map((line) => (
                  <Pressable
                    key={line.outcome}
                    onPress={() => setPick({ game, line })}
                    style={{ flex: 1, padding: 8, borderWidth: 1, borderRadius: 6, backgroundColor: colors.surface, borderColor: pick?.game.id === game.id && pick.line === line ? colors.accent : colors.border }}
                  >
                    <Text style={{ fontSize: 12 }}>{lineLabel(line, game)}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      ))}

      <Text style={ui.title}>My bets</Text>
      {bets.length === 0 && <Text style={ui.muted}>No bets yet.</Text>}
      {bets.map((b) => (
        <View key={b.id} style={ui.row}>
          <Text style={{ flex: 1 }}>{lineLabel(b, b.games)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <WuCoin amount={b.stake} size={14} />
            <Text style={ui.muted}>{b.status === 'open' ? `to win ${toWin(b.stake, b.price)}` : b.status}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
