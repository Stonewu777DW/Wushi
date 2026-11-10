import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { memberNames } from '../../../../lib/tournaments';
import type { Tournament } from '../../../../lib/types';
import { colors, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

type Row = Tournament & { tournament_players: { count: number }[] };

const STATUS = { open: 'Open', completed: 'Paid out', cancelled: 'Cancelled, refunded' };

export default function TournamentsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const me = useSession().session!.user.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from('tournaments')
      .select('*, tournament_players(count)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .returns<Row[]>()
      .then(({ data, error }) => {
        setError(error?.message ?? null);
        // Open tournaments first, newest first within each.
        setRows((data ?? []).sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')));
      });
    memberNames(groupId).then(setNames);
  }, [groupId]);
  useFocusEffect(load);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: 'Tournaments' }} />
      <Pressable style={ui.button} onPress={() => router.push(`/group/${groupId}/tournaments/new`)}>
        <Text style={ui.buttonText}>Host a tournament</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ gap: 10 }}
        ListEmptyComponent={<Text style={ui.muted}>No tournaments yet. Playing golf or poker? Host one.</Text>}
        renderItem={({ item }) => {
          const players = item.tournament_players[0]?.count ?? 0;
          return (
            <Link href={`/group/${groupId}/tournaments/${item.id}`} asChild>
              <Pressable style={ui.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700' }}>{item.name}</Text>
                  <WuCoin amount={item.buy_in * players} size={18} />
                </View>
                <Text style={ui.muted}>
                  Hosted by {item.host_id === me ? 'you' : names.get(item.host_id) ?? '…'} · {players} {players === 1 ? 'player' : 'players'} · buy-in {item.buy_in}
                </Text>
                <Text style={{ color: item.status === 'open' ? colors.accent : colors.muted, fontWeight: '600' }}>
                  {STATUS[item.status]}
                </Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}
