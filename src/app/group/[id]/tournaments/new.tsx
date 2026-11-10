import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../../lib/Text';
import { supabase } from '../../../../lib/supabase';
import type { Tournament } from '../../../../lib/types';
import { colors, placeholder, ui } from '../../../../lib/ui';

const SPLITS = [
  { label: 'Winner takes all', split: [100] },
  { label: 'Top 2 · 60/40', split: [60, 40] },
  { label: 'Top 3 · 50/30/20', split: [50, 30, 20] },
];

export default function NewTournamentScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [split, setSplit] = useState(SPLITS[0].split);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const { data, error } = await supabase
      .rpc('create_tournament', { g: groupId, tournament_name: name.trim(), buy_in_amount: Number(buyIn), split })
      .single<Tournament>();
    if (error) return setError(error.message);
    router.replace(`/group/${groupId}/tournaments/${data.id}`);
  }

  const valid = name.trim().length > 0 && Number.isInteger(Number(buyIn)) && Number(buyIn) > 0;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: 'Host a tournament' }} />
      <Text style={ui.muted}>Everyone who joins pays the buy-in into the pot. When it's over you enter the results and the pot pays out.</Text>
      <TextInput style={ui.input} placeholder="Name, e.g. Friday night poker" placeholderTextColor={placeholder} maxLength={60} value={name} onChangeText={setName} />
      <TextInput style={ui.input} placeholder="Buy-in (WuCoins)" placeholderTextColor={placeholder} keyboardType="number-pad" value={buyIn} onChangeText={setBuyIn} />
      <Text style={{ fontWeight: '700' }}>Payout</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SPLITS.map((s) => {
          const active = s.split === split;
          return (
            <Pressable key={s.label} onPress={() => setSplit(s.split)} style={[ui.pill, active && ui.pillActive]}>
              <Text style={active ? ui.pillActiveText : undefined}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={[ui.button, !valid && { opacity: 0.4 }]} disabled={!valid} onPress={create}>
        <Text style={ui.buttonText}>Create</Text>
      </Pressable>
    </ScrollView>
  );
}
