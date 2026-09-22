import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, HIT, radius, space, type } from '@/theme';

type Props = TextInputProps & { label: string; hint?: string; error?: string };

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, style, ...rest },
  ref,
) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={color.slate}
        style={[s.input, !!error && s.inputError, style]}
        accessibilityLabel={label}
        {...rest}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
      {!error && !!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { gap: space(1.5) },
  label: { ...type.small, color: color.slate },
  input: {
    minHeight: HIT,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    ...type.body,
    color: color.ink,
  },
  inputError: { borderColor: color.danger },
  error: { ...type.small, color: color.danger },
  hint: { ...type.small, color: color.slate },
});
