// TEMPORARY stub matching the App Design branch's exports; replaced on rebase.
import { Text, View } from 'react-native';

export function WuCoin({ amount, size = 20 }: { amount?: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#000', borderWidth: 2, borderColor: '#f5c518', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#f5c518', fontSize: size * 0.42, fontWeight: '800' }}>19</Text>
      </View>
      {amount !== undefined && <Text style={{ color: '#f5f5f5', fontWeight: '700', fontSize: size * 0.8 }}>{amount}</Text>}
    </View>
  );
}
