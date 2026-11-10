import { useCallback, useState } from 'react';
import { FlatList, Share, Pressable, Text, View } from 'react-native';
import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Avatar } from '../../../lib/Avatar';
import type { Award, FantasyTeam, Group, Profile, Standing } from '../../../lib/types';
import { record } from '../../../lib/YahooFantasy';
import { ui } from '../../../lib/ui';
import { WuCoin } from '../../../lib/WuCoin';

type Period = 'month' | 'year' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'Balance' },
];

type Score = { user_id: string; score: number };

// Without generated Supabase types the rows are untyped, so they are shaped here once.
async function fetchScores(groupId: string, period: Period): Promise<Score[]> {
  if (period === 'all') {
    const { data } = await supabase.from('group_balances').select('user_id, balance').eq('group_id', groupId);
    return (data ?? []).map((r) => ({ user_id: r.user_id, score: r.balance }));
  }
  const { data } = await supabase.rpc('period_standings', { g: groupId, period });
  return ((data ?? []) as { user_id: string; net: number }[]).map((r) => ({ user_id: r.user_id, score: r.net }));
}

type Member = Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;

// period_start is a plain date ("2026-10-01"); read it as UTC so the label matches the database period.
function awardLabel(a: Award) {
  const d = new Date(a.period_start);
  if (a.kind === 'year') return `${d.getUTCFullYear()} champion`;
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [teams, setTeams] = useState<Map<string, FantasyTeam>>(new Map());
  const [awards, setAwards] = useState<Award[]>([]);

  const load = useCallback(() => {
    supabase.from('groups').select('*').eq('id', id).single<Group>().then(({ data }) => setGroup(data));
    supabase
      .from('awards')
      .select('user_id, kind, period_start, net')
      .eq('group_id', id)
      .order('period_start', { ascending: false })
      .returns<Award[]>()
      .then(({ data }) => setAwards(data ?? []));
    Promise.all([
      fetchScores(id, period),
      supabase.from('group_members').select('user_id, profiles(username, display_name, avatar_url)').eq('group_id', id),
    ]).then(([scores, members]) => {
      const scoreOf = new Map(scores.map((s) => [s.user_id, s.score]));
      const rows = (members.data ?? []).map((m) => {
        const p = m.profiles as unknown as Member;
        return {
          user_id: m.user_id as string,
          name: p.display_name ?? p.username,
          avatar_url: p.avatar_url,
          balance: scoreOf.get(m.user_id as string) ?? 0,
        };
      });
      setStandings(rows.sort((a, b) => b.balance - a.balance));
      supabase.from('fantasy_teams').select('*').in('user_id', rows.map((r) => r.user_id))
        .then(({ data }) => setTeams(new Map((data ?? []).map((t) => [t.user_id, t]))));
    });
  }, [id, period]);
  useFocusEffect(load);

  if (!group) return null;

  const nameOf = new Map(standings.map((s) => [s.user_id, s.name]));
  const trophies = (userId: string) => {
    const mine = awards.filter((a) => a.user_id === userId);
    const years = mine.filter((a) => a.kind === 'year').length;
    const months = mine.length - years;
    return `${'🏆'.repeat(years)}${months ? ` 🏅${months}` : ''}`.trim();
  };

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: group.name }} />
      <Pressable style={ui.buttonOutline} onPress={() => Share.share({ message: `Join my Wushi group "${group.name}" with code ${group.invite_code}` })}>
        <Text style={ui.buttonOutlineText}>Invite friends ({group.invite_code})</Text>
      </Pressable>
      <Link href={`/group/${id}/nfl`} asChild>
        <Pressable style={ui.button}>
          <Text style={ui.buttonText}>Bet on NFL this week</Text>
        </Pressable>
      </Link>
      <Link href={`/group/${id}/friendly`} asChild>
        <Pressable style={ui.button}>
          <Text style={ui.buttonText}>Friendly bets</Text>
        </Pressable>
      </Link>
      <Text style={ui.title}>Leaderboard</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPeriod(p.key)}
            style={[ui.pill, period === p.key && ui.pillActive]}
          >
            <Text style={period === p.key ? ui.pillActiveText : ui.text}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {period !== 'all' && <Text style={ui.muted}>Net WuCoins won on bets settled this {period}.</Text>}
      <FlatList
        data={standings}
        keyExtractor={(s) => s.user_id}
        renderItem={({ item, index }) => (
          <View style={[ui.row, { alignItems: 'center' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={ui.muted}>{index + 1}.</Text>
              <Avatar url={item.avatar_url} name={item.name} size={32} />
              <View>
                <Text style={ui.text}>{item.name}</Text>
                {teams.has(item.user_id) && (
                  <Text style={ui.muted}>{teams.get(item.user_id)!.team_name} · {record(teams.get(item.user_id)!)}</Text>
                )}
              </View>
              <Text style={ui.text}>{trophies(item.user_id)}</Text>
            </View>
            <WuCoin amount={item.balance} size={18} signed={period !== 'all'} />
          </View>
        )}
        ListFooterComponent={
          awards.length > 0 ? (
            <View style={{ marginTop: 24, gap: 4 }}>
              <Text style={ui.title}>Hall of fame</Text>
              {awards.map((a) => (
                <View key={`${a.kind}-${a.period_start}-${a.user_id}`} style={ui.row}>
                  <Text style={[ui.text, a.kind === 'year' && { fontWeight: '700' }]}>
                    {a.kind === 'year' ? '🏆' : '🏅'} {awardLabel(a)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={ui.text}>{nameOf.get(a.user_id)}</Text>
                    <WuCoin amount={a.net} size={16} signed />
                  </View>
                </View>
              ))}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
