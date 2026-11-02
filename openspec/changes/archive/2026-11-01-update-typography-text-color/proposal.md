# Proposal

## Why

La interfaz usa Outfit para títulos y Manrope para el cuerpo, con un azul marino casi negro como color de texto. Se busca un aspecto más amigable y redondeado, cercano al de Duolingo, que acompañe a los personajes ilustrados sin perder la identidad de I Bet U. Duolingo usa fuentes comerciales (Feather Bold y DIN Next Rounded), por lo que se adopta **Nunito**, la alternativa libre más cercana, junto con su gris carbón `#4B4B4B` para el texto.

## What Changes

- Se reemplazan Outfit y Manrope por **Nunito** (una sola familia variable, autoalojada con `next/font`) en títulos, cuerpo y etiquetas, con pesos mayores en títulos (800–900).
- El texto principal pasa a **`#4B4B4B`**: `on-surface`, `on-background` e `ink-navy-deep`.
- El texto secundario (`on-surface-variant`) pasa a un gris más claro, **`#6B6B6B`**, que mantiene al menos 4,5:1 de contraste sobre `#F9F9FF`.
- Se **mantiene** el azul marino `#182945` (`ink-navy`) como texto sobre acciones saturadas amarillas y verdes.
- Se actualizan el documento de diseño, la spec y el test de tokens para reflejar la nueva tipografía y los nuevos colores.

### Fuera del alcance

- Cambiar los colores de acento (azul, verde, amarillo, naranja), fondos, radios, espacios o sombras.
- Botones o tarjetas en 3D (cambio `add-3d-buttons`).
- Cargar Feather Bold o DIN Next Rounded (son comerciales).

## Capabilities

### New Capabilities

### Modified Capabilities
- `ui-kinetic-wayfinder`: el requisito de tokens visuales cambia la tipografía (Nunito) y el color de texto principal (`#4B4B4B`).

## Impact

- Código: `apps/web/app/layout.tsx` y `apps/web/app/globals.css`.
- Documentación: `apps/web/design/kinetic-wayfinder.md`.
- Pruebas: `apps/web/e2e/design-tokens.spec.ts` (familias y colores del documento).
- Especificación: `openspec/specs/ui-kinetic-wayfinder/spec.md`.
- Posible reflujo en etiquetas largas a 360 px por el ancho de Nunito; se revisa en las tareas.
- Se relaciona con el cambio `add-3d-buttons` (independiente; pueden aplicarse en cualquier orden).

