## Context

Actualmente la autenticación utiliza un registro instantáneo sin proveedor (`POST /auth/instant-register`) seguido de vinculación por mensaje inverso a un bot de WhatsApp (`POST /auth/whatsapp/link-token` y webhook `/webhooks/whatsapp`) y enlaces mágicos (`POST /auth/magic-login`). Ver `proposal.md` para la motivación del cambio hacia autenticación integrada con Google (Gmail) y Apple.

## Goals / Non-Goals

**Goals:**
- Permitir iniciar sesión o registrarse eligiendo entre **Google** o **Apple** directamente en la interfaz web (`InstantAuthCard`, `/entrar`, `/r/[code]`, `/crear`, `/perfil`).
- Proveer un **selector de cuenta** claro al elegir Google o Apple que proponga las cuentas ya utilizadas en ese navegador (ej. `guillena@gmail.com`) o permita ingresar/autocompletar el correo de Google/Apple del usuario, de modo que quede explícito qué correo se vincula al perfil y sugiera el nombre y `@usuario` a partir de ese correo.
- Verificar los tokens de identidad directamente en el backend NestJS (`apps/api/src/auth`), sin depender de servicios de autenticación de terceros (Firebase/Auth0).
- Pedir confirmación de `displayName` y `@usuario` únicamente en el primer ingreso de una cuenta nueva (`status: "NEEDS_PROFILE"`), e iniciar sesión en un solo paso (`status: "AUTHENTICATED"`) para cuentas existentes.
- Mantener la sesión persistente en el dispositivo (`localStorage` + JWT de larga duración) y ofrecer la acción **"Cambiar cuenta"** tanto en `/perfil` como en `/r/[code]`.
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
- **Racional**: Permite identificar de manera inequívoca la cuenta tanto por el `sub` inmutable de Google o Apple como unificar automáticamente si el usuario entra luego con el otro proveedor usando el mismo `email` verificado.

### 2. Selector de cuenta con memoria en el navegador (`localStorage`)
- **Decisión**:
  - Cuando el usuario toca **"Continuar con Google"** o **"Continuar con Apple"**, si no se inyectó un `idToken` externo de prueba, se despliega el selector de cuenta del proveedor elegido:
    - Si existen cuentas guardadas en `localStorage` (`ibetu:known_oauth_accounts`) para ese navegador, se listan arriba como botones de 1 toque (ej. `guillena@gmail.com` — `@guillena`) junto con la opción **"Usar otra cuenta"**.
    - Cuando el usuario escribe o autocompleta su correo (input `type="email"` con `autoComplete="email"` para aprovechar las cuentas guardadas del navegador), se genera el token de identidad para ese correo (`dev:<PROVIDER>:sub_<email>:<email>:<localPart>`) y se llama a `POST /auth/oauth/verify`.
    - Al autenticarse o completar el perfil, la cuenta (`email`, `displayName`, `username`, `provider`) se guarda en `ibetu:known_oauth_accounts` en ese navegador para futuras sesiones o cambios de cuenta.

### 3. Flujo de autenticación en dos fases (`verify` + `complete-profile`)
- **Decisión**:
  1. **`POST /auth/oauth/verify`**:
     - Recibe `{ provider: "GOOGLE" | "APPLE", idToken: string, displayNameHint?: string }`.
     - Verifica el `idToken` (JWT OIDC o token estructurado `dev:<provider>:<sub>:<email>:<name>` cuando no hay `GOOGLE_CLIENT_ID`/`APPLE_CLIENT_ID` configurados en el servidor), extrayendo `{ sub, email, name }`.
     - Busca en `User` por `googleSub` / `appleSub` o por `email`:
       - **Si existe**: actualiza el `googleSub`/`appleSub` si faltaba, emite el JWT de sesión y responde:
         `{ status: "AUTHENTICATED", accessToken, user }`.
       - **Si no existe**: firma un `onboardingToken` JWT de corta duración (15 min) con `{ provider, sub, email, suggestedDisplayName }` y calcula un `suggestedUsername` libre a partir del nombre o parte local del email (ej. `guillena@gmail.com` → `Guillena` / `@guillena`), respondiendo:
         `{ status: "NEEDS_PROFILE", onboardingToken, email, suggestedDisplayName, suggestedUsername }`.
  2. **`POST /auth/oauth/complete-profile`**:
     - Recibe `{ onboardingToken: string, displayName: string, username: string, inviteCode?: string }`.
     - Verifica el `onboardingToken`, valida que el `@usuario` esté disponible (o devuelve 409 con `suggestions`), crea el `User` con `coinsAvailable: 100` (`BONUS_INIT_COINS = 100`), registra la transacción `BONUS_INIT` de 100 monedas y devuelve `{ accessToken, user }`.

### 4. Experiencia en `/r/[code]`, `/entrar`, `/crear` y `/perfil` + "Cambiar cuenta"
- **Decisión**:
  - **Con sesión activa en el dispositivo**:
    - En `/r/[code]`: muestra directamente el botón **"Aceptar Reto ahora"** sin pedir login, e incluye debajo el indicador de sesión activa (`Conectado como @usuario (email)`) con el botón **"Cambiar cuenta"** (`data-testid="invite-switch-account-btn"`), que limpia la sesión activa y abre el selector de Google/Apple en la misma invitación.
    - En `/perfil`: muestra en la tarjeta de perfil el `email` vinculado (`data-testid="profile-email"`) y el botón **"Cambiar cuenta"** (`data-testid="switch-account-button"`), además de **"Cerrar sesión"**.
    - En `/entrar`: redirige automáticamente a `/`.
  - **Sin sesión activa en el dispositivo**:
    - Paso 1: Botones 3D **"Continuar con Google"** (`data-testid="btn-oauth-google"`) y **"Continuar con Apple"** (`data-testid="btn-oauth-apple"`).
    - Paso 2: Selección de cuenta recordada en el navegador o ingreso del correo (`guillena@gmail.com`).
    - Paso 3 (solo si `verify` devuelve `NEEDS_PROFILE`): Muestra el correo vinculado (`guillena@gmail.com`), `displayName` y `@usuario` pre-llenados a partir de ese correo, y el botón 3D **"Confirmar @usuario y recibir +100 monedas"**.

### 5. Limpieza de componentes y rutas de WhatsApp Auth
- **Decisión**:
  - Eliminar `WhatsappLinkPromptCard.tsx` y quitar su uso en `CrearRetoForm.tsx`, `PerfilClient.tsx` e `InvitePageClient.tsx`.
  - Eliminar la ruta `apps/web/app/(app)/auth/magic/page.tsx`.
  - Actualizar `FriendsService.tryGrantReferral` para comprobar que el invitado tenga identidad verificada (`Boolean(invitee.googleSub || invitee.appleSub || invitee.email || invitee.whatsappPhone)`).

## Risks / Trade-offs

- **[Riesgo] Varias personas probando en el mismo navegador o el mismo usuario con múltiples cuentas**:
  - *Mitigación*: Guardar las cuentas conocidas en `ibetu:known_oauth_accounts` permite cambiar entre cuentas en un toque desde `/perfil` o `/r/[code]`, o elegir "Usar otra cuenta" para escribir un correo distinto.
