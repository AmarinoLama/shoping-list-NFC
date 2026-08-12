# Lista de Casa

Aplicación móvil Expo/React Native para centralizar la lista de la compra de un hogar. Usa Supabase para autenticación, PostgreSQL, Row Level Security y sincronización en tiempo real.

## Incluye

- Registro e inicio de sesión con email y contraseña.
- Hogares compartidos con miembros.
- Crear una lista o unirse mediante token NFC.
- Añadir productos, cantidad y categoría.
- Marcar, borrar y limpiar productos completados.
- Actualización realtime entre todos los móviles del hogar.
- Enlace de invitación preparado para escribir en una etiqueta NFC.
- Persistencia de sesión móvil con AsyncStorage.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Copia `.env.example` como `.env.local`.
3. Rellena `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` desde **Project Settings → API**.
4. Configura `EXPO_PUBLIC_NFC_BASE_URL` y `EXPO_PUBLIC_NFC_DOMAIN` cuando tengas un dominio HTTPS para las etiquetas.
5. Ejecuta el contenido de `supabase/migrations/202608120001_initial_schema.sql` en el SQL Editor de Supabase.
6. Comprueba que Realtime está habilitado para `public.shopping_items`.

La migración crea las tablas, índices, funciones seguras, políticas RLS y la publicación realtime. No uses nunca una service-role key dentro de la aplicación móvil.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm start
```

Después elige:

- `a` para Android emulator/device.
- `i` para iOS simulator (macOS).
- `w` para web.

La app muestra una pantalla de configuración si faltan las variables públicas de Supabase.

## NFC

La app genera una URL con este formato:

```text
https://tu-dominio.com/join/<nfc_token>
```

El token es un identificador de invitación protegido por una función RPC; no expone directamente la lista. Para preparar la etiqueta:

1. Configura `EXPO_PUBLIC_NFC_BASE_URL` con una URL HTTPS real y corta.
2. Crea un hogar desde la app.
3. Pulsa **Compartir** en la tarjeta “Etiqueta NFC de casa”.
4. Escribe la URL compartida como registro NDEF de tipo URL en la etiqueta.
5. Al acercar el móvil, iOS y Android abrirán la URL. Si la app nativa está configurada con Universal Links/App Links, el sistema puede abrirla directamente; si no, la URL puede servir como fallback web.

Para deep linking nativo en producción, define también `EXPO_PUBLIC_NFC_DOMAIN` y vuelve a generar las builds. Después hay que asociar el dominio real con:

- `apple-app-site-association` para iOS.
- `assetlinks.json` para Android.

La configuración dinámica de Expo añade automáticamente `associatedDomains` e `intentFilters` cuando existe `EXPO_PUBLIC_NFC_DOMAIN`. El esquema de desarrollo `lista-casa://` también está configurado para pruebas internas.

## Build móvil

Para publicar una build nativa usa EAS Build:

```bash
npx eas build:configure
npx eas build --platform android
npx eas build --platform ios
```

La lectura/escritura física de etiquetas NFC se realiza con una aplicación de escritura NFC del sistema o de terceros. El flujo de esta app usa el estándar más compatible: una URL HTTPS almacenada en la etiqueta.

## Estructura

- `App.tsx`: sesión, enlaces entrantes y routing principal.
- `src/lib/supabase.ts`: cliente Supabase móvil.
- `src/lib/shopping.ts`: operaciones CRUD, RPC, realtime y NFC.
- `src/screens/`: autenticación, hogar, lista y configuración.
- `supabase/migrations/`: esquema y seguridad del backend.
