# Proposal: Mascota de I Bet U como identidad de marca (favicon e ícono del encabezado)

## Why

La marca hoy se representa con un ícono genérico de Material Symbols (una carita sobre un círculo azul) y el favicon por defecto. I Bet U ya tiene mascota propia (un dado rojo con gorra azul y cara pícara), y usarla refuerza la identidad desde la pestaña del navegador y desde el encabezado de la app.

## What Changes

- Se reemplaza el favicon del sitio por la mascota (con versiones para pestaña del navegador y pantalla de inicio del celular).
- Se reemplaza el ícono de marca de la esquina superior izquierda del encabezado por la mascota, manteniendo el link a `Retos` y su área táctil de 48 px.
- La imagen entregada es un `.jpg` de 948×1024 sin transparencia (fondo negro incluido), por lo que se genera una versión con fondo transparente y versiones cuadradas para los íconos.
- Se agrega a la spec de interfaz un requisito de identidad de marca: la mascota es la marca visible en el encabezado y en el favicon.

### Fuera del alcance

- Cambiar la paleta, la tipografía o el resto de los íconos del sistema de diseño.
- Rediseñar la mascota o crear variantes animadas.
- Imagen `og:image` de las invitaciones y logos de otros canales (WhatsApp, redes).

## Capabilities

### New Capabilities

### Modified Capabilities
- `ui-kinetic-wayfinder`: se agrega el requisito de identidad de marca (mascota en el favicon y en el encabezado).

## Impact

- Web (`apps/web`): `components/shell/AppHeader.tsx`, `app/layout.tsx` (metadatos de íconos), `app/favicon.ico` y nuevos archivos de ícono/imagen de la mascota (`app/icon.png`, `app/apple-icon.png`, `public/`).
- Pruebas: `e2e/shell.spec.ts` verifica hoy el encabezado y las áreas táctiles; se suma verificación de la mascota y del favicon.
- Sin cambios en la API ni en la base de datos.
- Riesgo: si el original `.jpg` tiene el fondo negro quemado, el recorte automático puede dejar bordes; lo ideal es contar con el PNG transparente original (ver `design.md`).

