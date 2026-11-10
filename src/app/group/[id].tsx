import { useCallback, useState } from 'react';
import { FlatList, Share, Pressable, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../lib/Avatar';
import type { FantasyTeam, Group, Profile, Standing } from '../../lib/types';
import { record } from '../../lib/YahooFantasy';
import { ui } from '../../lib/ui';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [teams, setTeams] = useState<Map<string, FantasyTeam>>(new Map());

  const load = useCallback(() => {
    supabase.from('groups').select('*').eq('id', id).single<Group>().then(({ data }) => setGroup(data));
    Promise.all([
      supabase.from('group_balances').select('user_id, balance').eq('group_id', id),
      supabase.from('group_members').select('user_id, profiles(username, display_name, avatar_url)').eq('group_id', id),
    ]).then(([balances, members]) => {
      const balanceOf = new Map((balances.data ?? []).map((b) => [b.user_id as string, b.balance as number]));
      const rows = (members.data ?? []).map((m) => {
        const p = m.profiles as unknown as Pick<Profile, 'username' | 'display_name' | 'avatar_url'>;
        return {
          user_id: m.user_id as string,
          name: p.display_name ?? p.username,
          avatar_url: p.avatar_url,
          balance: balanceOf.get(m.user_id as string) ?? 0,
        };
      });
      setStandings(rows.sort((a, b) => b.balance - a.balance));
      supabase.from('fantasy_teams').select('*').in('user_id', rows.map((r) => r.user_id))
        .then(({ data }) => setTeams(new Map((data ?? []).map((t) => [t.user_id, t]))));
    });
  }, [id]);
  useFocusEffect(load);

  if (!group) return null;

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: group.name }} />
      <Pressable style={ui.button} onPress={() => Share.share({ message: `Join my Wushi group "${group.name}" with code ${group.invite_code}` })}>
        <Text style={ui.buttonText}>Invite friends ({group.invite_code})</Text>
      </Pressable>
      <Text style={ui.title}>Standings</Text>
      <FlatList
        data={standings}
        keyExtractor={(s) => s.user_id}
        renderItem={({ item, index }) => (
          <View style={[ui.row, { alignItems: 'center' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text>{index + 1}.</Text>
              <Avatar url={item.avatar_url} name={item.name} size={32} />
              <View>
                <Text>{item.name}</Text>
                {teams.has(item.user_id) && (
                  <Text style={ui.muted}>{teams.get(item.user_id)!.team_name} · {record(teams.get(item.user_id)!)}</Text>
                )}
              </View>
            </View>
            <Text>{item.balance} WC</Text>
          </View>
        )}
      />
    </View>
  );
}
