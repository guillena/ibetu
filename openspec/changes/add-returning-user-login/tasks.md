## 1. Backend: URL de Login por WhatsApp y Estado de Vinculación

- [x] 1.1 Exponer `whatsappLinked: boolean` (`Boolean(user.phone)`) en la respuesta de usuario de `AuthService.buildAuthResponse` (`apps/api/src/auth/auth.service.ts`) y en `UsersService` (`apps/api/src/users/users.service.ts`).
- [x] 1.2 Agregar el método `getWhatsappLoginUrl()` en `AuthService` y el endpoint público `GET /auth/whatsapp/login-url` en `AuthController` (`apps/api/src/auth/auth.controller.ts`) que retorne `{ messageText: "Quiero entrar a mi cuenta IBetU", whatsappUrl: "https://wa.me/..." }`.
- [x] 1.3 Actualizar o agregar tests en `apps/api` para verificar `GET /auth/whatsapp/login-url` y la propiedad `whatsappLinked` en `instant-register` y `magic-login`.

## 2. Frontend: Canje de Magic Link (`/auth/magic`) y Puerta de Entrada (`/entrar`)

- [x] 2.1 Actualizar `AuthUser` en `apps/web/lib/auth-storage.ts` para incluir `whatsappLinked?: boolean` y agregar helper para obtener la URL de login de WhatsApp (`GET /auth/whatsapp/login-url` con fallback local).
- [x] 2.2 Crear la ruta `apps/web/app/auth/magic/page.tsx` que lea `?token=...`, consuma `POST /auth/magic-login` una única vez (protegido contra doble ejecución en StrictMode), guarde la sesión y redirija a `/`, mostrando un estado de error con opción de reintentar por WhatsApp si el token expiró o es inválido.
- [x] 2.3 Crear la ruta `apps/web/app/entrar/page.tsx` que redirija automáticamente a `/` si ya existe sesión activa en `localStorage`, y permita alternar entre `?modo=nuevo` (crear perfil instantáneo) y `?modo=ingresar` (recuperar cuenta con botón 3D "Entrar con mi WhatsApp").
- [x] 2.4 Actualizar `apps/web/components/auth/InstantAuthCard.tsx` y `apps/web/components/perfil/PerfilClient.tsx` para incluir el acceso "¿Ya tenés perfil? Entrá con tu WhatsApp" cuando no hay sesión (y sugerirlo cuando el `@usuario` está ocupado) y un botón de "Cerrar sesión" en `/perfil` cuando hay sesión activa.

## 3. Frontend: Vinculación con WhatsApp al Crear el Primer Reto

- [x] 3.1 Crear el componente reutilizable `apps/web/components/auth/WhatsappLinkPromptCard.tsx` que invoque `POST /auth/whatsapp/link-token`, muestre el código `VINC-XXXXXX` y el botón a WhatsApp (conservando `data-testid="whatsapp-reverse-link-box"`, `btn-generate-wsp-token`, `wsp-link-token` y `wsp-send-link`).
- [x] 3.2 Integrar `WhatsappLinkPromptCard` en `apps/web/components/crear/CrearRetoForm.tsx` dentro de la vista de reto recién creado (`created-challenge-card`) cuando el usuario aún no tiene su WhatsApp vinculado (`!session?.user.whatsappLinked`), y también en `PerfilClient.tsx` si la cuenta autenticada no está vinculada.

## 4. Pruebas E2E y Verificación

- [x] 4.1 Agregar tests E2E en Playwright (`apps/web/e2e/returning-login.spec.ts`) cubriendo: `/entrar?modo=nuevo`, `/entrar?modo=ingresar`, redirección automática en `/entrar` con sesión activa, canje exitoso y fallido en `/auth/magic?token=...`, y aparición del bloque `whatsapp-reverse-link-box` al crear el primer reto en `/crear`.
- [x] 4.2 Ejecutar la suite de tests y validar que no existan regresiones.

