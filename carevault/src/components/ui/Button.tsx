import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { color, HIT, radius, space, type } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet' | 'destructive';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', busy, disabled, style }: Props) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.base,
        variant === 'primary' && s.primary,
        variant === 'quiet' && s.quiet,
        variant === 'destructive' && s.destructive,
        pressed && s.pressed,
        off && s.off,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? color.surface : color.leaf} />
      ) : (
        <Text style={[s.label, variant !== 'primary' && s.labelDark, variant === 'destructive' && s.labelDanger]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    minHeight: HIT,
    paddingHorizontal: space(5),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: color.leaf },
  quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.hairline },
  destructive: { backgroundColor: color.dangerSoft },
  pressed: { opacity: 0.82 },
  off: { opacity: 0.45 },
  label: { ...type.bodyBold, color: color.surface },
  labelDark: { color: color.ink },
  labelDanger: { color: color.danger },
});
