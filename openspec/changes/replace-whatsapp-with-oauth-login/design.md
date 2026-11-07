## Context

Actualmente la autenticación utiliza un registro instantáneo sin proveedor (`POST /auth/instant-register`) seguido de vinculación por mensaje inverso a un bot de WhatsApp (`POST /auth/whatsapp/link-token` y webhook `/webhooks/whatsapp`) y enlaces mágicos (`POST /auth/magic-login`). Ver `proposal.md` para la motivación del cambio hacia autenticación integrada con Google (Gmail) y Apple.

## Goals / Non-Goals

**Goals:**
- Permitir iniciar sesión o registrarse eligiendo entre **Google** o **Apple** directamente en la interfaz web (`InstantAuthCard`, `/entrar`, `/r/[code]`, `/crear`, `/perfil`).
- Verificar los tokens de identidad (OIDC ID Tokens) directamente en el backend NestJS (`apps/api/src/auth`), sin depender de servicios de autenticación de terceros (Firebase/Auth0).
- Pedir confirmación de `displayName` y `@usuario` únicamente en el primer ingreso de una cuenta nueva (`status: "NEEDS_PROFILE"`), e iniciar sesión en un solo paso (`status: "AUTHENTICATED"`) para cuentas existentes.
- Mantener la sesión persistente en el dispositivo (`localStorage` + JWT de larga duración) para que quien ya se logueó en ese dispositivo no vuelva a ver pantallas de login al abrir o aceptar futuros retos.
- Acreditar las **100 monedas** de bienvenida en un único tramo al completar el perfil inicial, y habilitar el premio por viralidad (+30 monedas al invitador) cuando el invitado autenticado con Google o Apple active su primer reto.

**Non-Goals:**
- No se implementan contraseñas ni envío de correos transaccionales.
- No se modifica el mecanismo para compartir invitaciones de retos por WhatsApp (`https://wa.me/?text=...`), que es de usuario a usuario y no utiliza bot.

## Decisions

### 1. Modelo de datos en Prisma (`User`)
- **Decisión**: Agregar a `model User` en `apps/api/prisma/schema.prisma`:
  - `email String? @unique`
  - `googleSub String? @unique`
  - `appleSub String? @unique`
- **Racional**: Permite identificar de manera inequívoca la cuenta tanto por el `sub` inmutable de Google o Apple como unificar automáticamente si el usuario entra luego con el otro proveedor usando el mismo `email` verificado. Se mantiene `whatsappPhone` como columna opcional en el esquema por compatibilidad de datos históricos, pero deja de usarse en el flujo de autenticación.

### 2. Flujo de autenticación en dos fases (`verify` + `complete-profile`)
- **Decisión**:
  1. **`POST /auth/oauth/verify`**:
     - Recibe `{ provider: "GOOGLE" | "APPLE", idToken: string, displayNameHint?: string }`.
     - Verifica el `idToken` contra las claves públicas OIDC de Google (`https://oauth2.googleapis.com/tokeninfo` / JWKS) o Apple (`https://appleid.apple.com/auth/keys`), extrayendo `{ sub, email, name }`. En entorno de desarrollo/test (`NODE_ENV !== "production"` o cuando se pasa un token de desarrollo firmado/estructurado `dev:<provider>:<sub>:<email>:<name>`), permite verificar identidades simuladas sin requerir credenciales externas en CI/Playwright.
     - Busca en `User` por `googleSub` / `appleSub` o por `email`:
       - **Si existe**: actualiza el `googleSub`/`appleSub` si faltaba, emite el JWT de sesión y responde:
         `{ status: "AUTHENTICATED", accessToken, user }`.
       - **Si no existe**: firma un `onboardingToken` JWT de corta duración (15 min) con `{ provider, sub, email, suggestedDisplayName }` y calcula un `suggestedUsername` libre a partir del nombre o parte local del email, respondiendo:
         `{ status: "NEEDS_PROFILE", onboardingToken, email, suggestedDisplayName, suggestedUsername }`.
  2. **`POST /auth/oauth/complete-profile`**:
     - Recibe `{ onboardingToken: string, displayName: string, username: string, inviteCode?: string }`.
     - Verifica el `onboardingToken`, valida que el `@usuario` esté disponible (o devuelve 409 con `suggestions` igual que antes), crea el `User` con `coinsAvailable: 100` (`BONUS_INIT_COINS = 100`), registra la transacción `BONUS_INIT` de 100 monedas y devuelve `{ accessToken, user }`.

### 3. Experiencia en `/r/[code]`, `/entrar`, `/crear` y `/perfil`
- **Decisión**:
  - **Con sesión activa en el dispositivo**:
    - En `/r/[code]`: muestra directamente el botón **"Aceptar Reto ahora"** sin pedir login.
    - En `/entrar`: redirige automáticamente a `/`.
  - **Sin sesión activa en el dispositivo**:
    - Paso 1: Muestra los dos botones 3D **"Continuar con Google"** (`data-testid="btn-oauth-google"`) y **"Continuar con Apple"** (`data-testid="btn-oauth-apple"`).
    - Paso 2 (solo si `verify` devuelve `NEEDS_PROFILE`): Muestra el formulario de confirmación con `displayName` y `@usuario` pre-llenados y editables, y el botón 3D **"Confirmar @usuario y recibir +100 monedas"** (o **"Confirmar @usuario y Aceptar Reto"** cuando está en `/r/[code]`).

### 4. Limpieza de componentes y rutas de WhatsApp Auth
- **Decisión**:
  - Eliminar `WhatsappLinkPromptCard.tsx` y quitar su uso en `CrearRetoForm.tsx`, `PerfilClient.tsx` e `InvitePageClient.tsx`.
  - Eliminar la ruta `apps/web/app/(app)/auth/magic/page.tsx`.
  - Actualizar `FriendsService.tryGrantReferral` para comprobar que el invitado tenga identidad verificada (`Boolean(invitee.googleSub || invitee.appleSub || invitee.email || invitee.whatsappPhone)`) en lugar de exigir `whatsappPhone`.

## Risks / Trade-offs

- **[Riesgo] Apple oculta el nombre del usuario después del primer inicio de sesión**:
  - *Mitigación*: Apple envía `user.name` en el cliente solo la primera vez; el frontend lo envía como `displayNameHint` en `POST /auth/oauth/verify` y, si no viene, se sugiere la parte local del `email` para que el usuario lo confirme o edite en el paso `NEEDS_PROFILE`.
- **[Riesgo] Pruebas locales y E2E sin credenciales de Google Cloud / Apple Developer configuradas**:
  - *Mitigación*: Cuando `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_CLIENT_ID` no están definidos en el entorno local, los botones de Google y Apple en el frontend permiten autenticar mediante el proveedor de desarrollo integrado contra `POST /auth/oauth/verify`, manteniendo el mismo contrato de API de extremo a extremo.

