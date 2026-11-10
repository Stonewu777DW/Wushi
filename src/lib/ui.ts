import { StyleSheet } from 'react-native';
import { DarkTheme, type Theme } from 'expo-router';

// Wushi palette: mostly black with a touch of yellow. Use these instead of hex values in screens.
export const colors = {
  bg: '#000000',
  surface: '#141414', // cards, inputs, list rows
  border: '#2a2a2a',
  text: '#f5f5f5',
  muted: '#8a8a8a',
  accent: '#ffcc00', // the yellow: primary buttons, highlights, active states
  onAccent: '#000000', // text on top of accent
  danger: '#ff5c5c',
};

// Header, screen background and back button colors for the navigation stack.
export const navTheme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.accent, background: colors.bg, card: colors.bg, text: colors.text, border: colors.border },
};

// Import Text from src/lib/Text (not react-native): it defaults to colors.text.
export const ui = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
  link: { color: colors.accent, fontWeight: '600' },
  input: { backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  // Secondary action next to a primary yellow button.
  buttonOutline: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonOutlineText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
  error: { color: colors.danger },
  // Toggle/filter pills (e.g. leaderboard period). Use ui.pillActiveText on the active pill.
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillActiveText: { color: colors.onAccent, fontWeight: '700' },
});

// Pass as placeholderTextColor on every TextInput.
export const placeholder = colors.muted;
