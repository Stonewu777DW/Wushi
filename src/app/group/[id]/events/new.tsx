import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { supabase } from '../../../../lib/supabase';
import { KINDS, ordinal, payouts } from '../../../../lib/events';
import type { EventKind, GroupEvent } from '../../../../lib/types';
import { colors, placeholder, ui } from '../../../../lib/ui';
import { WuCoin } from '../../../../lib/WuCoin';

// Payout shares by place. Places past the end of the list get nothing.
const SPLITS = [
  { label: 'Top half', shares: [4, 3, 1, 0] },
  { label: 'Top 2', shares: [3, 2] },
  { label: 'Winner takes all', shares: [1] },
];

export default function NewEventScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<EventKind>('golf');
  const [buyIn, setBuyIn] = useState('');
  const [shares, setShares] = useState(SPLITS[0].shares);
  const [error, setError] = useState<string | null>(null);

  const coins = Number(buyIn);
  const valid = name.trim().length > 0 && Number.isInteger(coins) && coins > 0;
  // Preview for a foursome, the common case.
  const preview = payouts((valid ? coins : 100) * 4, shares, 4);

  async function create() {
    const { data, error } = await supabase
      .rpc('create_event', {
        g: groupId,
        event_name: name.trim(),
        event_type: kind,
        buy_in_amount: coins,
        shares: kind === 'poker' ? null : shares,
      })
      .single<GroupEvent>();
    if (error) return setError(error.message);
    router.replace(`/group/${groupId}/events/${data.id}`);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: 'Host an event' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {KINDS.map((k) => (
          <Pressable key={k.key} onPress={() => setKind(k.key)} style={[ui.pill, kind === k.key && ui.pillActive]}>
            <Text style={kind === k.key ? ui.pillActiveText : undefined}>{k.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={ui.input} placeholder="Name, e.g. Saturday at Pebble" placeholderTextColor={placeholder} maxLength={60} value={name} onChangeText={setName} />
      <TextInput style={ui.input} placeholder="Buy-in per player (WuCoins)" placeholderTextColor={placeholder} keyboardType="number-pad" value={buyIn} onChangeText={setBuyIn} />

      {kind === 'poker' ? (
        <Text style={ui.muted}>Everyone enters their final chip count and the pot is split in proportion to chips.</Text>
      ) : (
        <>
          <Text style={{ fontWeight: '700' }}>Payout</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPLITS.map((s) => (
              <Pressable key={s.label} onPress={() => setShares(s.shares)} style={[ui.pill, s.shares === shares && ui.pillActive]}>
                <Text style={s.shares === shares ? ui.pillActiveText : undefined}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={ui.muted}>
            {kind === 'golf' ? 'Ranked by net score (score minus handicap).' : 'You rank the players when it’s over.'} With 4 players at{' '}
            {valid ? coins : 100} each:
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {preview.map((amount, i) => (
              <View key={i} style={[ui.card, { flex: 1, alignItems: 'center', gap: 4 }]}>
                <Text style={ui.muted}>{ordinal(i + 1)}</Text>
                <WuCoin amount={amount} size={16} />
              </View>
            ))}
          </View>
        </>
      )}

      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={[ui.button, !valid && { opacity: 0.4 }]} disabled={!valid} onPress={create}>
        <Text style={ui.buttonText}>Create</Text>
      </Pressable>
    </ScrollView>
  );
}
