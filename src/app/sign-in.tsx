import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { ui } from '../lib/ui';

// Email one-time code: no passwords and no deep-link setup.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setError(error?.message ?? null);
    if (!error) setCodeSent(true);
  }

  async function verify() {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setError(error?.message ?? null);
  }

  return (
    <View style={ui.screen}>
      <Text style={ui.title}>Sign in</Text>
      <TextInput style={ui.input} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} editable={!codeSent} />
      {codeSent && (
        <TextInput style={ui.input} placeholder="6-digit code" keyboardType="number-pad" value={code} onChangeText={setCode} />
      )}
      <Pressable style={ui.button} onPress={codeSent ? verify : sendCode}>
        <Text style={ui.buttonText}>{codeSent ? 'Verify code' : 'Send code'}</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
    </View>
  );
}
