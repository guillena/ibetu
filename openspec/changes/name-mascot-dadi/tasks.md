# Tasks

## 1. Texto alternativo de la mascota

- [ ] 1.1 Definir una constante única con el texto "Dadi, la mascota de I Bet U" en el código de `apps/web` y usarla como `alt` en `components/shell/AppHeader.tsx` y en `components/invitacion/InvitePageClient.tsx`, verificando que el nombre accesible del link del encabezado ("I Bet U, ir a Retos") no cambie.
- [ ] 1.2 Actualizar `e2e/shell.spec.ts` para buscar la imagen por el nuevo texto alternativo y agregar una verificación en `e2e/invitacion.spec.ts` de que la mascota de `/r/[code]` también se anuncia como "Dadi, la mascota de I Bet U".

## 2. Verificación

- [ ] 2.1 Agregar una prueba que recorra las pantallas principales y confirme que la palabra "Dadi" no aparece como texto visible (solo en `alt`), y correr `npm run build` y la suite de Playwright de `apps/web` sin fallas.

