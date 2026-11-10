import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';

function RootStack() {
  const { session, loading } = useSession();
  if (loading) return null;

  return (
    <Stack>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ title: 'Wushi' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
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
      {/* Phone-width column, so the web build looks like the app on a wide screen. */}
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#e5e5e5' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 430 }}>
          <RootStack />
        </View>
      </View>
    </SessionProvider>
  );
}
