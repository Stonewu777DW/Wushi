import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../lib/Text';
import { supabase } from '../../../lib/supabase';
import type { FantasyBet, FantasyMatchup } from '../../../lib/types';
import { colors, placeholder, ui } from '../../../lib/ui';
import { WuCoin } from '../../../lib/WuCoin';

type Market = FantasyBet['market'];
type BetPick = { matchup: FantasyMatchup; market: Market; team: string; point: number };
type MyBet = FantasyBet & { fantasy_matchups: Pick<FantasyMatchup, 'week' | 'team1_key' | 'team1_name' | 'team2_name'> };

// Every fantasy bet pays -110; matches settle_fantasy_bets().
const toWin = (stake: number) => Math.floor((stake * 100) / 110);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
// Postgres round() goes half away from zero; this matches place_fantasy_bet's half-point rounding.
const half = (n: number) => (Math.sign(n) * Math.round(Math.abs(n) * 2)) / 2;
const leagueOf = (teamKey: string) => teamKey.split('.t.')[0];

function sides(m: FantasyMatchup) {
  return [
    { key: m.team1_key, name: m.team1_name, points: m.team1_points, projected: m.team1_projected, other: m.team2_projected },
    { key: m.team2_key, name: m.team2_name, points: m.team2_points, projected: m.team2_projected, other: m.team1_projected },
  ];
}

const spread = (point: number) => (point === 0 ? 'PK' : signed(point));
const label = (market: Market, teamName: string, point: number) =>
  market === 'spread' ? `${teamName} ${spread(point)}` : `${teamName} ${market} ${point}`;

