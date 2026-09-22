import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, space } from '@/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: insets.top + space(4),
    paddingBottom: insets.bottom + space(6),
    paddingHorizontal: space(5),
  };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[s.content, pad]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.content, pad, s.flex]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={[s.flex, s.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  bg: { backgroundColor: color.paper },
  content: { flexGrow: 1, gap: space(4) },
});
