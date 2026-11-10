import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { createBet, listMembers, type Member } from '../../../../lib/friendlyBets';
import { useSession } from '../../../../lib/session';
import { colors, ui } from '../../../../lib/ui';

const DAY = 86_400_000;
// Longer bets pay the maker more for a good line, so the length is a deliberate choice.
const DURATIONS = [
  { label: '1 day', ms: DAY },
  { label: '1 week', ms: 7 * DAY },
  { label: '1 month', ms: 30 * DAY },
  { label: '1 year', ms: 365 * DAY },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accent : colors.surface,
      }}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function NewFriendlyBet() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const me = useSession().session!.user.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState('');
  const [sideA, setSideA] = useState('Yes');
  const [sideB, setSideB] = useState('No');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMembers(groupId).then((m) => setMembers(m.filter((x) => x.user_id !== me)));
  }, [groupId, me]);

  async function submit() {
    try {
      const bet = await createBet({
        groupId,
        title: title.trim(),
        sideA: sideA.trim(),
        sideB: sideB.trim(),
        subjectId,
        closesAt: new Date(Date.now() + duration.ms),
      });
      router.replace(`/group/${groupId}/friendly/${bet.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[ui.screen, { flexGrow: 1 }]}>
      <Stack.Screen options={{ title: 'Make a line' }} />
      <Text style={ui.muted}>
        Set a line you think splits the group evenly. A balanced book earns you WuCoins; a one-sided one costs you.
      </Text>
      <TextInput style={ui.input} placeholderTextColor={colors.muted} placeholder="e.g. Will Mike shoot under 90 Saturday?"
        value={title} onChangeText={setTitle} maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholderTextColor={colors.muted} placeholder="Side A" value={sideA} onChangeText={setSideA} maxLength={30} />
        <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholderTextColor={colors.muted} placeholder="Side B" value={sideB} onChangeText={setSideB} maxLength={30} />
      </View>

      <Text style={ui.text}>Who is it about?</Text>
      <Text style={ui.muted}>They won't see this bet until it's resolved, and can't bet on it.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="No one" selected={subjectId === null} onPress={() => setSubjectId(null)} />
        {members.map((m) => (
          <Chip key={m.user_id} label={m.name} selected={subjectId === m.user_id} onPress={() => setSubjectId(m.user_id)} />
        ))}
      </View>

      <Text style={ui.text}>Betting closes in</Text>
      <Text style={ui.muted}>Longer bets pay the maker more for a good line.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DURATIONS.map((d) => (
          <Chip key={d.label} label={d.label} selected={d === duration} onPress={() => setDuration(d)} />
        ))}
      </View>

      <Pressable style={[ui.button, { marginTop: 8 }]} onPress={submit}>
        <Text style={ui.buttonText}>Post line</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
    </ScrollView>
  );
}
