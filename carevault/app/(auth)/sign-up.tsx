import { useState } from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/providers/AuthProvider';
import { color, space, type } from '@/theme';

const MIN_PASSWORD = 10;

export default function SignUp() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <View style={s.head}>
          <Text style={s.title}>Confirm your email</Text>
          <Text style={s.lede}>
            We sent a confirmation link to {email}. Open it on this phone and you'll land straight in
            your vault.
          </Text>
        </View>
        <Link href="/(auth)/sign-in" style={s.footLink}>Back to sign in</Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={s.head}>
        <Text style={s.title}>Create your vault</Text>
        <Text style={s.lede}>
          Your records are yours. You decide which doctor sees them and for how long.
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
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={tooShort ? `Use at least ${MIN_PASSWORD} characters.` : undefined}
        />

        {!!error && <Text style={s.error}>{error}</Text>}

        <Button
          label="Create account"
          onPress={submit}
          busy={busy}
          disabled={!email || password.length < MIN_PASSWORD}
        />
        <Text style={s.legal}>
          By continuing you agree to the Terms and the Privacy Notice, and you consent to CareVault
          processing your health data to organise it for you. You can export or delete everything at
          any time.
        </Text>
      </View>

      <View style={s.foot}>
        <Text style={s.footText}>Already have a vault? </Text>
        <Link href="/(auth)/sign-in" style={s.footLink}>Sign in</Link>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { gap: space(2), paddingTop: space(8), paddingBottom: space(2) },
  title: { ...type.display, color: color.ink },
  lede: { ...type.body, color: color.slate, maxWidth: 380 },
  form: { gap: space(4) },
  error: { ...type.small, color: color.danger },
  legal: { ...type.small, color: color.slate },
  foot: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: space(6) },
  footText: { ...type.body, color: color.slate },
  footLink: { ...type.bodyBold, color: color.leaf },
});
