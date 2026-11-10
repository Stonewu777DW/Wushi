import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

// Email + password. "Confirm email" is off in Supabase, so sign-up signs you straight in and no email is sent.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Supabase reads an empty email as an anonymous sign-in, which gives a confusing error.
  function filledIn() {
    if (email.trim() && password) return true;
    setError('Enter your email and a password.');
    return false;
  }

  async function signIn() {
    if (!filledIn()) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setError(error?.message ?? null);
  }

  async function signUp() {
    if (!filledIn()) return;
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setError(error?.message ?? null);
  }

  return (
    <View style={ui.screen}>
      <Text style={ui.title}>Sign in</Text>
      <TextInput style={ui.input} placeholderTextColor="#999" placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} />
      <TextInput style={ui.input} placeholderTextColor="#999" placeholder="Password (6+ characters)" secureTextEntry value={password} onChangeText={setPassword} />
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
