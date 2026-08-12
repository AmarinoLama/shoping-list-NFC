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
import { getAppBaseUrl } from '../lib/app-url';
import { supabase } from '../lib/supabase';
import { COLORS } from '../lib/ui';

function friendlyError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Email o contraseña incorrectos. Revisa e inténtalo otra vez.';
  if (message.includes('Email not confirmed')) return 'Tu email aún no está confirmado. Abre el enlace que te enviamos (revisa también el spam).';
  if (message.includes('already registered')) return 'Ya existe una cuenta con ese email. Prueba a iniciar sesión.';
  if (message.includes('at least 6 characters')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (message.includes('rate limit') || message.toLowerCase().includes('too many')) return 'Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.';
  return message;
}

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const hasConfirm = isSignUp;
  const confirmMismatch = hasConfirm && confirm.length > 0 && confirm !== password;
  const strength = password.length >= 8 ? 3 : password.length >= 4 ? 2 : password.length > 0 ? 1 : 0;

  async function submit(): Promise<void> {
    setError(null);
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Escribe un email válido.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (hasConfirm && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            // El enlace de confirmación vuelve a la URL real donde corre la app.
            emailRedirectTo: `${getAppBaseUrl()}/`,
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          // Confirmación de email desactivada: ya hay sesión.
          setMessage('Cuenta creada. Vamos a preparar tu lista 🛒');
        } else {
          // Supabase pide confirmar el email: avisamos y dejamos todo
          // listo para entrar justo después de confirmar.
          setMessage('🎉 Cuenta creada. Te hemos enviado un email de confirmación: pulsa el enlace y vuelve aquí para entrar.');
          setIsSignUp(false);
          setPassword('');
          setConfirm('');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.'));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(): void {
    setIsSignUp((value) => !value);
    setPassword('');
    setConfirm('');
    setError(null);
    setMessage(null);
  }

  const contentStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <FloatingEmoji emoji="🛒" delay={0} style={styles.floatCart} />
      <FloatingEmoji emoji="🧾" delay={900} style={styles.floatReceipt} />
      <FloatingEmoji emoji="🥑" delay={1700} style={styles.floatAvocado} />

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="cart-outline" size={26} color={COLORS.bg} />
          </View>
          <View>
            <Text style={styles.eyebrow}>LISTA DE CASA</Text>
            <Text style={styles.brandSub}>Compras en equipo</Text>
          </View>
        </View>

        <Text style={styles.title}>La compra,{'\n'}</Text>
        <Text style={styles.titleAccent}>sin olvidos. 🧺</Text>
        <Text style={styles.subtitle}>
          Una lista compartida, siempre al día y a un toque de tu NFC.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <View style={styles.field}>
            <MaterialCommunityIcons name="email-outline" size={18} color={COLORS.mutedDeep} style={styles.fieldIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="tu@email.com"
              placeholderTextColor={COLORS.mutedDeep}
            />
          </View>

          <Text style={styles.label}>
            CONTRASEÑA{isSignUp ? ' (mínimo 6 caracteres)' : ''}
          </Text>
          <View style={styles.field}>
            <MaterialCommunityIcons name="lock-outline" size={18} color={COLORS.mutedDeep} style={styles.fieldIcon} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
              placeholderTextColor={COLORS.mutedDeep}
            />
            <Pressable
              onPress={() => setShowPassword((value) => !value)}
              hitSlop={10}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={COLORS.muted}
              />
            </Pressable>
          </View>

          {isSignUp ? (
            <>
              <Text style={styles.label}>REPITE LA CONTRASEÑA</Text>
              <View style={[styles.field, confirmMismatch && styles.fieldError]}>
                <MaterialCommunityIcons name="lock-check-outline" size={18} color={COLORS.mutedDeep} style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showConfirm}
                  placeholder="Confirma tu contraseña"
                  placeholderTextColor={COLORS.mutedDeep}
                />
                <Pressable
                  onPress={() => setShowConfirm((value) => !value)}
                  hitSlop={10}
                  style={styles.eyeButton}
                  accessibilityLabel={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <MaterialCommunityIcons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>
              {confirm.length > 0 ? (
                <View style={styles.hintRow}>
                  <MaterialCommunityIcons
                    name={confirmMismatch ? 'close-circle-outline' : 'check-circle-outline'}
                    size={14}
                    color={confirmMismatch ? COLORS.danger : COLORS.lime}
                  />
                  <Text style={[styles.hintText, { color: confirmMismatch ? COLORS.danger : COLORS.lime }]}>
                    {confirmMismatch ? 'No coinciden todavía' : '¡Perfecto, coinciden!'}
                  </Text>
                </View>
              ) : null}
              {password.length > 0 ? (
                <View style={styles.hintRow}>
                  <Text style={styles.strengthText}>Seguridad</Text>
                  <View style={styles.strengthDots}>
                    {[1, 2, 3].map((level) => (
                      <View
                        key={level}
                        style={[
                          styles.strengthDot,
                          level <= strength && { backgroundColor: strength === 1 ? COLORS.amber : COLORS.lime },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {error ? (
            <View style={styles.bannerError}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}
          {message ? (
            <View style={styles.bannerMessage}>
              <MaterialCommunityIcons name="email-check-outline" size={16} color={COLORS.lime} />
              <Text style={styles.message}>{message}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
            onPress={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  {isSignUp ? 'Crear cuenta' : 'Entrar'}
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={20}
                  color={COLORS.bg}
                  style={styles.buttonArrow}
                />
              </>
            )}
          </Pressable>
        </View>

        <Pressable onPress={switchMode} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {isSignUp ? '¿Ya tienes cuenta? ' : '¿Primera vez aquí? '}
            <Text style={styles.switchAccent}>{isSignUp ? 'Entrar' : 'Crear cuenta'}</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function FloatingEmoji({
  emoji,
  delay,
  style,
}: {
  emoji: string;
  delay: number;
  style: object;
}) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -12, duration: 1500, delay, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y, delay]);

  return (
    <Animated.View style={[styles.floatEmoji, style, { transform: [{ translateY: y }] }]}>
      <Text style={styles.floatEmojiText}>{emoji}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  glowTop: {
    position: 'absolute',
    top: -140,
    right: -100,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: '#123c35',
    opacity: 0.55,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -160,
    left: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#2c4a1f',
    opacity: 0.3,
  },
  floatEmoji: { position: 'absolute', opacity: 0.16 },
  floatEmojiText: { fontSize: 34 },
  floatCart: { top: '16%', left: '6%' },
  floatReceipt: { top: '64%', right: '8%' },
  floatAvocado: { top: '82%', left: '12%' },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 26 },
  brandMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
    transform: [{ rotate: '-8deg' }],
  },
  brandSub: { marginTop: 3, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  eyebrow: {
    color: COLORS.lime,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  title: { color: COLORS.text, fontSize: 40, fontWeight: '800', letterSpacing: -1.8, lineHeight: 43 },
  titleAccent: {
    color: COLORS.lime,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 43,
  },
  subtitle: { maxWidth: 310, marginTop: 12, color: COLORS.muted, fontSize: 16, lineHeight: 24 },
  form: { marginTop: 30 },
  label: {
    color: COLORS.mutedDeep,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 15,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 15,
    backgroundColor: COLORS.panel,
  },
  fieldError: { borderColor: COLORS.danger },
  fieldIcon: { marginLeft: 14 },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  eyeButton: { paddingHorizontal: 14 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, marginLeft: 4 },
  hintText: { fontSize: 12, fontWeight: '700' },
  strengthText: { color: COLORS.mutedDeep, fontSize: 11, fontWeight: '700' },
  strengthDots: { flexDirection: 'row', gap: 4, marginLeft: 6 },
  strengthDot: {
    width: 20,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.line,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: '#5a2b26',
    borderRadius: 12,
    backgroundColor: '#2a1613',
  },
  error: { flex: 1, color: COLORS.danger, fontSize: 13, lineHeight: 19 },
  bannerMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: '#2c4a1f',
    borderRadius: 12,
    backgroundColor: '#13230d',
  },
  message: { flex: 1, color: COLORS.limeDeep, fontSize: 13, lineHeight: 19 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
  },
  primaryPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  primaryButtonText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
  buttonArrow: { marginTop: 1 },
  switchButton: { alignSelf: 'center', marginTop: 22, padding: 8 },
  switchText: { color: COLORS.muted, fontSize: 14 },
  switchAccent: { color: COLORS.lime, fontWeight: '800' },
});
