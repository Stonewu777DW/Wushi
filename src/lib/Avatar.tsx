import { Image, View } from 'react-native';
import { Text } from './Text';
import { colors } from './ui';

export function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={style} />;
  return (
    <View style={[style, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.accent, fontSize: size / 2.2, fontWeight: '600' }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
