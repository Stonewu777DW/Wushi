import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

export default function Username() {
  const { session, setUsername } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const username = name.trim();
    const { error } = await supabase.from('profiles').insert({ id: session!.user.id, username });
    if (error) return setError(error.code === '23505' ? 'That username is taken' : error.message);
    setUsername(username);
  }

  return (
    <View style={ui.screen}>
      <Text style={ui.muted}>3 to 20 letters, numbers or underscores. Your friends will see this.</Text>
      <TextInput style={ui.input} placeholderTextColor="#999" placeholder="username" autoCapitalize="none" value={name} onChangeText={setName} />
      <Pressable style={ui.button} onPress={save}>
        <Text style={ui.buttonText}>Continue</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={ui.muted}>Sign out</Text>
      </Pressable>
    </View>
  );
}
