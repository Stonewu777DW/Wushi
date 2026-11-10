import { Image, View } from 'react-native';
import { Text } from './Text';

// The WuCoin: a black poker chip with the number 19 (same art as the app icon).
// Without amount it renders just the chip. signed shows a + on gains.
export function WuCoin({ amount, size = 20, signed = false }: { amount?: number; size?: number; signed?: boolean }) {
  const chip = <Image source={require('../../assets/wucoin.png')} style={{ width: size, height: size }} />;
  if (amount === undefined) return chip;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      {chip}
      <Text style={{ fontWeight: '700', fontSize: size * 0.8 }}>{signed && amount > 0 ? '+' : ''}{amount.toLocaleString()}</Text>
    </View>
  );
}
