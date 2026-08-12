import { useEffect, useState } from 'react';
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

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (!household) {
    return (
      <HouseholdScreen
        pendingNfcInvite={pendingNfcInvite}
        onHouseholdReady={(nextHousehold) => {
          setPendingNfcInvite(null);
          setHousehold(nextHousehold);
        }}
      />
    );
  }

  return <ListScreen household={household} onChangeHouse={() => setHousehold(null)} />;
}
