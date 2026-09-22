import { Redirect } from 'expo-router';

// The guard in app/_layout.tsx decides where this actually lands.
export default function Index() {
  return <Redirect href="/(app)" />;
}
