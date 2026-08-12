import AsyncStorage from '@react-native-async-storage/async-storage';

const configuredAuthorizationPassword = process.env.EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD?.trim();

/**
 * This value is intentionally configurable for the current shared-house flow.
 * EXPO_PUBLIC variables are bundled into the client, so this is not a secret.
 */
export const HOUSEHOLD_AUTHORIZATION_PASSWORD =
  configuredAuthorizationPassword || 'fornelosdemontes';

const AUTHORIZATION_STORAGE_KEY = '@lista-de-casa/household-authorized';

export async function hasStoredHouseholdAuthorization(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTHORIZATION_STORAGE_KEY)) === 'true';
}

export async function rememberHouseholdAuthorization(): Promise<void> {
  await AsyncStorage.setItem(AUTHORIZATION_STORAGE_KEY, 'true');
}
