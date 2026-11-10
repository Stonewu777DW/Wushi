import { Text as RNText, type TextProps } from 'react-native';
import { colors } from './ui';

// Use this instead of react-native's Text: it defaults to the theme's light text color,
// so text stays readable on the black background without extra styling.
export function Text({ style, ...props }: TextProps) {
  return <RNText style={[{ color: colors.text, fontSize: 16 }, style]} {...props} />;
}
