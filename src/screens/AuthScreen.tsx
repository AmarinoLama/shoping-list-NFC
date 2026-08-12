import { useState } from 'react';
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
import { getAppBaseUrl } from '../lib/app-url';
import { supabase } from '../lib/supabase';

export function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    setMessage(null);
    if (!email.trim() || password.length < 6) {
      setError('Escribe un email y una contraseña de al menos 6 caracteres.');
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            // El enlace de confirmación vuelve a la URL real donde corre la app.
            emailRedirectTo: `${getAppBaseUrl()}/`,
          },
        });
        if (signUpError) throw signUpError;
        setMessage(
          data.session
            ? 'Cuenta creada. Vamos a preparar tu lista.'
            : 'Cuenta creada. Revisa tu email para confirmar el acceso.',
        );
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.');
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
      <View style={styles.glowTop} />
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>✓</Text>
        </View>
        <Text style={styles.eyebrow}>LISTA DE CASA</Text>
        <Text style={styles.title}>Compra juntos,</Text>
        <Text style={styles.titleAccent}>sin olvidos.</Text>
        <Text style={styles.subtitle}>
          Una lista compartida, siempre al día y a un toque de tu NFC.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="tu@email.com"
            placeholderTextColor="#71808a"
          />
          <Text style={styles.label}>CONTRASEÑA</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#71808a"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#071312" />
            ) : (
              <Text style={styles.primaryButtonText}>{isSignUp ? 'Crear cuenta' : 'Entrar'}</Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => setIsSignUp((value) => !value)} style={styles.switchButton}>
          <Text style={styles.switchText}>
            {isSignUp ? '¿Ya tienes cuenta? ' : '¿Primera vez aquí? '}
            <Text style={styles.switchAccent}>{isSignUp ? 'Entrar' : 'Crear cuenta'}</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071312' },
  glowTop: {
    position: 'absolute',
    top: -140,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#123c35',
    opacity: 0.55,
  },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  brandMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    marginBottom: 22,
    borderRadius: 16,
    backgroundColor: '#a7f36a',
    transform: [{ rotate: '-8deg' }],
  },
  brandMarkText: {
    color: '#10210e',
    fontSize: 26,
    fontWeight: '900',
    transform: [{ rotate: '8deg' }],
  },
  eyebrow: {
    color: '#a7f36a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 10,
  },
  title: { color: '#f2f7f4', fontSize: 42, fontWeight: '800', letterSpacing: -1.8, lineHeight: 44 },
  titleAccent: {
    color: '#a7f36a',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.8,
    lineHeight: 44,
  },
  subtitle: { maxWidth: 310, marginTop: 14, color: '#9badab', fontSize: 16, lineHeight: 24 },
  form: { marginTop: 34 },
  label: {
    color: '#718b85',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    height: 54,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#26433d',
    borderRadius: 15,
    backgroundColor: '#10231f',
    color: '#f2f7f4',
    fontSize: 16,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#a7f36a',
  },
  primaryButtonText: { color: '#10210e', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  error: { marginTop: 12, color: '#ff9d92', fontSize: 13, lineHeight: 19 },
  message: { marginTop: 12, color: '#a7f36a', fontSize: 13, lineHeight: 19 },
  switchButton: { alignSelf: 'center', marginTop: 24, padding: 8 },
  switchText: { color: '#9badab', fontSize: 14 },
  switchAccent: { color: '#a7f36a', fontWeight: '800' },
});
