import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { useSession } from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';
import { kindLabel, memberNames } from '../../../../lib/events';
import type { GroupEvent } from '../../../../lib/types';
import { colors, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

type Row = GroupEvent & { event_players: { count: number }[] };

const STATUS = { open: 'Open', completed: 'Paid out', cancelled: 'Cancelled, refunded' };

export default function EventsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const me = useSession().session!.user.id;
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from('events')
      .select('*, event_players(count)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .returns<Row[]>()
      .then(({ data, error }) => {
        setError(error?.message ?? null);
        // Open events first, newest first within each.
        setRows((data ?? []).sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open')));
      });
    memberNames(groupId).then(setNames);
  }, [groupId]);
  useFocusEffect(load);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: 'Events' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[ui.button, { flex: 1 }]} onPress={() => router.push(`/group/${groupId}/events/new`)}>
          <Text style={ui.buttonText}>Host an event</Text>
        </Pressable>
        <Pressable style={[ui.buttonOutline, { flex: 1 }]} onPress={() => router.push(`/group/${groupId}/golf`)}>
          <Text style={ui.buttonOutlineText}>Golf rounds</Text>
        </Pressable>
      </View>
      {error && <Text style={ui.error}>{error}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 10 }}
        ListEmptyComponent={<Text style={ui.muted}>No events yet. Playing golf or poker? Host one.</Text>}
        renderItem={({ item }) => {
          const players = item.event_players[0]?.count ?? 0;
          return (
            <Link href={`/group/${groupId}/events/${item.id}`} asChild>
              <Pressable style={ui.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', flexShrink: 1 }}>{item.name}</Text>
                  <WuCoin amount={item.buy_in * players} size={18} />
                </View>
                <Text style={ui.muted}>
                  {kindLabel(item.kind)} · hosted by {item.host_id === me ? 'you' : names.get(item.host_id) ?? '…'} · {players}{' '}
                  {players === 1 ? 'player' : 'players'} · buy-in {item.buy_in}
                </Text>
                <Text style={{ color: item.status === 'open' ? colors.accent : colors.muted, fontWeight: '600' }}>{STATUS[item.status]}</Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}
