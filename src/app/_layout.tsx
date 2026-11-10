import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SessionProvider, useSession } from '../lib/session';
import { colors, navTheme } from '../lib/ui';

function RootStack() {
  const { session, loading } = useSession();
  if (loading) return null;

  return (
    <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ title: 'Wushi' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" options={{ title: 'Your groups' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="group/[id]/index" options={{ title: 'Group' }} />
        <Stack.Screen name="group/[id]/[sport]" options={{ title: 'Sports bets' }} />
        <Stack.Screen name="group/[id]/fantasy" options={{ title: 'Fantasy Football' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        {/* Phone-width column, so the web build looks like the app on a wide screen. */}
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.surface }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 430, backgroundColor: colors.bg }}>
            <RootStack />
          </View>
        </View>
      </ThemeProvider>
    </SessionProvider>
  );
}
