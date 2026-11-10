import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { memberNames, payouts, placeLabel } from '../../../../lib/tournaments';
import type { Tournament, TournamentPlayer } from '../../../../lib/types';
import { colors, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

export default function TournamentScreen() {
  const { id: groupId, tid } = useLocalSearchParams<{ id: string; tid: string }>();
  const me = useSession().session!.user.id;
  const [t, setT] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [ranked, setRanked] = useState<string[]>([]); // host's picks, 1st place first
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.from('tournaments').select('*').eq('id', tid).single<Tournament>().then(({ data }) => setT(data));
    supabase
      .from('tournament_players')
      .select('*')
      .eq('tournament_id', tid)
      .returns<TournamentPlayer[]>()
      .then(({ data }) => setPlayers(data ?? []));
    memberNames(groupId).then(setNames);
  }, [groupId, tid]);
  useFocusEffect(load);

  async function call(fn: string, args: object) {
    const { error } = await supabase.rpc(fn, { t_id: tid, ...args });
    setError(error?.message ?? null);
    setRanked([]);
    setConfirmCancel(false);
    load();
  }

  if (!t) return null;

  const open = t.status === 'open';
  const isHost = t.host_id === me;
  const joined = players.some((p) => p.user_id === me);
  const pot = t.buy_in * players.length;
  const amounts = payouts(pot, t.payout_split);
  const places = t.payout_split.length;
  const name = (id: string) => names.get(id) ?? '…';

  // Completed: paid places first, in order. Open: the host's picks first, in the order tapped.
  const order = (id: string) => {
    const place = open ? ranked.indexOf(id) + 1 : players.find((p) => p.user_id === id)?.place ?? 0;
    return place || 99;
  };
  const sorted = [...players].sort((a, b) => order(a.user_id) - order(b.user_id));

  function togglePick(id: string) {
    setRanked((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length < places ? [...r, id] : r));
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: t.name }} />
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Text style={ui.muted}>Pot</Text>
        <WuCoin amount={pot} size={36} />
        <Text style={ui.muted}>
          Buy-in {t.buy_in} · hosted by {isHost ? 'you' : name(t.host_id)}
        </Text>
        <Text style={{ color: open ? colors.accent : colors.muted, fontWeight: '600' }}>
          {open ? 'Open' : t.status === 'completed' ? 'Paid out' : 'Cancelled, buy-ins refunded'}
        </Text>
      </View>

      <Text style={{ fontWeight: '700' }}>Payout</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {t.payout_split.map((p, i) => (
          <View key={i} style={[ui.card, { flex: 1, alignItems: 'center', gap: 4 }]}>
            <Text style={ui.muted}>
              {placeLabel(i + 1)} · {p}%
            </Text>
            <WuCoin amount={amounts[i]} size={18} />
          </View>
        ))}
      </View>

      {error && <Text style={ui.error}>{error}</Text>}

      {open && !joined && (
        <Pressable style={ui.button} onPress={() => call('join_tournament', {})}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={ui.buttonText}>Buy in for {t.buy_in}</Text>
            <WuCoin size={18} />
          </View>
        </Pressable>
      )}
      {open && joined && (
        <Pressable style={ui.buttonOutline} onPress={() => call('leave_tournament', {})}>
          <Text style={ui.buttonOutlineText}>Leave and get {t.buy_in} back</Text>
        </Pressable>
      )}

      <Text style={{ fontWeight: '700' }}>Players ({players.length})</Text>
      {open && isHost && players.length > 0 && (
        <Text style={ui.muted}>
          {players.length < places
            ? `Need at least ${places} players to pay out.`
            : `When it's over, tap the top ${places === 1 ? 'finisher' : `${places} finishers in order`}.`}
        </Text>
      )}
      {players.length === 0 && <Text style={ui.muted}>Nobody has bought in yet.</Text>}
      {sorted.map((p) => {
        const pick = ranked.indexOf(p.user_id) + 1;
        const place = open ? pick : p.place;
        return (
          <Pressable
            key={p.user_id}
            disabled={!open || !isHost || players.length < places}
            onPress={() => togglePick(p.user_id)}
            style={[ui.row, { alignItems: 'center' }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 36, fontWeight: '700', color: colors.accent }}>
                {place ? placeLabel(place) : ''}
              </Text>
              <Text>{p.user_id === me ? 'You' : name(p.user_id)}</Text>
            </View>
            {open && pick > 0 && <WuCoin amount={amounts[pick - 1]} size={16} />}
            {!open && p.payout && <WuCoin amount={p.payout} size={16} signed />}
          </Pressable>
        );
      })}

      {open && isHost && ranked.length === places && (
        <Pressable style={ui.button} onPress={() => call('complete_tournament', { ranked })}>
          <Text style={ui.buttonText}>Pay out</Text>
        </Pressable>
      )}
      {open && isHost && (
        <Pressable
          style={[ui.buttonOutline, { borderColor: colors.danger }]}
          onPress={() => (confirmCancel ? call('cancel_tournament', {}) : setConfirmCancel(true))}
        >
          <Text style={[ui.buttonOutlineText, { color: colors.danger }]}>
            {confirmCancel ? 'Tap again to cancel and refund everyone' : 'Cancel tournament'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
