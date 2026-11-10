import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colors, ui } from './ui';

// Chrome/Android fires this event when the site can be installed; it isn't in the TS DOM types.
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

// Tells web visitors how to put Wushi on their home screen. Hidden once it runs installed.
export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const installed = Platform.OS !== 'web' || window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  useEffect(() => {
    if (installed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [installed]);

  if (installed) return null;

  if (prompt) {
    return (
      <Pressable style={ui.button} onPress={() => prompt.prompt().then(() => setPrompt(null))}>
        <Text style={ui.buttonText}>Install Wushi on this phone</Text>
      </Pressable>
    );
  }

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <View style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface }}>
      <Text style={ui.muted}>
        {ios
          ? 'Get the app: tap Share, then "Add to Home Screen".'
          : 'Get the app: open your browser menu, then "Install app" or "Add to Home screen".'}
      </Text>
    </View>
  );
}
