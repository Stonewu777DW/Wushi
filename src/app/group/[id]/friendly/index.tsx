import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '../../../../lib/Text';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { listBets, listMembers, timeLeft } from '../../../../lib/friendlyBets';
import type { FriendlyBet } from '../../../../lib/types';
import { colors, ui } from '../../../../lib/ui';

export default function FriendlyBetsScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const [bets, setBets] = useState<FriendlyBet[]>([]);
  const [names, setNames] = useState(new Map<string, string>());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listBets(groupId), listMembers(groupId)])
      .then(([b, m]) => {
        setBets(b);
        setNames(new Map(m.map((x) => [x.user_id, x.name])));
      })
      .catch((e: Error) => setError(e.message));
  }, [groupId]);
  useFocusEffect(load);

  return (
    <View style={ui.screen}>
      <Stack.Screen options={{ title: 'Friendly bets' }} />
      <Pressable style={ui.button} onPress={() => router.push(`/group/${groupId}/friendly/new`)}>
        <Text style={ui.buttonText}>Make a line</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
      <FlatList
        data={bets}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ gap: 10 }}
        ListEmptyComponent={<Text style={ui.muted}>No bets yet. Make the first line.</Text>}
        renderItem={({ item }) => (
          <Link href={`/group/${groupId}/friendly/${item.id}`} asChild>
            <Pressable style={ui.card}>
              <Text style={[{ fontWeight: '700' }]}>{item.title}</Text>
              <Text style={ui.muted}>
                {item.side_a} vs {item.side_b} · line by {names.get(item.maker_id) ?? '…'}
              </Text>
              <Text style={{ color: item.status === 'open' ? colors.accent : colors.muted, fontWeight: '600' }}>
                {item.status === 'open' && timeLeft(item.closes_at)}
                {item.status === 'resolved' && `Won: ${item.winning_side === 'a' ? item.side_a : item.side_b}`}
                {item.status === 'cancelled' && 'Cancelled, stakes refunded'}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}
