import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/providers/AuthProvider';
import { color, space, type } from '@/theme';

export default function SignIn() {
  const { signInWithPassword, sendMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'link' | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  async function run(kind: 'password' | 'link') {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'password') await signInWithPassword(email, password);
      else {
        await sendMagicLink(email);
        setLinkSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={s.head}>
        <Text style={s.wordmark}>CareVault</Text>
        <Text style={s.lede}>
          Every prescription, lab result and doctor's note you've ever been given, in one place you
          control.
        </Text>
      </View>

      <View style={s.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => run('password')}
          returnKeyType="go"
        />

        {!!error && <Text style={s.error}>{error}</Text>}
        {linkSent && <Text style={s.notice}>Check {email} for a sign-in link. It works once, for 15 minutes.</Text>}

        <Button label="Sign in" onPress={() => run('password')} busy={busy === 'password'} disabled={!email || !password} />
        <Button
          label="Email me a link instead"
          variant="quiet"
          onPress={() => run('link')}
          busy={busy === 'link'}
          disabled={!email}
        />
      </View>

      <View style={s.foot}>
        <Text style={s.footText}>New here? </Text>
        <Link href="/(auth)/sign-up" style={s.footLink}>Create an account</Link>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { gap: space(2), paddingTop: space(10), paddingBottom: space(4) },
  wordmark: { ...type.display, color: color.ink },
  lede: { ...type.body, color: color.slate, maxWidth: 380 },
  form: { gap: space(4) },
  error: { ...type.small, color: color.danger },
  notice: { ...type.small, color: color.ink, backgroundColor: color.leafSoft, padding: space(3), borderRadius: 10 },
  foot: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: space(6) },
  footText: { ...type.body, color: color.slate },
  footLink: { ...type.bodyBold, color: color.leaf },
});
