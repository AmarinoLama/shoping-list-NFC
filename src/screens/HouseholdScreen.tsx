import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AccessScreen } from './AccessScreen';
import {
  hasStoredHouseholdAuthorization,
  HOUSEHOLD_AUTHORIZATION_PASSWORD,
  rememberHouseholdAuthorization,
} from '../lib/authorization';
import {
  createHousehold,
  getMyHouseholds,
  getNfcInviteUrl,
  isNfcBaseUrlConfigured,
  joinHouseholdByNfcToken,
  parseNfcInvite,
  type NfcInvite,
} from '../lib/shopping';
import { COLORS } from '../lib/ui';
import type { Household } from '../types';

type Props = {
  pendingNfcInvite: NfcInvite | null;
  onHouseholdReady: (household: Household) => void;
};

type AccessAction =
  | { type: 'open'; household: Household }
  | { type: 'create' }
  | { type: 'join'; token: string };

export function HouseholdScreen({ pendingNfcInvite, onHouseholdReady }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [households, setHouseholds] = useState<Household[]>([]);
  const [token, setToken] = useState(pendingNfcInvite?.token ?? '');
  const [name, setName] = useState('');
  const [accessAction, setAccessAction] = useState<AccessAction | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedHouseholdId, setCopiedHouseholdId] = useState<string | null>(null);
  const [authorizationGranted, setAuthorizationGranted] = useState<boolean | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const autoJoinAttempted = useRef(false);

  useEffect(() => {
    setToken(pendingNfcInvite?.token ?? '');
  }, [pendingNfcInvite]);

  useEffect(() => {
    let mounted = true;
    void hasStoredHouseholdAuthorization().then((stored) => {
      if (mounted) setAuthorizationGranted(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    void loadHouseholds();
  }, [entrance]);

  useEffect(() => {
    if (!pendingNfcInvite || authorizationGranted === null || autoJoinAttempted.current) return;
    const linkAuthorized = pendingNfcInvite.authorizationPassword === HOUSEHOLD_AUTHORIZATION_PASSWORD;
    if (!authorizationGranted && !linkAuthorized) {
      autoJoinAttempted.current = true;
      setError('La autorización de la etiqueta no es válida.');
      return;
    }
    autoJoinAttempted.current = true;
    setBusy(true);
    void rememberHouseholdAuthorization()
      .then(() => joinHouseholdByNfcToken(pendingNfcInvite.token))
      .then(onHouseholdReady)
      .catch((caught: unknown) => {
        setError(friendlyHouseholdError(caught, 'No se pudo abrir la casa desde la etiqueta.'));
      })
      .finally(() => setBusy(false));
  }, [pendingNfcInvite, authorizationGranted, onHouseholdReady]);

  async function loadHouseholds(): Promise<void> {
    setLoading(true);
    try {
      setHouseholds(await getMyHouseholds());
      setError(null);
    } catch (caught) {
      setError(friendlyHouseholdError(caught, 'No se pudieron cargar tus casas.'));
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess(action: AccessAction): Promise<void> {
    setError(null);
    const authorized = authorizationGranted ?? (await hasStoredHouseholdAuthorization());
    setAuthorizationGranted(authorized);
    if (authorized) void continueAfterAuthorization(action);
    else setAccessAction(action);
  }

  function requestCreate(): void {
    void requestAccess({ type: 'create' });
  }

  function requestJoin(): void {
    if (!token.trim()) {
      setError('Pega el enlace o token de invitación de tu casa.');
      return;
    }
    setError(null);
    const invitation = parseNfcInvite(token.trim());
    void requestAccess({ type: 'join', token: invitation?.token ?? token.trim() });
  }

  async function continueAfterAuthorization(action: AccessAction | null = accessAction): Promise<void> {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await rememberHouseholdAuthorization();
      setAuthorizationGranted(true);
      if (action.type === 'open') {
        onHouseholdReady(action.household);
      } else if (action.type === 'join') {
        onHouseholdReady(await joinHouseholdByNfcToken(action.token));
      } else {
        setShowCreateForm(true);
        setAccessAction(null);
      }
    } catch (caught) {
      setAccessAction(null);
      setError(friendlyHouseholdError(caught, 'No se pudo abrir esta casa.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyNfcLink(household: Household): Promise<void> {
    await Clipboard.setStringAsync(getNfcInviteUrl(household.nfc_token));
    setCopiedHouseholdId(household.id);
    setTimeout(() => setCopiedHouseholdId(null), 1800);
  }

  async function shareNfcLink(household: Household): Promise<void> {
    const url = getNfcInviteUrl(household.nfc_token);
    await Share.share({
      title: `Etiqueta de ${household.name}`,
      message: `Abre directamente ${household.name} escaneando esta etiqueta: ${url}`,
      url,
    });
  }

  async function create(): Promise<void> {
    if (!name.trim()) {
      setError('Ponle un nombre a tu casa 🏡');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onHouseholdReady(await createHousehold(name));
    } catch (caught) {
      setError(friendlyHouseholdError(caught, 'No se pudo crear la casa.'));
    } finally {
      setBusy(false);
    }
  }

  if (accessAction) {
    const isCreate = accessAction.type === 'create';
    const isJoin = accessAction.type === 'join';
    return (
      <AccessScreen
        title={isCreate ? 'Crear una casa' : isJoin ? 'Unirte a una casa' : accessAction.household.name}
        subtitle={
          isCreate
            ? 'Introduce la contraseña para continuar al formulario de nueva casa.'
            : isJoin
              ? 'Necesitamos confirmar que tienes permiso para entrar.'
              : 'Introduce la contraseña para entrar en esta casa compartida.'
        }
        onAuthorized={() => void continueAfterAuthorization()}
        onCancel={() => {
          setAccessAction(null);
          setError(null);
        }}
        busy={busy}
      />
    );
  }

  if (showCreateForm) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <StatusBar style="light" />
        <View style={styles.glow} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.content, compact && styles.contentCompact]}>
            <Pressable style={styles.backButton} onPress={() => setShowCreateForm(false)}>
              <MaterialCommunityIcons name="arrow-left" size={17} color={COLORS.muted} />
              <Text style={styles.backText}>Volver a casas</Text>
            </Pressable>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="home-plus-outline" size={31} color={COLORS.lime} />
            </View>
            <Text style={styles.eyebrow}>NUEVA CASA</Text>
            <Text style={[styles.title, compact && styles.titleCompact]}>Ponle nombre a tu casa</Text>
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>Crea un espacio compartido para organizar la compra juntos.</Text>
            <View style={styles.formCard}>
              <Text style={styles.label}>NOMBRE DE LA CASA</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                autoFocus
                placeholder="Ej. Casa de la playa"
                placeholderTextColor={COLORS.mutedDeep}
                onSubmitEditing={() => void create()}
                returnKeyType="done"
              />
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => void create()}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color={COLORS.bg} /> : <>
                  <Text style={styles.primaryText}>Crear casa</Text>
                  <MaterialCommunityIcons name="arrow-right" size={19} color={COLORS.bg} />
                </>}
              </Pressable>
            </View>
            {error ? <ErrorBox message={error} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const contentStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <StatusBar style="light" />
      <View style={styles.glow} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, compact && styles.contentCompact, contentStyle]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <MaterialCommunityIcons name="home-heart" size={28} color={COLORS.bg} />
            </View>
            <View>
              <Text style={styles.eyebrow}>LISTA DE CASA</Text>
              <Text style={styles.brandSub}>Tus espacios compartidos</Text>
            </View>
          </View>
          <Text style={[styles.title, compact && styles.titleCompact]}>Elige tu casa</Text>
          <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>Selecciona una casa para entrar o crea una nueva. Siempre te pediremos autorización.</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={COLORS.lime} />
              <Text style={styles.loadingText}>Cargando tus casas…</Text>
            </View>
          ) : households.length ? (
            <View style={styles.houseList}>
              <Text style={styles.sectionLabel}>TUS CASAS · {households.length}</Text>
              {households.map((household, index) => (
                <AnimatedHouseholdCard key={household.id} delay={index * 75}>
                <View style={styles.houseCard}>
                  <View style={[styles.houseRow, compact && styles.houseRowCompact]}>
                    <Pressable
                      style={({ pressed }) => [styles.houseMain, compact && styles.houseMainCompact, pressed && styles.housePressed]}
                      onPress={() => void requestAccess({ type: 'open', household })}
                      accessibilityRole="button"
                      accessibilityLabel={`Entrar en ${household.name}`}
                    >
                      <View style={[styles.houseIcon, compact && styles.houseIconCompact]}>
                        <MaterialCommunityIcons name="home-variant-outline" size={23} color={COLORS.lime} />
                      </View>
                      <View style={styles.houseCopy}>
                        <Text style={styles.houseName} numberOfLines={1}>{household.name}</Text>
                        <Text style={styles.houseMeta}>Lista compartida · Acceso protegido</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={23} color={COLORS.mutedDeep} />
                    </Pressable>
                    <Pressable
                      style={[styles.nfcAction, compact && styles.nfcActionCompact]}
                      onPress={() => void shareNfcLink(household)}
                      accessibilityLabel={`Compartir etiqueta de ${household.name}`}
                    >
                      <MaterialCommunityIcons name="share-variant" size={16} color={COLORS.lime} />
                    </Pressable>
                    <Pressable
                      style={[styles.nfcAction, compact && styles.nfcActionCompact]}
                      onPress={() => void copyNfcLink(household)}
                      accessibilityLabel={`Copiar ruta de ${household.name}`}
                    >
                      <MaterialCommunityIcons
                        name={copiedHouseholdId === household.id ? 'check-circle' : 'content-copy'}
                        size={16}
                        color={copiedHouseholdId === household.id ? COLORS.lime : COLORS.muted}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.nfcCard}>
                  <View style={styles.nfcTop}>
                    <View style={styles.nfcIcon}>
                      <MaterialCommunityIcons name="nfc-variant" size={19} color={COLORS.cyan} />
                    </View>
                    <View style={styles.nfcCopy}>
                      <Text style={styles.nfcTitle}>Etiqueta para {household.name}</Text>
                      <Text style={styles.nfcSubtitle}>
                        {isNfcBaseUrlConfigured ? 'Escanéala para abrir esta casa directamente.' : 'Ruta local; configura un dominio estable para producción.'}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.nfcUrl}>
                    {getNfcInviteUrl(household.nfc_token)}
                  </Text>
                  </View>
                </View>
                </AnimatedHouseholdCard>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MaterialCommunityIcons name="home-search-outline" size={28} color={COLORS.cyan} />
              </View>
              <Text style={styles.emptyTitle}>Todavía no tienes casas</Text>
              <Text style={styles.emptyText}>Crea la primera y empieza a compartir tu lista.</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
            onPress={requestCreate}
          >
            <MaterialCommunityIcons name="plus" size={21} color={COLORS.bg} />
            <Text style={styles.primaryText}>Crear una casa</Text>
          </Pressable>

          <View style={styles.joinBox}>
            <View style={styles.joinHeader}>
              <View style={styles.joinIcon}>
                <MaterialCommunityIcons name="nfc-variant" size={21} color={COLORS.cyan} />
              </View>
              <View style={styles.houseCopy}>
                <Text style={styles.joinTitle}>¿Tienes una invitación?</Text>
                <Text style={styles.joinSubtitle}>Escanea una etiqueta o pega aquí su enlace.</Text>
              </View>
            </View>
            <View style={styles.joinHelp}>
              <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.cyan} />
              <View style={styles.joinHelpCopy}>
                <Text style={styles.joinHelpTitle}>¿Cómo funciona?</Text>
                <Text style={styles.joinHelpText}>
                  Una persona que ya está dentro de la casa puede pulsar compartir para enviarte el enlace o copiarlo para usarlo en una etiqueta NFC.
                </Text>
                <Text style={styles.joinHelpText}>
                  Si escaneas la etiqueta, la casa se abre directamente. Si recibes un enlace, pégalo completo aquí o introduce solo el token.
                </Text>
                <Text style={styles.joinHelpText}>
                  La primera vez se te pedirá autorización; después quedará guardada en este dispositivo.
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Token de invitación"
              placeholderTextColor={COLORS.mutedDeep}
            />
            <Pressable style={styles.secondary} onPress={requestJoin}>
              <MaterialCommunityIcons name="link-variant" size={17} color={COLORS.limeDeep} />
              <Text style={styles.secondaryText}>Continuar con invitación</Text>
            </Pressable>
          </View>
          {error ? <ErrorBox message={error} /> : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AnimatedHouseholdCard({ children, delay }: { children: React.ReactNode; delay: number }) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      delay,
      duration: 430,
      useNativeDriver: true,
    }).start();
  }, [delay, entrance]);

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function friendlyHouseholdError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : String(caught ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('you must be signed in') || normalized.includes('jwt') || normalized.includes('auth')) {
    return 'Supabase sigue usando el flujo antiguo con usuarios. Ejecuta la migración 202608120005_anonymous_house_flow.sql en el SQL Editor y vuelve a probar.';
  }
  if (normalized.includes('pgrst202') || normalized.includes('could not find the function')) {
    return 'Falta la función anónima de casas en Supabase. Ejecuta la migración 202608120005_anonymous_house_flow.sql.';
  }
  if (normalized.includes('permission denied') || normalized.includes('row-level security') || normalized.includes('rls')) {
    return 'Supabase ha bloqueado la operación. Ejecuta la migración 202608120005_anonymous_house_flow.sql para actualizar los permisos.';
  }
  return message || fallback;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
      <Text style={styles.error}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  glow: {
    position: 'absolute',
    top: -160,
    left: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: '#123c35',
    opacity: 0.52,
  },
  scroll: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { flexGrow: 1, paddingVertical: 28, paddingHorizontal: 20, backgroundColor: COLORS.bg },
  scrollContentCompact: { paddingVertical: 20, paddingHorizontal: 14 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingVertical: 8 },
  contentCompact: { maxWidth: 420, paddingVertical: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 28 },
  brandMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: COLORS.lime,
    transform: [{ rotate: '-7deg' }],
  },
  brandSub: { marginTop: 3, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  eyebrow: { color: COLORS.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 10, color: COLORS.text, fontSize: 38, fontWeight: '800', letterSpacing: -1.4 },
  titleCompact: { fontSize: 31, lineHeight: 36, letterSpacing: -1 },
  subtitle: { marginTop: 12, color: COLORS.muted, fontSize: 16, lineHeight: 23 },
  subtitleCompact: { fontSize: 14, lineHeight: 20 },
  sectionLabel: { color: COLORS.mutedDeep, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 9 },
  houseList: { marginTop: 25 },
  houseCard: {
    marginBottom: 9,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 18,
    backgroundColor: COLORS.panel,
    overflow: 'hidden',
  },
  houseRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 76, padding: 13 },
  houseRowCompact: { padding: 10, gap: 5 },
  houseMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, paddingVertical: 4, borderRadius: 12 },
  houseMainCompact: { gap: 8 },
  housePressed: { backgroundColor: '#173127', opacity: 0.84 },
  houseIcon: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 14, backgroundColor: '#1d3a2b' },
  houseIconCompact: { width: 42, height: 42, borderRadius: 13 },
  houseCopy: { flex: 1 },
  houseName: { color: COLORS.textSoft, fontSize: 17, fontWeight: '800' },
  houseMeta: { marginTop: 4, color: COLORS.mutedDeep, fontSize: 11 },
  loadingBox: { alignItems: 'center', gap: 11, marginTop: 46 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  emptyCard: { alignItems: 'center', marginTop: 25, padding: 25, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, backgroundColor: COLORS.panel },
  emptyIcon: { alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 18, backgroundColor: '#143331' },
  emptyTitle: { marginTop: 13, color: COLORS.textSoft, fontSize: 17, fontWeight: '800' },
  emptyText: { marginTop: 5, color: COLORS.muted, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  createButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 54, marginTop: 16, borderRadius: 16, backgroundColor: COLORS.lime },
  primaryText: { color: COLORS.bg, fontSize: 15, fontWeight: '800' },
  nfcCard: { marginTop: 0, padding: 11, borderTopWidth: 1, borderTopColor: '#2a5142', backgroundColor: '#0d1e1a' },
  nfcTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nfcIcon: { alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, backgroundColor: '#143331' },
  nfcCopy: { flex: 1 },
  nfcTitle: { color: COLORS.textSoft, fontSize: 12, fontWeight: '800' },
  nfcSubtitle: { marginTop: 2, color: COLORS.mutedDeep, fontSize: 10, lineHeight: 14 },
  nfcAction: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.panel },
  nfcActionCompact: { width: 29, height: 29, borderRadius: 9 },
  nfcUrl: { marginTop: 8, color: COLORS.mutedDeep, fontSize: 9 },
  joinBox: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: COLORS.line, borderRadius: 19, backgroundColor: 'rgba(16,35,31,0.6)' },
  joinHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  joinIcon: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 13, backgroundColor: '#143331' },
  joinTitle: { color: COLORS.textSoft, fontSize: 15, fontWeight: '800' },
  joinSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 12 },
  joinHelp: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 15, padding: 11, borderRadius: 13, backgroundColor: '#12302d' },
  joinHelpCopy: { flex: 1, gap: 7 },
  joinHelpTitle: { color: COLORS.textSoft, fontSize: 12, fontWeight: '800' },
  joinHelpText: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  input: { height: 52, marginTop: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.lineSoft, borderRadius: 14, backgroundColor: COLORS.panelDeep, color: COLORS.text, fontSize: 15 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, marginTop: 11, borderWidth: 1, borderColor: '#3c6b52', borderRadius: 14 },
  secondaryText: { color: COLORS.limeDeep, fontSize: 14, fontWeight: '800' },
  formCard: { marginTop: 28, padding: 18, borderRadius: 20, backgroundColor: COLORS.panel },
  heroIcon: { alignItems: 'center', justifyContent: 'center', width: 62, height: 62, marginBottom: 22, borderRadius: 20, backgroundColor: '#173a32', transform: [{ rotate: '-6deg' }] },
  label: { color: COLORS.mutedDeep, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, marginTop: 12, borderRadius: 14, backgroundColor: COLORS.lime },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 5, marginBottom: 28 },
  backText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: 11, borderWidth: 1, borderColor: '#5a2b26', borderRadius: 12, backgroundColor: '#2a1613' },
  error: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 19 },
});
