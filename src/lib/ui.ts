// TEMPORARY stub matching the App Design branch's exports; replaced on rebase.
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#000', surface: '#141414', border: '#2a2a2a', text: '#f5f5f5', muted: '#8a8a8a',
  accent: '#f5c518', onAccent: '#000', danger: '#ff5a5a',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  text: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  button: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.onAccent, fontWeight: '600', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.danger },
});
