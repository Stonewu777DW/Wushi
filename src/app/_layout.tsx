import { Stack } from 'expo-router';
import { SessionProvider, useSession } from '../lib/session';

function RootStack() {
  const { session, username, loading } = useSession();
  if (loading) return null;

  return (
    <Stack>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ title: 'Wushi' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !username}>
        <Stack.Screen name="username" options={{ title: 'Pick a username' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !!username}>
        <Stack.Screen name="index" options={{ title: 'Your groups' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Group' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootStack />
    </SessionProvider>
  );
}
