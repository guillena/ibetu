# Proposal: Nombre de la mascota (Dadi)

## Why

La mascota de I Bet U (el dado rojo con gorra azul) ya está en el favicon y en el encabezado, pero todavía no tiene nombre. Nombrarla como **Dadi** deja una identidad consistente en la interfaz, en la accesibilidad y en la documentación del producto.

## What Changes

- La mascota se llama **Dadi**: el texto alternativo de sus imágenes pasa a "Dadi, la mascota de I Bet U" en el encabezado y en la página pública de invitación.
- Se agrega a la spec de interfaz un requisito con el nombre oficial de la mascota.
- Sin cambios visibles de texto en pantalla: Dadi no aparece escrito en la interfaz ni en los mensajes de WhatsApp.

### Fuera del alcance

- Dar voz a la mascota en la interfaz (estados vacíos, mensajes de WhatsApp, avisos). Queda para un cambio posterior si se quiere.
- Cambiar el aspecto de la mascota, el favicon o la paleta.

## Capabilities

### New Capabilities

### Modified Capabilities
- `ui-kinetic-wayfinder`: se agrega un requisito que fija el nombre de la mascota (Dadi) y su uso como texto alternativo.

## Impact

- Web (`apps/web`): `components/shell/AppHeader.tsx` y `components/invitacion/InvitePageClient.tsx` (texto alternativo) y `e2e/shell.spec.ts` (la prueba de la mascota busca el texto alternativo actual).
- Sin cambios en la API ni en la base de datos.
- Dependencia de orden: el requisito nuevo es independiente del de `add-mascot-branding` (que sigue activo), por lo que ambos cambios se pueden archivar en cualquier orden.

