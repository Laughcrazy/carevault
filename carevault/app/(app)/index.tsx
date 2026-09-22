import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/providers/AuthProvider';
import { color, radius, space, type } from '@/theme';

/**
 * Placeholder home. Step 2 replaces this with the profile switcher, Step 5 with
 * the health timeline.
 */
export default function Home() {
  const { user, signOut } = useAuth();

  return (
    <Screen>
      <View style={s.head}>
        <Text style={s.title}>Your vault</Text>
        <Text style={s.lede}>Signed in as {user?.email}</Text>
      </View>

      <View style={s.empty}>
        <Text style={s.emptyTitle}>Nothing here yet</Text>
        <Text style={s.emptyBody}>
          Snap a prescription or a lab result and it'll appear on your timeline, sorted by date.
        </Text>
      </View>

      <Button label="Sign out" variant="quiet" onPress={signOut} style={s.signOut} />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { gap: space(1.5), paddingTop: space(4) },
  title: { ...type.display, color: color.ink },
  lede: { ...type.small, color: color.slate },
  empty: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.lg,
    padding: space(6),
    gap: space(2),
  },
  emptyTitle: { ...type.title, color: color.ink },
  emptyBody: { ...type.body, color: color.slate },
  signOut: { marginTop: 'auto' },
});
