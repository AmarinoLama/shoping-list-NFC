import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Easing, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { AuthScreen } from './src/screens/AuthScreen';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { ListScreen } from './src/screens/ListScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { getMyHouseholds, joinHouseholdByNfcToken, parseNfcToken } from './src/lib/shopping';
import { isSupabaseConfigured, supabase } from './src/lib/supabase';
import type { Household } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [pendingNfcToken, setPendingNfcToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setHousehold(null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function handleUrl(url: string | null): Promise<void> {
      const token = parseNfcToken(url);
      if (token) {
        setPendingNfcToken(token);
        setHousehold(null);
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    setBootstrapping(true);

    async function bootstrapHousehold(): Promise<void> {
      try {
        if (pendingNfcToken) {
          const joined = await joinHouseholdByNfcToken(pendingNfcToken);
          if (mounted) {
            setHousehold(joined);
            setPendingNfcToken(null);
          }
          return;
        }
        const households = await getMyHouseholds();
        if (mounted && households[0]) setHousehold(households[0]);
      } catch {
        // HouseholdScreen exposes the actionable create/join flow if the user
        // has no household yet or a pending NFC token needs manual retry.
      } finally {
        if (mounted) setBootstrapping(false);
      }
    }

    void bootstrapHousehold();
    return () => {
      mounted = false;
    };
  }, [session, pendingNfcToken]);

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (bootstrapping && !household) return <LoadingScreen label="Abriendo tu lista…" />;
  if (!household) {
    return <HouseholdScreen pendingNfcToken={pendingNfcToken} onHouseholdReady={setHousehold} />;
  }

  return (
    <ListScreen
      household={household}
      userId={session.user.id}
      onSignOut={() => void supabase.auth.signOut()}
    />
  );
}

function LoadingScreen({ label = 'Cargando…' }: { label?: string }) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 550,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  return (
    <View style={styles.loading}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.loadingMark,
          {
            transform: [
              {
                translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.loadingMarkText}>🛒</Text>
      </Animated.View>
      <ActivityIndicator color="#a7f36a" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#071312',
  },
  loadingMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: '#a7f36a',
    transform: [{ rotate: '-6deg' }],
  },
  loadingMarkText: { fontSize: 32 },
  loadingText: { color: '#9badab', fontSize: 14 },
});
