import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text } from '../../../../lib/Text';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { createBet, listBets, listMembers, MAX_LIVE_BETS, type Member } from '../../../../lib/friendlyBets';
import { useSession } from '../../../../lib/session';
import type { FriendlyBet } from '../../../../lib/types';
import { colors, placeholder, ui } from '../../../../lib/ui';

const DAY = 86_400_000;
// Longer bets pay the maker more for a good line, so the length is a deliberate choice.
const DURATIONS = [
  { label: '1 day', ms: DAY },
  { label: '1 week', ms: 7 * DAY },
  { label: '1 month', ms: 30 * DAY },
  { label: '1 year', ms: 365 * DAY },
];
const SIGNIFICANCE: { label: string; value: FriendlyBet['significance'] }[] = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Big', value: 'big' },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[ui.pill, selected && ui.pillActive]}>
      <Text style={selected ? ui.pillActiveText : undefined}>{label}</Text>
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
  const [appBanks, setAppBanks] = useState(false);
  const [significance, setSignificance] = useState<FriendlyBet['significance']>('small');
  const [error, setError] = useState<string | null>(null);
  const [liveBets, setLiveBets] = useState(0);

  useEffect(() => {
    listMembers(groupId).then((m) => setMembers(m.filter((x) => x.user_id !== me)));
    listBets(groupId).then((b) => setLiveBets(b.filter((x) => x.maker_id === me && x.status === 'open').length));
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
        significance,
        appBanks,
      });
      router.replace(`/group/${groupId}/friendly/${bet.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[ui.screen, { flexGrow: 1 }]}>
      <Stack.Screen options={{ title: 'Make a line' }} />
      <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder="e.g. Will Mike shoot under 90 Saturday?"
        value={title} onChangeText={setTitle} maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholderTextColor={placeholder} placeholder="Side A" value={sideA} onChangeText={setSideA} maxLength={30} />
        <TextInput style={[ui.input, { flex: 1, minWidth: 0 }]} placeholderTextColor={placeholder} placeholder="Side B" value={sideB} onChangeText={setSideB} maxLength={30} />
      </View>

      <Text>Who is it about?</Text>
      <Text style={ui.muted}>They won't see this bet until it's resolved, and can't bet on it.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="No one" selected={subjectId === null} onPress={() => setSubjectId(null)} />
        {members.map((m) => (
          <Chip key={m.user_id} label={m.name} selected={subjectId === m.user_id} onPress={() => setSubjectId(m.user_id)} />
        ))}
      </View>

      <Text>Betting closes in</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DURATIONS.map((d) => (
          <Chip key={d.label} label={d.label} selected={d === duration} onPress={() => setDuration(d)} />
        ))}
      </View>

      <Text>How big a deal is it?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SIGNIFICANCE.map((x) => (
          <Chip key={x.value} label={x.label} selected={x.value === significance} onPress={() => setSignificance(x.value)} />
        ))}
      </View>
      <Text style={ui.muted}>Bigger and longer bets need bigger stakes and pay the maker more for a good line.</Text>

      <Text>Who backs the bet?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="I do" selected={!appBanks} onPress={() => setAppBanks(false)} />
        <Chip label="The app" selected={appBanks} onPress={() => setAppBanks(true)} />
      </View>
      <Text style={ui.muted}>
        {appBanks
          ? "No risk to you. You still earn a bonus if 40% or more of the coins land on the losing side."
          : 'You earn a bonus if 40% or more of the coins land on the losing side, and pay the gap if 80% or more land on the winning side.'}
      </Text>

      <Text style={liveBets >= MAX_LIVE_BETS ? ui.error : ui.muted}>
        {liveBets >= MAX_LIVE_BETS
          ? `You already have ${MAX_LIVE_BETS} live bets in this group. Settle or cancel one to make another.`
          : `Live bets: ${liveBets} of ${MAX_LIVE_BETS}`}
      </Text>
      <Pressable style={[ui.button, liveBets >= MAX_LIVE_BETS && { opacity: 0.4 }]} disabled={liveBets >= MAX_LIVE_BETS} onPress={submit}>
        <Text style={ui.buttonText}>Post line</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
    </ScrollView>
  );
}
