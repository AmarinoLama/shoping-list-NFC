# Lista de Casa

Aplicación móvil Expo/React Native para centralizar la lista de la compra de una casa. Usa Supabase, PostgreSQL, Row Level Security y sincronización en tiempo real; no requiere cuentas de usuario.

## Incluye

- Casas compartidas con acceso mediante contraseña.
- Crear una lista o unirse mediante token NFC.
- Añadir productos, cantidad y categoría.
- Marcar, borrar y limpiar productos completados.
- Actualización realtime entre todos los móviles del hogar.
- Rutas NFC desde el selector de casas para abrir una casa directamente.
- Imágenes opcionales por producto, compartidas entre todos los miembros del hogar.
- Búsqueda automática de imágenes de catálogo, catálogo compartido de productos ya comprados y opción de hacer una foto desde el móvil.
- Persistencia local de la autorización con AsyncStorage.
- Selector de casas como pantalla inicial: abrir, crear o unirse siempre requiere autorización.
- Autorización de casa con contraseña, control para mostrar/ocultar el password y recuerdo local del acceso.

## Flujo de acceso a una casa

Al abrir la app, se muestran únicamente tus casas. Al seleccionar una casa o crear una nueva, aparece la autorización configurada en `EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD`; si no coincide, se muestra el error “Password incorrecta”. Tras una autorización correcta se guarda un permiso local en el dispositivo y no se vuelve a pedir la contraseña en ese dispositivo. Las etiquetas NFC generadas incluyen esa autorización en la ruta para abrir la casa automáticamente después de escanearla. Como las variables `EXPO_PUBLIC_*` y las URLs NFC son visibles en el cliente, esto es comodidad de acceso, no una medida de seguridad: para producción conviene mover la validación a una función segura del backend.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Copia `.env.example` como `.env.local`.
3. Rellena `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` desde **Project Settings → API**. Se usa exclusivamente la anon key; no hay cuentas ni sesiones de usuario.
4. Configura `EXPO_PUBLIC_NFC_BASE_URL`, `EXPO_PUBLIC_NFC_DOMAIN` y `EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD` cuando tengas un dominio HTTPS para las etiquetas.
5. Ejecuta el contenido de `supabase/migrations/202608120001_initial_schema.sql` en el SQL Editor de Supabase.
6. Ejecuta también `supabase/migrations/202608120002_ensure_rpc_functions.sql` (idempotente).
7. Ejecuta `supabase/migrations/202608120003_product_images.sql` para activar imágenes compartidas y el bucket de Storage.
8. Ejecuta `supabase/migrations/202608120004_household_product_catalog.sql` para recordar productos e imágenes por casa.
9. Ejecuta `supabase/migrations/202608120005_anonymous_house_flow.sql` para activar el flujo sin cuentas.
10. Comprueba que Realtime está habilitado para `public.shopping_items`.

Las migraciones crean las tablas, índices, funciones seguras, políticas RLS, la publicación realtime, el bucket de imágenes y el catálogo compartido de productos. Cuando un producto ya comprado vuelve a escribirse, la app reutiliza su imagen guardada antes de consultar el servicio externo. La búsqueda usa Open Food Facts; no se raspa Google y, si el servicio falla, el producto se puede añadir igualmente. Las fotos propias se recortan desde el selector nativo y se suben a Supabase Storage para que las vea todo el hogar. No uses nunca una service-role key dentro de la aplicación móvil.

### Error 404 al crear un hogar (PGRST202)

Si al pulsar **Crear hogar** aparece un `404` en `POST /rest/v1/rpc/create_household`, es porque las funciones RPC no existen en tu base de datos (la migración inicial no se aplicó completa o quedó a medias). La app llama a estas funciones por RPC:

- `create_household(text)` — crear un hogar.
- `join_household_by_nfc_token(text)` — unirse por etiqueta NFC.
- `get_households()` — listar las casas disponibles.

Solución: abre el **SQL Editor** de tu proyecto Supabase y ejecuta las migraciones en orden, incluida `supabase/migrations/202608120005_anonymous_house_flow.sql`. Vuelve a probar y debería funcionar.

En la app nativa, los enlaces NFC usan el esquema `lista-casa://` (configurado en `app.config.ts`); en web usan la URL actual de la aplicación.

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
https://tu-dominio.com/join/<nfc_token>?access=<autorizacion>
```

El token es un identificador de invitación protegido por una función RPC; no expone directamente la lista. Para preparar la etiqueta:

1. Configura `EXPO_PUBLIC_NFC_BASE_URL` con una URL HTTPS real y corta, y `EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD` con la autorización compartida.
2. Crea un hogar desde la app.
3. En el selector de casas, usa compartir o copiar en la tarjeta NFC de la casa elegida.
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

- `App.tsx`: selector de casas, enlaces entrantes y routing principal.
- `src/lib/supabase.ts`: cliente Supabase móvil.
- `src/lib/shopping.ts`: operaciones CRUD, RPC, realtime y NFC.
- `src/screens/`: selector de casas, autorización, lista y configuración.
- `supabase/migrations/`: esquema y seguridad del backend.
