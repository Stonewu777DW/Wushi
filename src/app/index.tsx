import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import type { Group } from '../lib/types';
import { ui } from '../lib/ui';

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase.from('groups').select('*').order('created_at').then(({ data, error }) => {
      setError(error?.message ?? null);
      setGroups(data ?? []);
    });
  }, []);
  useFocusEffect(load);

  async function call(fn: 'create_group' | 'join_group', args: Record<string, string>) {
    const { data, error } = await supabase.rpc(fn, args).single<Group>();
    if (error) return setError(error.message);
    setNewName('');
    setInviteCode('');
    router.push(`/group/${data.id}`);
  }

  return (
    <View style={ui.screen}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        ListEmptyComponent={<Text style={ui.muted}>No groups yet. Create one or join with an invite code.</Text>}
        renderItem={({ item }) => (
          <Link href={`/group/${item.id}`} style={ui.row}>
            <Text style={{ fontSize: 18 }}>{item.name}</Text>
          </Link>
        )}
      />
      <TextInput style={ui.input} placeholder="New group name" value={newName} onChangeText={setNewName} />
      <Pressable style={ui.button} onPress={() => call('create_group', { group_name: newName.trim() })}>
        <Text style={ui.buttonText}>Create group</Text>
      </Pressable>
      <TextInput style={ui.input} placeholder="Invite code" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} />
      <Pressable style={ui.button} onPress={() => call('join_group', { code: inviteCode })}>
        <Text style={ui.buttonText}>Join group</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={ui.muted}>Sign out</Text>
      </Pressable>
    </View>
  );
}
