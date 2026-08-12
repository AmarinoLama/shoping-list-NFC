import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { ListScreen } from './src/screens/ListScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { parseNfcInvite, type NfcInvite } from './src/lib/shopping';
import { isSupabaseConfigured } from './src/lib/supabase';
import type { Household } from './src/types';

export default function App() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [pendingNfcInvite, setPendingNfcInvite] = useState<NfcInvite | null>(null);

  useEffect(() => {
    async function handleUrl(url: string | null): Promise<void> {
      const invite = parseNfcInvite(url);
      if (invite) {
        setPendingNfcInvite(invite);
        setHousehold(null);
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => subscription.remove();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.appRoot}>
        <SetupScreen />
      </View>
    );
  }
  if (!household) {
    return (
      <View style={styles.appRoot}>
        <HouseholdScreen
          pendingNfcInvite={pendingNfcInvite}
          onHouseholdReady={(nextHousehold) => {
            setPendingNfcInvite(null);
            setHousehold(nextHousehold);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <ListScreen household={household} onChangeHouse={() => setHousehold(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, minHeight: '100%', backgroundColor: '#071312' },
});
