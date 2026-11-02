## 1. Estilo base

- [x] 1.1 `globals.css`: tokens `--btn-fill`, `--btn-base` y `--btn-text`, y el azul de acción `#0077CC` con base `#005A9E`
- [x] 1.2 `globals.css`: clases `.btn-3d` con base de 4 px, hundimiento al presionar y variantes `primary`, `success`, `soft` y `danger-soft`
- [x] 1.3 `globals.css`: estado desactivado y `prefers-reduced-motion`
- [x] 1.4 Actualizar `design/kinetic-wayfinder.md` (sección Buttons y color de acción)

## 2. Componente

- [x] 2.1 Crear `components/ui/Button.tsx` con `variant`, `size` (`md` y `fab`), `href` u `onClick` y `disabled`
- [x] 2.2 Verificar área táctil de 48 px y anillo de foco visible sobre la base

## 3. Migración

- [x] 3.1 Migrar los botones de `RetosFeed`, `AmigosClient` y `EmptyState`
- [x] 3.2 Migrar los de `CrearRetoForm`, `InstantAuthCard` y `InvitePageClient`
- [x] 3.3 Migrar los de `MonederoClient`, `ChallengeDetailClient`, `SectionPage` y `AppHeader`
- [x] 3.4 `BottomNav`: botón `+` con `size="fab"` conservando `aria-label="Crear reto"`
- [x] 3.5 Retirar `shadow-level-3` y `active:scale` de los botones migrados; dejar tarjetas y chips planos

- [x] 3.6 `+` central: relleno `#0099FF` y base `#0077CC` (el resto de los botones conserva `#0077CC`); actualizar la sección Buttons del documento de diseño

- [x] 3.7 Unificar el azul de acción en `#0099FF` con base `#0077CC` (tokens `action` y `action-base`, variante primaria y `+`), y actualizar el documento de diseño
- [x] 3.8 `CurrencySwitch`: tab seleccionado en 3D (relleno `#0099FF`, base 4 px) con el contenedor ajustado para contener la base
- [x] 3.9 `RetosFeed`: pestañas `En Juego`, `Por Declarar` e `Invitaciones` con el seleccionado en 3D; los no seleccionados planos

## 4. Verificación

- [x] 4.1 Añadir pruebas e2e: base visible, hundimiento al presionar, desactivado, FAB y contraste del botón principal
- [x] 4.2 Ejecutar las pruebas e2e existentes sin regresiones
- [x] 4.3 Revisar las pantallas a 360, 375 y 414 px sin desborde horizontal ni base tapada
- [x] 4.4 Ejecutar build, lint, `tsc` y `openspec validate add-3d-buttons`
- [x] 4.5 Actualizar `shell.spec.ts` y `botones-3d.spec.ts` para el nuevo azul del `+` y comprobar su contraste de ícono (3:1)
- [x] 4.6 Actualizar las pruebas que esperan `#0077CC` en botones (`botones-3d.spec.ts`) y el `+`; añadir pruebas de tabs 3D (seleccionado con base, no seleccionado plano, hundimiento al presionar)
- [x] 4.7 Revisar a 360, 375 y 414 px que los tabs 3D no desbordan ni recortan la base
