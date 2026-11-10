import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

// Email + password. "Confirm email" is off in Supabase, so sign-up signs you straight in and no email is sent.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setError(error?.message ?? null);
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setError(error?.message ?? null);
  }

  return (
    <View style={ui.screen}>
      <Text style={ui.title}>Sign in</Text>
      <TextInput style={ui.input} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={ui.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={ui.button} onPress={signIn}>
        <Text style={ui.buttonText}>Sign in</Text>
      </Pressable>
      <Pressable onPress={signUp}>
        <Text style={ui.muted}>New here? Create account</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
