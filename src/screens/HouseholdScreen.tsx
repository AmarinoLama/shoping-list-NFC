import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createHousehold, joinHouseholdByNfcToken } from '../lib/shopping';
import { COLORS } from '../lib/ui';
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

  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setToken(pendingNfcToken ?? '');
  }, [pendingNfcToken]);

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [entrance]);

  async function create(): Promise<void> {
    if (!name.trim()) {
      setError('Ponle un nombre a tu hogar 🏡');
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
      setError('Pega el token de invitación de tu etiqueta NFC 📲');
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

  const contentStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
      },
    ],
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.glow} />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.icon}>
          <Text style={styles.iconText}>🏠</Text>
        </View>
        <Text style={styles.eyebrow}>PRIMER PASO</Text>
        <Text style={styles.title}>¿Qué compartimos?</Text>
        <Text style={styles.subtitle}>
          Crea la lista de tu casa o entra desde una etiqueta NFC.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconLime}>
              <MaterialCommunityIcons name="home-plus-outline" size={20} color={COLORS.lime} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardEyebrow}>NUEVO HOGAR</Text>
              <Text style={styles.cardTitle}>Empieza una lista</Text>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej. Casa de Aman"
            placeholderTextColor={COLORS.mutedDeep}
          />
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => void create()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.bg} size="small" />
            ) : (
              <>
                <Text style={styles.primaryText}>Crear hogar</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.bg} />
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.or}>O</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.joinBox}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconCyan}>
              <MaterialCommunityIcons name="nfc-variant" size={20} color={COLORS.cyan} />
            </View>
            <View style={styles.cardCopy}>
              <Text style={styles.cardEyebrow}>INVITACIÓN NFC</Text>
              <Text style={styles.joinTitle}>Únete a una lista existente</Text>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            placeholder="Token de la etiqueta"
            placeholderTextColor={COLORS.mutedDeep}
          />
          <Pressable style={styles.secondary} onPress={() => void join()} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={COLORS.lime} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="link-variant" size={16} color={COLORS.limeDeep} />
                <Text style={styles.secondaryText}>Unirme a la lista</Text>
              </>
            )}
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  glow: {
    position: 'absolute',
    top: -150,
    left: -110,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#123c35',
    opacity: 0.5,
  },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 58,
    height: 58,
    marginBottom: 22,
    borderRadius: 18,
    backgroundColor: COLORS.panel,
    transform: [{ rotate: '-6deg' }],
  },
  iconText: { fontSize: 32 },
  eyebrow: { color: COLORS.lime, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 10, color: COLORS.text, fontSize: 38, fontWeight: '800', letterSpacing: -1.4 },
  subtitle: { marginTop: 12, color: COLORS.muted, fontSize: 16, lineHeight: 23 },
  card: { marginTop: 26, padding: 18, borderRadius: 20, backgroundColor: COLORS.panel },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIconLime: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1d3a2b',
  },
  cardIconCyan: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#143331',
  },
  cardCopy: { flex: 1 },
  cardEyebrow: { color: COLORS.mutedDeep, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  cardTitle: { marginTop: 5, color: COLORS.text, fontSize: 19, fontWeight: '800' },
  joinTitle: { marginTop: 5, color: COLORS.text, fontSize: 17, fontWeight: '800' },
  input: {
    height: 50,
    marginTop: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 14,
    backgroundColor: COLORS.panelDeep,
    color: COLORS.text,
    fontSize: 15,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: COLORS.lime,
  },
  primaryText: { color: COLORS.bg, fontWeight: '800', fontSize: 15 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3c6b52',
    borderRadius: 14,
  },
  secondaryText: { color: COLORS.limeDeep, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.line },
  or: { color: COLORS.mutedDeep, fontSize: 11, fontWeight: '800' },
  joinBox: { padding: 18, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: '#5a2b26',
    borderRadius: 12,
    backgroundColor: '#2a1613',
  },
  error: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 19 },
});
