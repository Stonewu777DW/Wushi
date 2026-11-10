import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../lib/Avatar';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { ui } from '../lib/ui';
import { YahooFantasy } from '../lib/YahooFantasy';

export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session!.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', userId).single<Profile>().then(({ data }) => setProfile(data));
  }, [userId]);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    // New path per upload so cached old avatars don't linger.
    const path = `${userId}/${Date.now()}.${contentType.split('/')[1]}`;
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType });
    if (error) return setStatus(error.message);
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setProfile((p) => p && { ...p, avatar_url: data.publicUrl });
  }

  async function save() {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: profile.display_name?.trim() || null, bio: profile.bio?.trim() || null, avatar_url: profile.avatar_url })
      .eq('id', userId);
    setStatus(error ? error.message : 'Saved');
  }

  if (!profile) return null;

  return (
    <View style={ui.screen}>
      <Pressable onPress={pickAvatar} style={{ alignItems: 'center', gap: 6 }}>
        <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={96} />
        <Text style={ui.muted}>Change photo</Text>
      </Pressable>
      <Text style={ui.muted}>@{profile.username}</Text>
      <TextInput style={ui.input} placeholderTextColor="#999" placeholder="Display name" value={profile.display_name ?? ''}
        onChangeText={(display_name) => setProfile({ ...profile, display_name })} maxLength={40} />
      <TextInput style={[ui.input, { minHeight: 80 }]} placeholderTextColor="#999" placeholder="Bio" multiline value={profile.bio ?? ''}
        onChangeText={(bio) => setProfile({ ...profile, bio })} maxLength={160} />
      <Pressable style={ui.button} onPress={save}>
        <Text style={ui.buttonText}>Save</Text>
      </Pressable>
      {status && <Text style={ui.muted}>{status}</Text>}
      <YahooFantasy userId={userId} />
      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={ui.muted}>Sign out</Text>
      </Pressable>
    </View>
  );
}
