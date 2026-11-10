import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { chipPayout, kindLabel, memberNames, ordinal, payouts } from '../../../../lib/events';
import type { EventPlayer, GolfStanding, GroupEvent } from '../../../../lib/types';
import { colors, placeholder, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

// One line in the results list, whatever the event kind.
type Line = { userId: string; place: number | null; detail?: string; amount: number | null };

export default function EventScreen() {
  const { id: groupId, eid } = useLocalSearchParams<{ id: string; eid: string }>();
  const me = useSession().session!.user.id;
  const [e, setE] = useState<GroupEvent | null>(null);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [standings, setStandings] = useState<GolfStanding[]>([]);
  const [myHandicap, setMyHandicap] = useState<number | null>(null);
  const [ranked, setRanked] = useState<string[]>([]); // host's picks for 'other' events, 1st first
  const [chips, setChips] = useState(new Map<string, string>()); // poker chip inputs
  const [round, setRound] = useState({ course: '', par: '72', score: '' });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.from('events').select('*').eq('id', eid).single<GroupEvent>().then(({ data }) => {
      setE(data);
      if (data?.kind !== 'golf') return;
      supabase.rpc('golf_event_standings', { e_id: eid }).then(({ data }) => setStandings((data ?? []) as GolfStanding[]));
      supabase.rpc('golf_handicap', { g: groupId, u: me, excluding_event: eid }).then(({ data }) => setMyHandicap(data as number | null));
    });
    supabase
      .from('event_players')
      .select('*')
      .eq('event_id', eid)
      .returns<EventPlayer[]>()
      .then(({ data }) => {
        setPlayers(data ?? []);
        setChips(new Map((data ?? []).map((p) => [p.user_id, p.chips === null ? '' : String(p.chips)])));
      });
    memberNames(groupId).then(setNames);
  }, [groupId, eid, me]);
  useFocusEffect(load);

  async function run(fn: string, args: object) {
    const { error } = await supabase.rpc(fn, args);
    setError(error?.message ?? null);
    setRanked([]);
    setConfirmCancel(false);
    load();
  }

  if (!e) return null;

  const open = e.status === 'open';
  const isHost = e.host_id === me;
  const joined = players.some((p) => p.user_id === me);
  const n = players.length;
  const pot = e.buy_in * n;
  const shareAmounts = e.payout_shares ? payouts(pot, e.payout_shares, n) : [];
  const name = (id: string) => (id === me ? 'You' : names.get(id) ?? '…');
  const chipCount = (id: string) => Number(chips.get(id) || 0);
  const totalChips = players.reduce((sum, p) => sum + chipCount(p.user_id), 0);

  // The results list: final places once paid out, otherwise the live order for this kind of event.
  let lines: Line[];
  let ready = false; // host can pay out
  if (!open) {
    lines = [...players]
      .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
      .map((p) => ({
        userId: p.user_id,
        place: p.place,
        amount: p.payout ?? 0,
        detail: e.kind === 'poker' && p.chips !== null ? `${p.chips.toLocaleString()} chips` : undefined,
      }));
  } else if (e.kind === 'golf') {
    const logged = standings.map((s, i) => ({
      userId: s.user_id,
      place: i + 1,
      amount: shareAmounts[i],
      detail: `Score ${s.score} · hcp ${s.handicap} · net ${s.net}`,
    }));
    const waiting = players
      .filter((p) => !standings.some((s) => s.user_id === p.user_id))
      .map((p) => ({ userId: p.user_id, place: null, amount: null, detail: 'No round yet' }));
    lines = [...logged, ...waiting];
    ready = n > 0 && waiting.length === 0;
  } else if (e.kind === 'poker') {
    lines = [...players]
      .sort((a, b) => chipCount(b.user_id) - chipCount(a.user_id))
      .map((p) => ({ userId: p.user_id, place: null, amount: chips.get(p.user_id) ? chipPayout(pot, chipCount(p.user_id), totalChips) : null }));
    ready = n > 0 && totalChips > 0 && players.every((p) => p.chips !== null);
  } else {
    const order = (id: string) => ranked.indexOf(id) + 1 || 99;
    lines = [...players]
      .sort((a, b) => order(a.user_id) - order(b.user_id))
      .map((p) => {
        const pick = ranked.indexOf(p.user_id) + 1;
        return { userId: p.user_id, place: pick || null, amount: pick ? shareAmounts[pick - 1] : null };
      });
    ready = n > 0 && ranked.length === n;
  }

  const pickable = open && isHost && e.kind === 'other';
  const togglePick = (id: string) => setRanked((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const myRound = standings.some((s) => s.user_id === me);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: e.name }} />
      <View style={[ui.card, { alignItems: 'center' }]}>
        <Text style={ui.muted}>Pot</Text>
        <WuCoin amount={pot} size={36} />
        <Text style={ui.muted}>
          {kindLabel(e.kind)} · buy-in {e.buy_in} · hosted by {isHost ? 'you' : name(e.host_id)}
        </Text>
        <Text style={{ color: open ? colors.accent : colors.muted, fontWeight: '600' }}>
          {open ? 'Open' : e.status === 'completed' ? 'Paid out' : 'Cancelled, buy-ins refunded'}
        </Text>
      </View>

      {open && e.kind === 'poker' && <Text style={ui.muted}>Enter final chip counts. The pot is split in proportion to chips.</Text>}
      {open && e.kind !== 'poker' && n > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {shareAmounts.map((amount, i) => (
            <View key={i} style={[ui.card, { flexGrow: 1, flexBasis: 70, alignItems: 'center', gap: 4 }]}>
              <Text style={ui.muted}>{ordinal(i + 1)}</Text>
              <WuCoin amount={amount} size={16} />
            </View>
          ))}
        </View>
      )}

      {error && <Text style={ui.error}>{error}</Text>}

      {open && !joined && (
        <Pressable style={ui.button} onPress={() => run('join_event', { e_id: eid })}>
          <Text style={ui.buttonText}>Buy in for {e.buy_in}</Text>
        </Pressable>
      )}

      {open && e.kind === 'golf' && joined && !myRound && (
        <View style={ui.card}>
          <Text style={{ fontWeight: '700' }}>Log your round</Text>
          <Text style={ui.muted}>Your handicap: {myHandicap ?? 'none yet, you play off scratch'}</Text>
          <TextInput style={ui.input} placeholder="Course" placeholderTextColor={placeholder} maxLength={60} value={round.course} onChangeText={(course) => setRound({ ...round, course })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholder="Par" placeholderTextColor={placeholder} keyboardType="number-pad" value={round.par} onChangeText={(par) => setRound({ ...round, par })} />
            <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholder="Your score" placeholderTextColor={placeholder} keyboardType="number-pad" value={round.score} onChangeText={(score) => setRound({ ...round, score })} />
          </View>
          <Pressable
            style={ui.button}
            onPress={() =>
              run('record_golf_round', { g: groupId, course_name: round.course.trim(), course_par: Number(round.par), round_score: Number(round.score), for_event: eid })
            }
          >
            <Text style={ui.buttonText}>Save round</Text>
          </Pressable>
        </View>
      )}

      <Text style={{ fontWeight: '700' }}>Players ({n})</Text>
      {n === 0 && <Text style={ui.muted}>Nobody has bought in yet.</Text>}
      {pickable && n > 0 && <Text style={ui.muted}>When it’s over, tap every player in finishing order.</Text>}
      {lines.map((l) => {
        const canEditChips = open && e.kind === 'poker' && (l.userId === me || isHost);
        return (
          <Pressable key={l.userId} disabled={!pickable} onPress={() => togglePick(l.userId)} style={[ui.row, { alignItems: 'center', gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ width: 40, fontWeight: '700', color: colors.accent }}>{l.place ? ordinal(l.place) : ''}</Text>
              <View style={{ flexShrink: 1 }}>
                <Text>{name(l.userId)}</Text>
                {l.detail && <Text style={ui.muted}>{l.detail}</Text>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {e.kind === 'poker' && open && (
                <TextInput
                  style={[ui.input, { width: 90, padding: 8, textAlign: 'right' }]}
                  placeholder="chips"
                  placeholderTextColor={placeholder}
                  keyboardType="number-pad"
                  editable={canEditChips}
                  value={chips.get(l.userId) ?? ''}
                  onChangeText={(v) => setChips(new Map(chips).set(l.userId, v))}
                  onBlur={() => chips.get(l.userId) && run('set_poker_chips', { e_id: eid, player: l.userId, chip_count: chipCount(l.userId) })}
                />
              )}
              {l.amount !== null && (
                <View style={{ alignItems: 'flex-end' }}>
                  <WuCoin amount={l.amount} size={16} />
                  <Text style={[ui.muted, { fontSize: 12, color: l.amount >= e.buy_in ? colors.accent : colors.muted }]}>
                    net {l.amount - e.buy_in > 0 ? '+' : ''}
                    {l.amount - e.buy_in}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}

      {open && isHost && ready && (
        <Pressable
          style={ui.button}
          onPress={() =>
            e.kind === 'poker'
              ? run('complete_poker_event', { e_id: eid })
              : run('complete_event', { e_id: eid, ranked: e.kind === 'golf' ? standings.map((s) => s.user_id) : ranked })
          }
        >
          <Text style={ui.buttonText}>Pay out</Text>
        </Pressable>
      )}
      {open && joined && (
        <Pressable style={ui.buttonOutline} onPress={() => run('leave_event', { e_id: eid })}>
          <Text style={ui.buttonOutlineText}>Leave and get {e.buy_in} back</Text>
        </Pressable>
      )}
      {open && isHost && (
        <Pressable
          style={[ui.buttonOutline, { borderColor: colors.danger }]}
          onPress={() => (confirmCancel ? run('cancel_event', { e_id: eid }) : setConfirmCancel(true))}
        >
          <Text style={[ui.buttonOutlineText, { color: colors.danger }]}>
            {confirmCancel ? 'Tap again to cancel and refund everyone' : 'Cancel event'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
