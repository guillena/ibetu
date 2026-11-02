## Context

El header (`AppHeader`) tiene dos filas: marca, `BalanceChip` y perfil arriba, y `CurrencySwitch` (un `radiogroup` de 56 px a todo el ancho) debajo; `--shell-header-h` vale 7,5 rem y `app/layout.tsx` lo usa como padding superior del contenido. El modo (`COINS` / `CASH`) vive en `shell-context` y se guarda en `localStorage` (`ibetu:mode`). `CrearRetoForm` ya tiene su propio selector (`form-mode-coins`, `form-mode-cash`) ligado a ese mismo modo, pero su monto inicial es siempre `"10"`.

## Goals / Non-Goals

**Goals:**
- Header de una sola fila, con el modo accesible desde un chip compacto.
- Selector de Crear reto en 3D.
- Que Crear reto arranque con el último modo y su monto por defecto.

**Non-Goals:**
- Filtrar listas por modo.
- Cambiar el almacenamiento del modo.

## Decisions

1. **Chip de dos partes, no un único botón.** Se pidió que el saldo lleve al Monedero *y* que el chip alterne el modo: ambas acciones no caben en un solo toque. El chip queda dividido: saldo (`Link` a `/monedero`) y mini botón conmutador (`button`, `role="switch"`, `aria-checked` = Plata). Alternativa descartada: toque largo para alternar, poco descubrible y sin soporte accesible claro.
2. **Contenido del chip.** En `Monedas`: 🪙 + saldo (o `-`). En `Plata`: 💵 + "Amigos" (más corto que "Entre amigos" para que quepa a 360 px). El mini botón muestra el icono del **otro** modo, que es el destino del toque. El texto accesible conserva "monedas" / "modo plata".
3. **Mini botón 3D.** Usa `.btn-3d` con una profundidad de 3 px (`--btn-depth: 3px`), tamaño 36 × 36 px y un área táctil de 48 px (padding transparente alrededor). Colores: relleno `#0099FF` y base `#0077CC`, igual que el resto.
4. **Ancho del header.** Marca (40 px + "I Bet U") + chip (~140 px) + perfil (48 px) supera los 328 px útiles a 360 px en `Plata`. Se resuelve ocultando la palabra "I Bet U" por debajo de 400 px de ancho (queda el dado de la mascota como marca) y reduciendo el espacio entre elementos. Alternativa descartada: reducir el chip a solo iconos, que pierde el saldo.
5. **Alto del header.** Se quita la segunda fila (`h-16`) y `--shell-header-h` pasa a 3,5 rem; el padding superior de `layout.tsx` ya suma el safe area, así que no hace falta otro ajuste.
6. **Selector de Crear.** Se mantienen `data-testid="form-mode-coins"` y `form-mode-cash` y `aria-pressed`. Se reemplazan las clases de píldora por `Button`/`.btn-3d`: seleccionado `btn-3d--primary`, no seleccionado `btn-3d--soft`. Dos botones iguales en una cuadrícula de 2 columnas, sin el contenedor tipo píldora.
7. **Último modo en Crear.** El modo persistido ya es el estado global, por lo que Crear lo hereda. Se corrige el monto inicial: `useState(mode === "COINS" ? "10" : "1000")`. `handleModeChange` conserva el reset del monto.
8. **Eliminación de `CurrencySwitch`.** Su lógica de teclado de `radiogroup` (flechas) deja de aplicar. El componente se retira y se reemplaza por el chip conmutador dentro de `BalanceChip`.

## Risks / Trade-offs

- **Descubribilidad del conmutador:** un mini botón con el icono del otro modo puede no ser obvio → el 3D y su sombra lo señalan como pulsable y el nombre accesible lo describe.
- **Espacio horizontal a 360 px:** el modo `Plata` es el más ancho → se prueba a 360 px con el modo en `Plata` y se oculta "I Bet U" por debajo de 400 px.
- **Cambio de comportamiento de los tests:** `shell.spec.ts` espera un `radiogroup` con dos `radio` y un header de dos filas → se reescriben con el nuevo chip.
- **Dependencia del cambio `add-3d-buttons`:** el mini botón y el selector de Crear usan `.btn-3d`, que ya está en el código pero sin archivar.
- **Menos acceso al modo:** el modo ya no está en una barra visible en toda pantalla, pero sigue a un toque en el header.

## Open Questions

- Si el saldo del chip en `Plata` debería seguir llevando al Monedero o hacer otra cosa. Se asume que sí lleva al Monedero.

