import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createHousehold, joinHouseholdByNfcToken } from '../lib/shopping';
import type { Household } from '../types';

type Props = {
  pendingNfcToken: string | null;
  onHouseholdReady: (household: Household) => void;
};

export function HouseholdScreen({ pendingNfcToken, onHouseholdReady }: Props) {
  const [name, setName] = useState('Casa');
  const [token, setToken] = useState(pendingNfcToken ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(pendingNfcToken ?? '');
  }, [pendingNfcToken]);

  async function create(): Promise<void> {
    if (!name.trim()) {
      setError('Ponle un nombre a tu hogar.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onHouseholdReady(await createHousehold(name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear el hogar.');
    } finally {
      setBusy(false);
    }
  }

  async function join(): Promise<void> {
    if (!token.trim()) {
      setError('Pega el token de invitación de tu etiqueta NFC.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onHouseholdReady(await joinHouseholdByNfcToken(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'El enlace NFC no es válido.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>PRIMER PASO</Text>
        <Text style={styles.title}>¿Qué compartimos?</Text>
        <Text style={styles.subtitle}>
          Crea la lista de tu casa o entra desde una etiqueta NFC.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>NUEVO HOGAR</Text>
          <Text style={styles.cardTitle}>Empieza una lista</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej. Casa de Aman"
            placeholderTextColor="#71808a"
          />
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => void create()}
            disabled={busy}
          >
            <Text style={styles.primaryText}>{busy ? 'Preparando…' : 'Crear hogar'}</Text>
          </Pressable>
        </View>

        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.or}>O</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.joinBox}>
          <Text style={styles.cardEyebrow}>INVITACIÓN NFC</Text>
          <Text style={styles.joinTitle}>Únete a una lista existente</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            placeholder="Token de la etiqueta"
            placeholderTextColor="#71808a"
          />
          <Pressable style={styles.secondary} onPress={() => void join()} disabled={busy}>
            <Text style={styles.secondaryText}>Unirme a la lista</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color="#a7f36a" style={styles.loader} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071312' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#a7f36a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 10, color: '#f2f7f4', fontSize: 38, fontWeight: '800', letterSpacing: -1.4 },
  subtitle: { marginTop: 12, color: '#9badab', fontSize: 16, lineHeight: 23 },
  card: { marginTop: 28, padding: 18, borderRadius: 20, backgroundColor: '#10231f' },
  cardEyebrow: { color: '#718b85', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  cardTitle: { marginTop: 7, color: '#f2f7f4', fontSize: 20, fontWeight: '800' },
  joinTitle: { marginTop: 7, color: '#f2f7f4', fontSize: 18, fontWeight: '800' },
  input: {
    height: 50,
    marginTop: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#294740',
    borderRadius: 14,
    backgroundColor: '#0a1917',
    color: '#f2f7f4',
    fontSize: 15,
  },
  primary: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#a7f36a',
  },
  primaryText: { color: '#10210e', fontWeight: '800', fontSize: 15 },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#527461',
    borderRadius: 14,
  },
  secondaryText: { color: '#c1e7a3', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: '#1d3631' },
  or: { color: '#718b85', fontSize: 11, fontWeight: '800' },
  joinBox: { padding: 18, borderWidth: 1, borderColor: '#1d3631', borderRadius: 20 },
  error: { marginTop: 14, color: '#ff9d92', fontSize: 13, lineHeight: 19 },
  loader: { marginTop: 14 },
});
