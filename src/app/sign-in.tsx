import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { InstallHint } from '../lib/InstallHint';
import { placeholder, ui } from '../lib/ui';
import { WuCoin } from '../lib/WuCoin';

// Username + password only. Supabase Auth needs an email, so each username maps to an
// address nobody receives mail at. "Confirm email" is off, so no email is ever sent.
const loginEmail = (username: string) => `${username.toLowerCase()}@users.wushi.app`;
const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

export default function SignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function check() {
    if (!USERNAME.test(username.trim())) return 'Username: 3 to 20 letters, numbers or underscores.';
    if (password.length < 6) return 'Password: at least 6 characters.';
    return null;
  }

  async function signIn() {
    const problem = check();
    if (problem) return setError(problem);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username.trim()), password });
    setError(error ? 'Wrong username or password.' : null);
  }

  async function signUp() {
    const problem = check();
    if (problem) return setError(problem);
    const name = username.trim();
    // A database trigger creates the profile from this username.
    const { error } = await supabase.auth.signUp({ email: loginEmail(name), password, options: { data: { username: name } } });
    setError(error ? (error.code === 'user_already_exists' ? 'That username is taken.' : error.message) : null);
  }

  return (
    <View style={ui.screen}>
      <View style={{ alignItems: 'center', gap: 8, marginVertical: 24 }}>
        <WuCoin size={72} />
        <Text style={[ui.title, { fontSize: 32 }]}>Wushi</Text>
      </View>
      <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder="Username" autoCapitalize="none" autoCorrect={false}
        value={username} onChangeText={setUsername} />
      <TextInput style={ui.input} placeholderTextColor={placeholder} placeholder="Password (6+ characters)" secureTextEntry
        value={password} onChangeText={setPassword} />
      <Pressable style={ui.button} onPress={signIn}>
        <Text style={ui.buttonText}>Sign in</Text>
      </Pressable>
      <Pressable onPress={signUp}>
        <Text style={[ui.link, { textAlign: 'center' }]}>New here? Create account</Text>
      </Pressable>
      {error && <Text style={ui.error}>{error}</Text>}
      <InstallHint />
    </View>
  );
}
