## Context

El sitio institucional (`ibetu.online`) presenta dos botones principales de llamada a la acción hacia `app.ibetu.online`:
1. **"Empezar a jugar / Crear perfil"** (jugadores nuevos).
2. **"Ya tengo perfil"** (jugadores existentes que ingresan desde otro navegador o dispositivo).

En el backend (`apps/api`), ya existe toda la infraestructura para autenticación sin contraseña vía WhatsApp:
- `POST /auth/whatsapp/link-token` genera un token `VINC-XXXXXX` de 10 minutos para vincular el teléfono del usuario mediante un mensaje inverso al bot de WhatsApp.
- `WhatsappService` detecta la palabra `entrar` (`LOGIN_REGEX = /\bentrar\b/i`) en mensajes entrantes y responde con un enlace mágico `${APP_URL}/auth/magic?token=${token}` (TTL 10 minutos en Redis bajo `magic:<token>`).
- `POST /auth/magic-login` consume el token con `getdel` y devuelve `{ accessToken, user }`.

Sin embargo, en el frontend (`apps/web`):
- No existe la página `/auth/magic` que reciba el `?token=...` y ejecute `POST /auth/magic-login`.
- No existe una ruta `/entrar` para recibir los dos botones de `ibetu.online` ni una tarjeta de "Entrar con mi WhatsApp".
- Al crear el primer reto en `CrearRetoForm.tsx`, no se solicita al creador vincular su WhatsApp (actualmente solo se muestra en `InvitePageClient.tsx` cuando un invitado acepta un reto).

## Goals / Non-Goals

**Goals:**
- Conectar los dos botones de `ibetu.online` con `app.ibetu.online/entrar?modo=nuevo` y `app.ibetu.online/entrar?modo=ingresar`, redirigiendo automáticamente a `/` si ya hay sesión en `localStorage`.
- Implementar la Opción A (Magic Link vía bot de WhatsApp) como único método de acceso para cuentas existentes, incluyendo el endpoint público `GET /auth/whatsapp/login-url` y la ruta de canje `/auth/magic`.
- Solicitar la vinculación con WhatsApp inmediatamente después de crear un reto en `CrearRetoForm.tsx` cuando el usuario aún no tiene un teléfono vinculado (`whatsappLinked === false`).
- Permitir cerrar sesión desde `/perfil` y alternar entre "Crear perfil" y "Ya tengo perfil" en `InstantAuthCard` y `/perfil`.

**Non-Goals:**
- No se agregan contraseñas, correos electrónicos ni códigos OTP enviados en frío (evitando costos de plantillas iniciadas por el negocio en WhatsApp).
- No se modifica el repositorio del sitio estático `ibetu.online` (solo se definen las URLs de destino en `app.ibetu.online`).

## Decisions

### 1. Puerta de entrada unificada en `/entrar` con soporte de `?modo=nuevo|ingresar`
- **Decisión**: Crear `apps/web/app/entrar/page.tsx` que lee `searchParams.modo` (`nuevo` por defecto, o `ingresar`).
  - Si `session` en `useShell()` ya existe, ejecuta `router.replace("/")`.
  - En modo `nuevo`, muestra `InstantAuthCard` y al autenticarse redirige a `/` (o a `?next=...` si se especifica).
  - En modo `ingresar`, muestra la vista de acceso por WhatsApp con el botón 3D `--success` **"Entrar con mi WhatsApp"** y un enlace para cambiar a "Soy nuevo, quiero crear mi perfil".
- **URLs para los dos botones de `ibetu.online`**:
  - Botón 1 (Nuevo jugador): `https://app.ibetu.online/entrar?modo=nuevo`
  - Botón 2 (Ya tengo perfil): `https://app.ibetu.online/entrar?modo=ingresar`

### 2. Endpoint público `GET /auth/whatsapp/login-url` y campo `whatsappLinked`
- **Decisión**:
  - Agregar `GET /auth/whatsapp/login-url` en `AuthController` que devuelve `{ messageText, whatsappUrl }` construidos con `WHATSAPP_BOT_NUMBER` y el texto `"Quiero entrar a mi cuenta IBetU"` (que contiene la palabra `entrar` requerida por `LOGIN_REGEX` en `WhatsappService`).
  - Incluir `whatsappLinked: boolean` (calculado como `Boolean(user.phone)`) en el objeto `user` devuelto por `AuthService.buildAuthResponse` y en `UsersService` (`GET /users/me`), además de actualizar la interfaz `AuthUser` en `apps/web/lib/auth-storage.ts`.

### 3. Ruta de canje `/auth/magic`
- **Decisión**: Crear `apps/web/app/auth/magic/page.tsx` (con un componente cliente `MagicLoginClient`) que:
  1. Lee `token` desde `useSearchParams()`.
  2. Llama una sola vez (usando un `useRef` para evitar doble ejecución en React StrictMode, dado que `magic:<token>` usa `getdel` de un solo uso) a `POST /api/auth/magic-login` con `{ token }`.
  3. Si es exitoso, guarda la sesión con `setSession(res)` y redirige a `/`.
  4. Si falla (401 token inválido o expirado) o no hay token, muestra un mensaje claro con el botón **"Pedir un nuevo enlace por WhatsApp"** y un enlace a `/entrar?modo=nuevo`.

### 4. Componente reutilizable `WhatsappLinkPromptCard` en `CrearRetoForm`
- **Decisión**: Extraer el bloque de vinculación por mensaje inverso (`data-testid="whatsapp-reverse-link-box"`) en un componente reutilizable `apps/web/components/auth/WhatsappLinkPromptCard.tsx` y renderizarlo:
  - En `CrearRetoForm.tsx` dentro de la vista de reto creado (`created-challenge-card`) cuando `!session?.user.whatsappLinked`.
  - En `InvitePageClient.tsx` manteniendo los mismos `data-testid` (`whatsapp-reverse-link-box`, `btn-generate-wsp-token`, `wsp-link-token`, `wsp-send-link`).

## Risks / Trade-offs

- **[Riesgo] React StrictMode ejecuta `useEffect` dos veces en desarrollo y consume el token de un solo uso (`getdel`) en la primera llamada**:
  - *Mitigación*: Usar un `useRef<string | null>(null)` en `/auth/magic` para garantizar que cada `token` se envíe a `POST /auth/magic-login` exactamente una vez por montaje.
- **[Riesgo] Usuario crea su perfil y lanza su primer reto pero ignora la vinculación de WhatsApp**:
  - *Mitigación*: Ubicar `WhatsappLinkPromptCard` directamente debajo de las acciones de compartir en la tarjeta de reto creado, destacando el bono de **+50 monedas** y que es necesario para recuperar la cuenta y recibir avisos cuando su amigo acepte el reto. Además, también estará disponible en `/perfil` cuando `whatsappLinked` sea `false`.

