## Context

Los botones se escriben en línea con clases Tailwind (`bg-primary-container text-on-primary shadow-level-3 touch-target …`): unos 41 en 10 archivos y 4 variantes dominantes (azul 18 usos, verde 7, celeste claro 5, error 1). Algunos agregan `active:scale-[0.98]`. No existe componente compartido. Las tarjetas usan `shadow-level-2` y no cambian.

## Goals / Non-Goals

**Goals:**
- Un único estilo de botón 3D, con variantes, estado desactivado y movimiento reducido.
- Centralizarlo en un componente para que no vuelva a repetirse.
- Unificar el azul de botones y tabs en `#0099FF` (base `#0077CC`).

**Non-Goals:**
- Tarjetas, chips y tabs no seleccionados en 3D.
- Cambiar los tokens de elevación (`shadow-level-*`).

## Decisions

1. **Base con `box-shadow` sólido, no con borde.** `box-shadow: 0 4px 0 var(--btn-base)`; al presionar, `transform: translateY(4px)` y `box-shadow: 0 0 0`. No cambia el tamaño del botón ni el diseño de la página. Alternativa descartada: `border-bottom`, que desplaza el contenido.
2. **Tokens por variante.** `--btn-fill`, `--btn-base` y `--btn-text` definidos por clase (`.btn-3d--primary`, `--success`, `--soft`, `--danger-soft`). El azul de acción es `#0099FF` (el mismo de los tabs) y su base `#0077CC`; son los tokens `action` y `action-base` del documento de diseño.
3. **Componente `Button` (`components/ui/Button.tsx`).** Props: `variant`, `size` (`md`, `fab`), `href` (renderiza `Link`) o `onClick`, y `disabled`. Un solo lugar que aplica las clases. Alternativa descartada: solo clases utilitarias, que dejaría 41 copias del patrón.
4. **FAB (`+`).** Variante `size="fab"` con base de 6 px (`translateY(6px)` al presionar) y diámetro mayor. Usa el mismo relleno y base que los botones azules (sin excepción). Conserva el borde blanco de 4 px que lo separa de la barra.
5. **Desactivado.** Relleno gris `#E1E4EA`, texto `#9AA0AA`, sin base y `pointer-events: none`.
6. **Movimiento reducido.** Bajo `@media (prefers-reduced-motion: reduce)` se elimina la transición, no el cambio de estado.
7. **Migración mecánica.** Se sustituyen las clases en línea por `Button` o por `.btn-3d`. Se retira `active:scale-[0.98]`.
8. **Tabs seleccionados en 3D.** `CurrencySwitch` (`radiogroup` de 56 px con tabs de 48 px) y las pestañas de `RetosFeed` aplican `.btn-3d btn-3d--primary` solo al seleccionado; el resto conserva su aspecto plano. El contenedor gana espacio inferior para contener la base de 4 px (sin recortarla con `overflow`). Se mantienen `role`, `aria-checked` y `data-testid`.

## Risks / Trade-offs

- **Muchos archivos tocados:** riesgo de regresiones → los tests e2e existentes localizan por rol y `data-testid`; se ejecutan completos.
- **Altura de la base:** 4 px extra bajo el botón puede apretar los espaciados → se compensa con margen inferior en los contenedores donde importe.
- **Contraste del texto blanco:** sobre `#0099FF` ronda 3:1, por debajo de AA para texto normal (4,5:1). Es decisión del usuario para tener un único azul con los tabs; las etiquetas son negrita (peso 800), lo que ayuda a la legibilidad pero no cumple el criterio. Si se quiere cumplir, queda como alternativa oscurecer el azul de todos los elementos.
- **Altura de los tabs 3D:** la base de 4 px puede hacer crecer los contenedores y empujar el contenido; se verifica a 360 px.
- **Foco visible:** el anillo de foco actual (`outline` 2 px) se mantiene sobre el botón; se verifica que no quede tapado por la base.
- **Cambio paralelo `update-typography-text-color`:** comparte `globals.css` y el documento de diseño.

## Open Questions

- Si algún botón actual (por ejemplo el de `AppHeader`) debe quedarse plano por tratarse de navegación y no de acción. Se asume que solo los enlaces y botones de acción pasan a 3D.

