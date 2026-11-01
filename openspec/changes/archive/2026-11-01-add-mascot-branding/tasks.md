# Tasks

## 1. Preparar los recursos de la mascota

- [x] 1.1 Guardar el original entregado (`.jpg` 948×1024) en un directorio de recursos fuente del repo y generar `public/brand/mascot.png` con fondo transparente (o usar el PNG transparente original si el usuario lo aporta), verificando que la esquina sea alfa 0 y que no quede halo negro a simple vista sobre fondo `#F9F9FF`.
- [x] 1.2 Generar los íconos cuadrados con margen (`app/icon.png` 512×512, `app/apple-icon.png` 180×180 con fondo claro y `app/favicon.ico` con 16, 32 y 48 px), reemplazando el favicon actual, y verificar sus dimensiones.

## 2. Aplicar la mascota en la interfaz

- [x] 2.1 Reemplazar el ícono de marca de `components/shell/AppHeader.tsx` por la mascota (con `next/image`, `alt` descriptivo, mismo link a `Retos`, nombre accesible "I Bet U, ir a Retos" y área táctil de al menos 48×48 px), verificando con `e2e/shell.spec.ts` que no se rompan las pruebas de encabezado y de áreas táctiles.
- [x] 2.2 Reemplazar el ícono genérico de la marca en `components/invitacion/InvitePageClient.tsx` por la mascota (supuesto a confirmar en `design.md`), verificando que `e2e/invitacion.spec.ts` siga pasando.

## 3. Verificación

- [x] 3.1 Agregar a `e2e/shell.spec.ts` una prueba que confirme la imagen de la mascota en el encabezado (cargada, con `alt`, sin desborde a 360 px) y que el HTML declare los íconos (`rel="icon"` y `rel="apple-touch-icon"`) que responden `200`; correr `npm run build` y la suite de Playwright de `apps/web`.
- [x] 3.2 Revisar visualmente el resultado (capturas del encabezado a 360 y 414 px y del favicon a 16 y 32 px) y ajustar la tolerancia del recorte si hay halo.

