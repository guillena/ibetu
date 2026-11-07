## Why

El inicio de sesión y vinculación mediante un bot de WhatsApp obliga al usuario a salir del navegador hacia WhatsApp, enviar un mensaje manual y volver con un enlace temporal, además de requerir infraestructura y webhooks de WhatsApp Cloud API. Reemplazarlo por inicio de sesión integrado con **Google (Gmail)** y **Apple** permite que el usuario elija cualquiera de los dos proveedores dentro de la misma pantalla, confirme su `@usuario` únicamente la primera vez que ingresa, y mantenga su sesión guardada en el dispositivo para aceptar futuros retos en un solo toque sin volver a loguearse.

## What Changes

- **BREAKING**: Se reemplaza por completo el registro sin proveedor (`POST /auth/instant-register`), la vinculación por mensaje inverso de WhatsApp (`POST /auth/whatsapp/link-token`, webhook `/webhooks/whatsapp`) y el enlace mágico por WhatsApp (`POST /auth/magic-login`, `/auth/magic`) por autenticación OAuth/OIDC integrada con **Google** y **Apple** verificada directamente en el backend NestJS.
- **Inicio de sesión integrado con Google o Apple (`POST /auth/oauth/verify` y `POST /auth/oauth/complete-profile`)**:
  - Cuando el usuario no tiene sesión en el dispositivo (en `/entrar`, `/r/[code]`, `/crear` o `/perfil`), puede elegir **"Continuar con Google"** o **"Continuar con Apple"**.
  - **Si ya tenía cuenta**: el backend valida su identidad (`googleSub` / `appleSub` o `email`), emite el JWT persistente y restaura su sesión con todas sus monedas, retos y amigos sin pasos intermedios.
  - **Si es su primera vez**: el sistema precarga su nombre de Google/Apple y le pide confirmar su `@usuario` único antes de crear la cuenta, acreditándole las **100 monedas** de bienvenida en ese único paso.
- **Sesión persistente en el dispositivo al recibir un reto (`/r/[code]`)**:
  - Si en ese dispositivo ya inició sesión previamente (`localStorage`), no vuelve a pedir login: muestra directamente el desafío y el botón **"Aceptar Reto ahora"** para seguir sumando monedas o retos.
  - Si no tiene sesión en ese dispositivo, se autentica con Google o Apple ahí mismo y queda listo para aceptar el reto.
- **Compartir retos por WhatsApp se mantiene intacto**:
  - Los enlaces `wa.me/?text=...` para enviar desafíos a amigos siguen funcionando igual, ya que son mensajes de usuario a usuario y no requieren bot.

## Capabilities

### New Capabilities
- *(Ninguna capacidad nueva de nivel raíz; se actualizan las capacidades existentes)*

### Modified Capabilities
- `onboarding-whatsapp`: Se reemplazan los requisitos de vinculación por mensaje inverso y Magic Link de WhatsApp por la autenticación integrada con Google y Apple, confirmación de `@usuario` en el primer ingreso y persistencia de sesión en el dispositivo al abrir enlaces de invitación (`/r/[code]`) o `/entrar`.
- `dual-wallet-economy`: El bono de bienvenida de 100 monedas se acredita en un único tramo al completar el alta con Google o Apple, y el premio por viralidad (+30 monedas al invitador) se acredita cuando el amigo invitado autenticado con Google o Apple activa su primer reto.

## Impact

- **Base de datos (`apps/api/prisma/schema.prisma`)**:
  - En `User`: se agregan `email String? @unique`, `googleSub String? @unique` y `appleSub String? @unique`.
- **Backend (`apps/api`)**:
  - `AuthService` / `AuthController`: nuevos endpoints `POST /auth/oauth/verify` (verifica ID Token de Google/Apple y devuelve sesión activa si ya existe o `onboardingToken` si es nuevo) y `POST /auth/oauth/complete-profile` (confirma `@usuario`, crea el usuario con 100 monedas y emite sesión).
  - `FriendsService.tryGrantReferral`: valida que el invitado tenga identidad OAuth verificada (`googleSub`, `appleSub` o `email`) y haya activado su primer reto.
  - Se retira la dependencia del bot de WhatsApp para login/vinculación.
- **Frontend (`apps/web`)**:
  - `InstantAuthCard.tsx` e `InvitePageClient.tsx`: muestran los botones 3D **"Continuar con Google"** y **"Continuar con Apple"**, seguidos del paso de confirmación de `@usuario` únicamente cuando `status === "NEEDS_PROFILE"`.
  - Se eliminan `WhatsappLinkPromptCard.tsx` y la ruta `/auth/magic`.

