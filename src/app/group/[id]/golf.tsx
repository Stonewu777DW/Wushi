import { useCallback, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../../lib/Text';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { memberNames } from '../../../lib/events';
import type { GolfRound } from '../../../lib/types';
import { colors, placeholder, ui } from '../../../lib/ui';

type Handicap = { userId: string; name: string; handicap: number | null };

const toPar = (r: GolfRound) => (r.score - r.par > 0 ? `+${r.score - r.par}` : r.score === r.par ? 'E' : `${r.score - r.par}`);

// Golf tracking for the group: everyone's handicap, your rounds, and logging a casual round.
export default function GolfScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const me = useSession().session!.user.id;
  const [handicaps, setHandicaps] = useState<Handicap[]>([]);
  const [rounds, setRounds] = useState<GolfRound[]>([]);
  const [form, setForm] = useState({ course: '', par: '72', score: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    memberNames(groupId).then(async (names) => {
      const rows = await Promise.all(
        [...names].map(async ([userId, name]) => {
          const { data } = await supabase.rpc('golf_handicap', { g: groupId, u: userId });
          return { userId, name: userId === me ? 'You' : name, handicap: data as number | null };
        }),
      );
      // Players with a handicap first, lowest (best) first.
      setHandicaps(rows.sort((a, b) => (a.handicap ?? 999) - (b.handicap ?? 999)));
    });
    supabase
      .from('golf_rounds')
      .select('*')
      .eq('group_id', groupId)
      .eq('user_id', me)
      .order('played_on', { ascending: false })
      .limit(20)
      .returns<GolfRound[]>()
      .then(({ data }) => setRounds(data ?? []));
  }, [groupId, me]);
  useFocusEffect(load);

  async function save() {
    const { error } = await supabase.rpc('record_golf_round', {
      g: groupId,
      course_name: form.course.trim(),
      course_par: Number(form.par),
      round_score: Number(form.score),
    });
    setError(error?.message ?? null);
    if (!error) setForm({ ...form, score: '' });
    load();
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: 'Golf' }} />
      <View style={ui.card}>
        <Text style={{ fontWeight: '700' }}>Log a round</Text>
        <TextInput style={ui.input} placeholder="Course" placeholderTextColor={placeholder} maxLength={60} value={form.course} onChangeText={(course) => setForm({ ...form, course })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholder="Par" placeholderTextColor={placeholder} keyboardType="number-pad" value={form.par} onChangeText={(par) => setForm({ ...form, par })} />
          <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholder="Score" placeholderTextColor={placeholder} keyboardType="number-pad" value={form.score} onChangeText={(score) => setForm({ ...form, score })} />
        </View>
        {error && <Text style={ui.error}>{error}</Text>}
        <Pressable style={ui.button} onPress={save}>
          <Text style={ui.buttonText}>Save round</Text>
        </Pressable>
      </View>

      <Text style={ui.title}>Handicaps</Text>
      <Text style={ui.muted}>Average over par of your best 8 of your last 20 rounds.</Text>
      {handicaps.map((h) => (
        <View key={h.userId} style={ui.row}>
          <Text>{h.name}</Text>
          <Text style={{ fontWeight: '700', color: h.handicap === null ? colors.muted : colors.accent }}>{h.handicap ?? '–'}</Text>
        </View>
      ))}

      <Text style={ui.title}>Your rounds</Text>
      {rounds.length === 0 && <Text style={ui.muted}>No rounds yet.</Text>}
      {rounds.map((r) => (
        <View key={r.id} style={ui.row}>
          <View style={{ flexShrink: 1 }}>
            <Text>{r.course}</Text>
            <Text style={ui.muted}>
              {new Date(r.played_on).toLocaleDateString(undefined, { timeZone: 'UTC' })} · par {r.par}
              {r.event_id ? ' · event' : ''}
            </Text>
          </View>
          <Text style={{ fontWeight: '700' }}>
            {r.score} ({toPar(r)})
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
