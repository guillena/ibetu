# Proposal

## Why

Los botones de I Bet U son planos con una sombra azul difusa y se repiten a mano (unos 41 en 10 archivos, sin componente compartido). Se busca un aspecto táctil y lúdico como el de Duolingo ("Get Started" e "I already have an account"): un botón con una base sólida más oscura que se hunde al presionarlo. Encaja con los personajes ilustrados y refuerza que cada acción es "pulsable".

## What Changes

- Los **botones** pasan a un estilo **3D**: relleno de color, base inferior sólida de 4 px más oscura y, al presionar, el botón baja y la base desaparece.
- El botón principal usa el **mismo azul brillante `#0099FF`** que los tabs seleccionados (Monedas/Plata y las pestañas de Retos), con la **base en `#0077CC`**. Se acepta que el texto blanco quede en ~3:1 de contraste (por debajo de AA para texto normal), igual que los tabs actuales; así se mantiene una sola familia de azul.
- Variantes: **principal** (azul), **éxito** (verde), **suave** (secundaria: fondo blanco, borde gris claro de 2 px, base gris y texto azul) y **peligro suave** (error).
- Se crea un componente **`Button`** y las clases `.btn-3d` en `globals.css`, y se migran los botones existentes.
- El botón central **`+`** de la barra inferior tiene una versión **más llamativa**: base de 6 px y mayor tamaño, con el mismo relleno `#0099FF` y base `#0077CC` que el resto de los botones azules.
- Los **tabs seleccionados** (switch `Monedas / Plata` y pestañas de Retos: `En Juego`, `Por Declarar`, `Invitaciones`) pasan a 3D con la misma profundidad de 4 px que los botones: relleno `#0099FF` y base `#0077CC`. Los tabs no seleccionados siguen planos.
- Hay un estado **desactivado** (gris, sin base ni movimiento) y se respeta **`prefers-reduced-motion`** (sin animación al presionar).
- Se reemplaza el `active:scale` ad hoc de algunos botones por el nuevo efecto.

### Fuera del alcance

- **Tarjetas:** se quedan como están (sombra suave `shadow-level-2`).
- **Chips, tabs no seleccionados y barra inferior** (salvo el `+`): siguen planos.
- Cambiar tipografía o color de texto (cambio `update-typography-text-color`).
- Cambiar los niveles de elevación existentes; `shadow-level-3` se conserva como token aunque los botones ya no lo usen.

## Capabilities

### New Capabilities
- `ui-action-buttons`: estilo, variantes, estados y comportamiento de los botones de acción (3D, desactivado y movimiento reducido).

### Modified Capabilities

## Impact

- Código: `apps/web/app/globals.css`; nuevo `apps/web/components/ui/Button.tsx`; migración en `AmigosClient`, `InstantAuthCard`, `CrearRetoForm`, `InvitePageClient`, `MonederoClient`, `ChallengeDetailClient`, `RetosFeed`, `AppHeader`, `BottomNav`, `EmptyState` y `SectionPage`.
- Documentación y especificación: `design/kinetic-wayfinder.md` (botones y color de acción) y nueva spec `ui-action-buttons`.
- Pruebas: `e2e/design-tokens.spec.ts` sigue exigiendo los cuatro niveles de elevación (no cambian); se añaden pruebas del botón 3D.
- Sin cambios de API ni de dependencias.

