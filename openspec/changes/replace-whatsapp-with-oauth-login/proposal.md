## Why

El inicio de sesión y vinculación mediante un bot de WhatsApp obliga al usuario a salir del navegador hacia WhatsApp, enviar un mensaje manual y volver con un enlace temporal, además de requerir infraestructura y webhooks de WhatsApp Cloud API. Reemplazarlo por inicio de sesión integrado con **Google (Gmail)** y **Apple** permite que el usuario elija cualquiera de los dos proveedores dentro de la misma pantalla, seleccione o ingrese su cuenta de correo real (ej. `guillena@gmail.com`, recordando en el navegador las cuentas ya usadas en ese dispositivo), confirme su `@usuario` únicamente la primera vez que ingresa, mantenga su sesión guardada en el dispositivo para aceptar futuros retos en un solo toque, y pueda cambiar de cuenta en cualquier momento desde `/perfil` o `/r/[code]`.

## What Changes

- **BREAKING**: Se reemplaza por completo el registro sin proveedor (`POST /auth/instant-register`), la vinculación por mensaje inverso de WhatsApp (`POST /auth/whatsapp/link-token`, webhook `/webhooks/whatsapp`) y el enlace mágico por WhatsApp (`POST /auth/magic-login`, `/auth/magic`) por autenticación OAuth/OIDC integrada con **Google** y **Apple** verificada directamente en el backend NestJS.
- **Inicio de sesión integrado con Google o Apple (`POST /auth/oauth/verify` y `POST /auth/oauth/complete-profile`) y selector de cuenta**:
  - Cuando el usuario no tiene sesión en el dispositivo (en `/entrar`, `/r/[code]`, `/crear` o `/perfil`), puede elegir **"Continuar con Google"** o **"Continuar con Apple"**.
  - **Selector de cuenta con memoria en el navegador**: Al elegir Google o Apple, si ya hay cuentas usadas previamente en ese navegador las propone para entrar con un toque (ej. `guillena@gmail.com`), o permite escribir/autocompletar el correo de Google o Apple del usuario para asociarlo explícitamente a su perfil (en lugar de asignar un correo genérico `jugador@gmail.com`).
  - **Si ya tenía cuenta**: el backend valida su identidad (`googleSub` / `appleSub` o `email`), emite el JWT persistente y restaura su sesión con todas sus monedas, retos y amigos sin pasos intermedios.
  - **Si es su primera vez**: el sistema muestra claramente el correo vinculado (`guillena@gmail.com`), precarga su nombre y `@usuario` sugerido a partir de su cuenta y le pide confirmar su `@usuario` único antes de crear la cuenta, acreditándole las **100 monedas** de bienvenida en ese único paso.
- **Sesión persistente y opción "Cambiar cuenta" en `/perfil` y `/r/[code]`**:
  - Si en ese dispositivo ya inició sesión previamente (`localStorage`), al abrir `/r/[code]` no vuelve a pedir login: muestra directamente el desafío, el botón **"Aceptar Reto ahora"**, el indicador de con qué cuenta está conectado (`@usuario` / `email`) y un botón **"Cambiar cuenta"** por si desea ingresar con otra cuenta.
  - En `/perfil`, muestra el correo vinculado (`email`) y ofrece el botón **"Cambiar cuenta"** para cerrar la sesión actual y elegir otra cuenta de Google o Apple.
- **Compartir retos por WhatsApp se mantiene intacto**:
  - Los enlaces `wa.me/?text=...` para enviar desafíos a amigos siguen funcionando igual, ya que son mensajes de usuario a usuario y no requieren bot.

## Capabilities

### New Capabilities
- *(Ninguna capacidad nueva de nivel raíz; se actualizan las capacidades existentes)*

### Modified Capabilities
- `onboarding-whatsapp`: Se reemplazan los requisitos de vinculación por mensaje inverso y Magic Link de WhatsApp por la autenticación integrada con Google y Apple, selector de cuenta con memoria en el navegador, confirmación de `@usuario` en el primer ingreso, persistencia de sesión en el dispositivo y opción de cambiar de cuenta en `/perfil` y `/r/[code]`.
- `dual-wallet-economy`: El bono de bienvenida de 100 monedas se acredita en un único tramo al completar el alta con Google o Apple, y el premio por viralidad (+30 monedas al invitador) se acredita cuando el amigo invitado autenticado con Google o Apple activa su primer reto.

## Impact

- **Base de datos (`apps/api/prisma/schema.prisma`)**:
  - En `User`: se agregan `email String? @unique`, `googleSub String? @unique` y `appleSub String? @unique`.
- **Backend (`apps/api`)**:
  - `AuthService` / `AuthController`: nuevos endpoints `POST /auth/oauth/verify` y `POST /auth/oauth/complete-profile`.
  - `UsersService`: incluye `email` en la vista de perfil (`GET /users/me/profile`).
  - `FriendsService.tryGrantReferral`: valida que el invitado tenga identidad OAuth verificada (`googleSub`, `appleSub` o `email`) y haya activado su primer reto.
- **Frontend (`apps/web`)**:
  - `InstantAuthCard.tsx` e `InvitePageClient.tsx`: muestran los botones 3D **"Continuar con Google"** y **"Continuar con Apple"**, el selector de cuenta (con cuentas recordadas en el navegador + input de correo con autocompletado del navegador), y el paso de confirmación de `@usuario` únicamente cuando `status === "NEEDS_PROFILE"`.
  - `PerfilClient.tsx` e `InvitePageClient.tsx`: muestran el correo asociado a la sesión activa y el botón **"Cambiar cuenta"**.
  - Se eliminan `WhatsappLinkPromptCard.tsx` y la ruta `/auth/magic`.