export default function FantasyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [matchups, setMatchups] = useState<FantasyMatchup[]>([]);
  const [owners, setOwners] = useState<Map<string, string>>(new Map());
  const [bets, setBets] = useState<MyBet[]>([]);
  const [pick, setPick] = useState<BetPick | null>(null);
  const [stake, setStake] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Matchups come from the Yahoo leagues of this group's members.
    const { data: members } = await supabase.from('group_members').select('user_id, profiles(username, display_name)').eq('group_id', id);
    const nameOf = new Map((members ?? []).map((m) => {
      const p = m.profiles as unknown as { username: string; display_name: string | null };
      return [m.user_id as string, p.display_name ?? p.username];
    }));
    const { data: teams } = await supabase.from('fantasy_teams').select('team_key, user_id').in('user_id', [...nameOf.keys()]);
    setOwners(new Map((teams ?? []).map((t) => [t.team_key as string, nameOf.get(t.user_id)!])));

    const leagues = [...new Set((teams ?? []).map((t) => leagueOf(t.team_key)))];
    const { data, error } = await supabase
      .from('fantasy_matchups')
      .select('*')
      .in('league_key', leagues)
      .eq('completed', false)
      .order('starts_at');
    setStatus(error?.message ?? null);
    setMatchups((data ?? []) as FantasyMatchup[]);

    const { data: user } = await supabase.auth.getUser();
    const { data: mine } = await supabase
      .from('fantasy_bets')
      .select('*, fantasy_matchups(week, team1_key, team1_name, team2_name)')
      .eq('group_id', id)
      .eq('user_id', user.user!.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setBets((mine ?? []) as MyBet[]);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function refresh() {
    setStatus('Refreshing from Yahoo…');
    const { error } = await supabase.functions.invoke('fantasy-sync');
    setStatus(error ? error.message : null);
    load();
  }

  async function placeBet() {
    if (!pick) return;
    const { error } = await supabase.rpc('place_fantasy_bet', {
      p_group: id,
      p_matchup: pick.matchup.id,
      p_market: pick.market,
      p_team: pick.team,
      p_stake: Number(stake),
    });
    if (error) return setStatus(error.message);
    setPick(null);
    setStake('');
    load();
  }

  const now = Date.now();
  const isPicked = (m: FantasyMatchup, market: Market, team: string) =>
    pick?.matchup.id === m.id && pick.market === market && pick.team === team;

  function option(m: FantasyMatchup, market: Market, team: { key: string; name: string }, point: number, text: string) {
    const active = isPicked(m, market, team.key);
    return (
      <Pressable
        key={market}
        onPress={() => setPick({ matchup: m, market, team: team.key, point })}
        style={{ flex: 1, padding: 8, borderWidth: 1, borderRadius: 6, alignItems: 'center', backgroundColor: colors.bg, borderColor: active ? colors.accent : colors.border }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600' }}>{text}</Text>
      </Pressable>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: 'Fantasy Football' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={ui.muted}>Yahoo matchups · all bets pay -110</Text>
        <Pressable onPress={refresh}>
          <Text style={ui.link}>Refresh</Text>
        </Pressable>
      </View>
      {status && <Text style={status.endsWith('…') ? ui.muted : ui.error}>{status}</Text>}

      {matchups.length === 0 && (
        <Text style={ui.muted}>
          {owners.size === 0
            ? 'Nobody in this group has linked a Yahoo Fantasy team yet. Link yours from your profile.'
            : 'No matchups yet. Tap Refresh to pull this week from Yahoo.'}
        </Text>
      )}
      {matchups.map((m) => {
        const open = new Date(m.starts_at).getTime() > now;
        return (
          <View key={m.id} style={ui.card}>
            <Text style={ui.muted}>{m.league_name} · Week {m.week} · {open ? `locks ${new Date(m.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'in progress'}</Text>
            {sides(m).map((t) => (
              <View key={t.key} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700' }}>{t.name}</Text>
                    {owners.has(t.key) && <Text style={[ui.muted, { fontSize: 12 }]}>{owners.get(t.key)}</Text>}
                  </View>
                  <Text style={open ? ui.muted : { fontWeight: '700' }}>
                    {open ? `proj ${t.projected ?? '–'}` : `${t.points} pts`}
                  </Text>
                </View>
                {open && t.projected !== null && t.other !== null && (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {option(m, 'spread', t, half(t.other - t.projected), spread(half(t.other - t.projected)))}
                    {option(m, 'over', t, half(t.projected), `O ${half(t.projected)}`)}
                    {option(m, 'under', t, half(t.projected), `U ${half(t.projected)}`)}
                  </View>
                )}
              </View>
            ))}
            {pick?.matchup.id === m.id && (
              <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.accent }}>
                <Text style={{ fontWeight: '700' }}>{label(pick.market, pick.team === pick.matchup.team1_key ? pick.matchup.team1_name : pick.matchup.team2_name, pick.point)} (-110)</Text>
                <Text style={ui.muted}>Line locks when you place the bet.</Text>
                <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder="Stake (WuCoins)" keyboardType="number-pad" value={stake} onChangeText={setStake} />
                {Number(stake) > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={ui.muted}>To win</Text>
                    <WuCoin amount={toWin(Number(stake))} size={16} />
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[ui.buttonOutline, { flex: 1 }]} onPress={() => setPick(null)}>
                    <Text style={ui.buttonOutlineText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[ui.button, { flex: 2 }]} onPress={placeBet}>
                    <Text style={ui.buttonText}>Place bet</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <Text style={ui.title}>My bets</Text>
      {bets.length === 0 && <Text style={ui.muted}>No fantasy bets yet.</Text>}
      {bets.map((b) => {
        const m = b.fantasy_matchups;
        const team = b.team_key === m.team1_key ? m.team1_name : m.team2_name;
        return (
          <View key={b.id} style={ui.row}>
            <View style={{ flex: 1 }}>
              <Text>{label(b.market, team, b.point)}</Text>
              <Text style={ui.muted}>Week {m.week} · {m.team1_name} vs {m.team2_name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <WuCoin amount={b.stake} size={14} />
              <Text style={[ui.muted, b.status === 'won' && { color: colors.accent }]}>
                {b.status === 'open' ? `to win ${toWin(b.stake)}` : b.status}
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
