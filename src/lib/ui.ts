import { StyleSheet } from 'react-native';

export const ui = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  error: { color: '#c00' },
});
