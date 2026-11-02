## Why

El sitio institucional (`ibetu.online`) cuenta con dos botones de entrada hacia la aplicación (`app.ibetu.online`): uno para jugadores nuevos que quieren crear su perfil y empezar a jugar, y otro para usuarios que ya tienen perfil y necesitan recuperar su sesión en un nuevo dispositivo o navegador. Actualmente, la aplicación web carece de una pantalla de canje para el enlace mágico de WhatsApp (`/auth/magic`), no ofrece una acción directa para iniciar sesión vía WhatsApp cuando no hay sesión activa, y tampoco solicita vincular WhatsApp al creador cuando lanza su primer reto (lo que deja cuentas nuevas sin teléfono vinculado para recuperarlas después).

## What Changes

- **Puerta de entrada (`/entrar`) conectada a los dos botones de `ibetu.online`**:
  - Si el navegador ya posee una sesión activa en `localStorage`, redirige automáticamente al inicio (`/`).
  - Soporta dos modos (`?modo=nuevo` por defecto y `?modo=ingresar`): permite alternar entre crear un perfil nuevo al instante (+50 monedas) e ingresar a una cuenta existente mediante WhatsApp.
- **Inicio de sesión sin contraseña vía WhatsApp (Opción A como único acceso para cuentas existentes)**:
  - Nuevo endpoint público `GET /auth/whatsapp/login-url` (y helper en el cliente) que devuelve el enlace `wa.me` hacia el bot oficial con el mensaje pre-armado `"Quiero entrar a mi cuenta IBetU"` (que dispara el flujo `entrar` del bot).
  - Nueva ruta `/auth/magic` en `apps/web` que lee `?token=...`, consume `POST /auth/magic-login`, guarda la sesión en `localStorage` y redirige a `/`.
  - En `InstantAuthCard` y `/perfil` sin sesión, se incluye el acceso para usuarios existentes ("¿Ya tenés perfil? Entrá con WhatsApp"), además de sugerirlo cuando un `@usuario` ya está registrado (409).
- **Solicitud de vinculación con WhatsApp al crear el primer reto**:
  - En `CrearRetoForm` (`created-challenge-card`), tras crear un reto, si el usuario aún no tiene su WhatsApp vinculado, se muestra el bloque de vinculación mediante mensaje inverso (`POST /auth/whatsapp/link-token`, código `VINC-XXXXXX` y botón a WhatsApp con bono de +50 monedas).
  - El perfil del usuario autenticado (`AuthUser` / `UserProfileSummary`) expone `whatsappLinked: boolean` para saber si ya vinculó su número.
- **Cierre de sesión en `/perfil`**:
  - Botón para cerrar la sesión local (`setSession(null)`) y permitir cambiar de cuenta o probar el reingreso.

## Capabilities

### New Capabilities
- *(Ninguna capacidad nueva de nivel raíz; se amplía `onboarding-whatsapp`)*

### Modified Capabilities
- `onboarding-whatsapp`: Se agregan los requisitos de puerta de entrada dual desde el sitio web (`/entrar` para nuevo perfil vs. ya tengo perfil con redirección automática si hay sesión), flujo completo de extremo a extremo en la web para recuperar sesión vía enlace mágico de WhatsApp (`/auth/magic` y `GET /auth/whatsapp/login-url`), y solicitud de vinculación con WhatsApp al crear el primer reto.

## Impact

- **Backend (`apps/api`)**:
  - `AuthController` / `AuthService`: nuevo endpoint público `GET /auth/whatsapp/login-url` y campo `whatsappLinked: boolean` en las respuestas de sesión y perfil.
- **Frontend (`apps/web`)**:
  - Nuevas rutas `apps/web/app/entrar/page.tsx` y `apps/web/app/auth/magic/page.tsx`.
  - Nuevo componente reutilizable `WhatsappLinkPromptCard` (usado en `CrearRetoForm.tsx` al crear el reto y en `InvitePageClient.tsx`).
  - Actualización de `InstantAuthCard.tsx` y `PerfilClient.tsx` para ofrecer el acceso "Ya tengo perfil — Entrar con WhatsApp" y cierre de sesión.
- **Tests E2E (`apps/web/e2e`)**:
  - Pruebas de `/entrar` (modo nuevo, modo ingresar y redirección con sesión activa), `/auth/magic` (canje válido y token expirado) y aviso de vinculación de WhatsApp tras crear un reto.

