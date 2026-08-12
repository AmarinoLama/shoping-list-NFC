import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const nfcDomain = process.env.EXPO_PUBLIC_NFC_DOMAIN?.replace(/^https?:\/\//, '').replace(
    /\/$/,
    '',
  );

  return {
    ...config,
    name: config.name ?? 'Lista de Casa',
    slug: config.slug ?? 'lista-de-casa',
    version: config.version ?? '1.0.0',
    icon: './assets/icon.png',
    scheme: 'lista-casa',
    ios: {
      ...config.ios,
      associatedDomains: nfcDomain ? [`applinks:${nfcDomain}`] : [],
    },
    android: {
      ...config.android,
      intentFilters: nfcDomain
        ? [
            {
              action: 'VIEW',
              autoVerify: true,
              category: ['BROWSABLE', 'DEFAULT'],
              data: [{ scheme: 'https', host: nfcDomain, pathPrefix: '/join' }],
            },
          ]
        : [],
    },
  };
};
