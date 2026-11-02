## Context

La tipografía se define en `app/layout.tsx` (Outfit y Manrope con `next/font/google`) y se expone en `globals.css` como `--font-display` y `--font-body`. Los colores de texto son tokens (`on-surface`, `on-background`, `ink-navy-deep`, `on-surface-variant`, `ink-navy`) usados unas 160 veces. El documento `design/kinetic-wayfinder.md` es la fuente de verdad y `e2e/design-tokens.spec.ts` verifica que CSS y documento coincidan.

## Goals / Non-Goals

**Goals:**
- Una sola familia redondeada (Nunito) y gris `#4B4B4B` como texto principal.
- Cambiar solo tokens, sin tocar componentes.

**Non-Goals:**
- Tocar acentos, fondos, radios, sombras o estructura.
- Licenciar fuentes comerciales.

## Decisions

1. **Nunito como única familia.** Variable, autoalojada con `next/font/google`. `--font-display` y `--font-body` apuntan a la misma variable `--font-nunito`; así los componentes no cambian. Alternativas descartadas: Varela Round (un solo peso, sin negritas reales) y Quicksand (más geométrica y menos legible en tamaños chicos).
2. **Pesos.** Display 900/800, headline y title 800, body 600, label 800 (Nunito es más liviana que Manrope a igual peso numérico). Se ajusta el interlineado solo si hay desborde.
3. **Colores.** `on-surface` y `on-background` → `#4B4B4B` (contraste ~8:1 sobre `#F9F9FF`); `ink-navy-deep` → `#4B4B4B`; `on-surface-variant` → `#6B6B6B` (≥4,5:1). Se descarta `#777777`, que sobre `#F9F9FF` queda en ~4,3:1.
4. **`ink-navy` (`#182945`) no cambia**, por pedido, para el texto sobre amarillo y verde.
5. **Fuente de verdad.** Primero el documento de diseño, luego `globals.css`, luego el test, para que `design-tokens.spec.ts` siga validando el vínculo.

## Risks / Trade-offs

- **Ancho de Nunito:** más ancha que Outfit/Manrope; puede romper líneas en botones y etiquetas a 360 px → revisión visual y test de desborde.
- **Jerarquía por color más débil:** el gris `#4B4B4B` y `#6B6B6B` están más cerca entre sí; la jerarquía depende del tamaño y del peso.
- **Algunas capturas y snapshots** pueden cambiar de aspecto; no hay pruebas visuales automatizadas, solo las de tokens.
- **Cambio paralelo `add-3d-buttons`:** toca otros tokens; no hay conflicto de archivos salvo `globals.css` y el documento de diseño.

## Open Questions

- Ninguna pendiente; el contraste de `#6B6B6B` se confirma en las pruebas.

