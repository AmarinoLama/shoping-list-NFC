# Lista de Casa

Aplicación móvil Expo/React Native para centralizar la lista de la compra de una casa. Usa Supabase, PostgreSQL, Row Level Security y sincronización en tiempo real; no requiere cuentas de usuario.

## Incluye

- Casas compartidas con acceso mediante contraseña.
- Crear una lista o unirse mediante token NFC.
- Añadir productos con cantidad y unidad configurable: unidades, gramos, kilos, mililitros, litros, paquetes, cajas, botellas, latas, sobres o una unidad personalizada.
- Marcar, borrar y limpiar productos completados.
- Actualización realtime entre todos los móviles del hogar.
- Rutas NFC desde el selector de casas para abrir una casa directamente.
- Imágenes opcionales por producto, visibles para todos los miembros mientras la compra está pendiente.
- Catálogo global de productos ya usados: al escribir en cualquier casa aparecen sugerencias para autocompletar nombre y categoría.
- Categorías globales compartidas entre todas las casas, con CRUD de nombre y emoji y selección independiente de las categorías activas en cada vivienda.
- Fotos opcionales únicamente desde la cámara o la galería del móvil, con recorte y compresión.
- Persistencia local de la autorización con AsyncStorage.
- Selector de casas como pantalla inicial: la autorización se solicita al entrar en el menú y después permite gestionar las casas sin repetirla.
- Autorización de casa con contraseña, control para mostrar/ocultar el password y recuerdo local del acceso.

## Flujo de acceso a una casa

Al entrar en el menú de casas se solicita la autorización configurada en `EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD`; si no coincide, se muestra el error “Password incorrecta”. Tras una autorización correcta se guarda un permiso local en el dispositivo y no se vuelve a pedir la contraseña para abrir, crear, editar, borrar o cambiar de casa. Las etiquetas NFC generadas incluyen esa autorización en la ruta para abrir la casa automáticamente después de escanearla. Como las variables `EXPO_PUBLIC_*` y las URLs NFC son visibles en el cliente, esto es comodidad de acceso, no una medida de seguridad: para producción conviene mover la validación a una función segura del backend.

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Copia `.env.example` como `.env.local`.
3. Rellena `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` desde **Project Settings → API**. Se usa exclusivamente la anon key; no hay cuentas ni sesiones de usuario.
4. Configura `EXPO_PUBLIC_NFC_BASE_URL`, `EXPO_PUBLIC_NFC_DOMAIN` y `EXPO_PUBLIC_HOUSEHOLD_AUTHORIZATION_PASSWORD` cuando tengas un dominio HTTPS para las etiquetas.
5. Ejecuta el contenido completo de `supabase/database.sql` en el SQL Editor de Supabase.
6. Comprueba que Realtime está habilitado para `public.shopping_items`.

El archivo `supabase/database.sql` crea las tablas, índices, funciones RPC, políticas RLS, la publicación realtime, el bucket de imágenes, el catálogo global de productos y las categorías globales compartidas. Las categorías se crean manualmente y cualquier casa puede activar o desactivar las que quiere usar; también se puede desactivar completamente el modo de categorías para mostrar una lista convencional. Al renombrar una categoría se actualizan los productos existentes y, al borrarla, esos productos pasan a “Sin categoría”. El catálogo conserva nombre, categoría y número de compras para sugerir productos entre casas; las fotos son opcionales, se muestran mientras la compra está pendiente y se eliminan al marcarla como completada. Las imágenes solo se incorporan desde la cámara o la galería; el selector nativo permite mover y recortar la imagen con líneas rectas antes de guardarla. La app la convierte a JPEG, reduce su tamaño y la sube a Supabase Storage. No uses nunca una service-role key dentro de la aplicación móvil.

### Error 404 al crear un hogar (PGRST202)

Si al pulsar **Crear hogar** aparece un `404` en `POST /rest/v1/rpc/create_household`, es porque las funciones RPC no existen en tu base de datos (la migración inicial no se aplicó completa o quedó a medias). La app llama a estas funciones por RPC:

- `create_household(text)` — crear un hogar.
- `join_household_by_nfc_token(text)` — unirse por etiqueta NFC.
- `get_households()` — listar las casas disponibles.

Solución: abre el **SQL Editor** de tu proyecto Supabase y ejecuta el contenido completo de `supabase/database.sql`. Vuelve a probar y debería funcionar.

En la app nativa, los enlaces NFC usan el esquema `lista-casa://` (configurado en `app.config.ts`); en web usan la URL actual de la aplicación.

## Desarrollo local

Requisitos: Node.js y npm. La aplicación es una app Expo que puede ejecutarse en Android, iOS o navegador web.

### Comandos disponibles

```bash
npm install
npm start             # Arranca Expo
npm run web           # Arranca directamente la versión web
npm run build         # Genera la exportación web
npx tsc --noEmit      # Comprueba los tipos
```

Para una comprobación completa antes de publicar:

```bash
npx tsc --noEmit && npm run build && git diff --check
```


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

## Gestión de categorías y cantidades

Las categorías son un catálogo común para todas las casas. Desde **Gestionar categorías** se pueden crear, renombrar, cambiar de emoji o borrar; cada casa decide qué categorías quiere activar y también puede desactivar el modo de categorías para utilizar una lista convencional. Los productos de una categoría eliminada no desaparecen: pasan a **Sin categoría**.

Al crear o editar un producto, el selector permite elegir la cantidad y su unidad. En la lista se muestran formatos como `x2`, `500 g`, `2 kg` o `1 l` junto al nombre.

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
- `supabase/database.sql`: esquema y seguridad completos del backend.
