import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

/**
 * Base URL of the app where it is actually running, resolved at runtime so
 * every redirect (email confirmation, NFC invites, deep links) points back
 * to the real deployment instead of a hardcoded domain that can change on
 * redeploy (e.g. Cloudflare Workers subdomains).
 *
 * - Web: uses `window.location.origin`, so it always matches the URL the
 *   user has in the browser, whatever that is.
 * - Native: uses the app scheme (`lista-casa://`), the deep link used by
 *   iOS/Android.
 */
export function getAppBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  // Raíz del deep link del esquema (lista-casa://), base para cualquier redirect.
  return Linking.createURL('/').replace(/\/$/, '');
}
