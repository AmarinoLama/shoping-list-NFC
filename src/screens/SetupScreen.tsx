import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export function SetupScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.icon}>
        <Text style={styles.iconText}>⌁</Text>
      </View>
      <Text style={styles.eyebrow}>CONFIGURACIÓN PENDIENTE</Text>
      <Text style={styles.title}>Conecta tu backend.</Text>
      <Text style={styles.body}>
        Añade las variables de Supabase en el archivo .env.local y reinicia Expo para activar las
        listas compartidas.
      </Text>
      <View style={styles.codeCard}>
        <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_URL=...</Text>
        <Text style={styles.code}>EXPO_PUBLIC_SUPABASE_ANON_KEY=...</Text>
        <Text style={styles.code}>EXPO_PUBLIC_NFC_BASE_URL=https://tu-dominio.com/join</Text>
        <Text style={styles.code}>EXPO_PUBLIC_NFC_DOMAIN=tu-dominio.com</Text>
        <Text style={styles.code}>EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD=fornelosdemontes</Text>
      </View>
      <Text style={styles.hint}>
        Después aplica la migración SQL incluida en supabase/migrations.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#071312' },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 54,
    height: 54,
    marginBottom: 24,
    borderRadius: 18,
    backgroundColor: '#173a32',
  },
  iconText: { color: '#a7f36a', fontSize: 32, fontWeight: '700' },
  eyebrow: { color: '#a7f36a', fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 10, color: '#f2f7f4', fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  body: { marginTop: 14, color: '#9badab', fontSize: 16, lineHeight: 24 },
  codeCard: { gap: 10, marginTop: 24, padding: 18, borderRadius: 16, backgroundColor: '#10231f' },
  code: { color: '#c1e7a3', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  hint: { marginTop: 18, color: '#718b85', fontSize: 13, lineHeight: 19 },
});
