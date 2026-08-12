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
import { HOUSEHOLD_AUTHORIZATION_PASSWORD } from '../lib/authorization';
import { COLORS } from '../lib/ui';

export { HOUSEHOLD_AUTHORIZATION_PASSWORD };

type Props = {
  title: string;
  subtitle: string;
  onAuthorized: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function AccessScreen({ title, subtitle, onAuthorized, onCancel, busy = false }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [entrance]);

  function submit(): void {
    if (password !== HOUSEHOLD_AUTHORIZATION_PASSWORD) {
      setError('Password incorrecta. Inténtalo de nuevo.');
      setPassword('');
      return;
    }
    setError(null);
    onAuthorized();
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.glow} />
      <Animated.View
        style={[
          styles.content,
          {
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
              },
            ],
          },
        ]}
      >
        <View style={styles.icon}>
          <MaterialCommunityIcons name="shield-lock-outline" size={30} color={COLORS.lime} />
        </View>
        <Text style={styles.eyebrow}>AUTORIZACIÓN DE CASA</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={[styles.field, error && styles.fieldError]}>
          <MaterialCommunityIcons name="key-outline" size={20} color={COLORS.mutedDeep} />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="Contraseña de autorización"
            placeholderTextColor={COLORS.mutedDeep}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword((value) => !value)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar password' : 'Ver password'}
          >
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={21}
              color={COLORS.muted}
            />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={17} color={COLORS.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <>
              <Text style={styles.primaryText}>Continuar</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.bg} />
            </>
          )}
        </Pressable>
        <Pressable style={styles.cancel} onPress={onCancel} disabled={busy}>
          <MaterialCommunityIcons name="arrow-left" size={16} color={COLORS.muted} />
          <Text style={styles.cancelText}>Volver a casas</Text>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  glow: {
    position: 'absolute',
    top: -170,
    right: -130,
    width: 390,
    height: 390,
    borderRadius: 195,
    backgroundColor: '#123c35',
    opacity: 0.55,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    marginBottom: 22,
    borderRadius: 21,
    backgroundColor: '#173a32',
    transform: [{ rotate: '-6deg' }],
  },
  eyebrow: { color: COLORS.lime, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 10, color: COLORS.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  subtitle: { marginTop: 12, color: COLORS.muted, fontSize: 16, lineHeight: 23 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    marginTop: 28,
    paddingLeft: 15,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    borderRadius: 16,
    backgroundColor: COLORS.panel,
  },
  fieldError: { borderColor: COLORS.danger },
  input: { flex: 1, height: '100%', paddingHorizontal: 12, color: COLORS.text, fontSize: 16 },
  eyeButton: { paddingHorizontal: 15 },
  errorBox: {
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
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
  },
  primaryText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 18,
    padding: 9,
  },
  cancelText: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
});
