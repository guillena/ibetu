## 1. Header de una fila

- [x] 1.1 `AppHeader.tsx`: quitar la segunda fila con el switch y reubicar el chip entre la marca y el perfil
- [x] 1.2 `globals.css`: bajar `--shell-header-h` de 7,5 rem a 3,5 rem y revisar el padding superior de `layout.tsx`
- [x] 1.3 Ocultar la palabra "I Bet U" por debajo de 400 px y ajustar el espaciado para que no haya desborde a 360 px en modo `Plata`

## 2. Chip conmutador

- [x] 2.1 `BalanceChip.tsx`: parte de saldo como `Link` a `/monedero` (🪙 saldo o 💵 "Amigos") con su texto accesible
- [x] 2.2 `BalanceChip.tsx`: mini botón 3D `role="switch"` con profundidad de 3 px, icono del otro modo, área táctil de 48 px y `aria-checked` según el modo
- [x] 2.3 Retirar `CurrencySwitch.tsx` y sus usos

## 3. Crear reto

- [x] 3.1 `CrearRetoForm.tsx`: selector Monedas / Plata con `Button` 3D (seleccionado `primary`, no seleccionado `soft`), conservando `form-mode-coins`, `form-mode-cash` y `aria-pressed`
- [x] 3.2 `CrearRetoForm.tsx`: monto inicial según el modo guardado (`10` en Monedas, `1000` en Plata)
- [x] 3.3 Comprobar que cambiar el modo en Crear actualiza el chip del header y viceversa

## 4. Documentación y pruebas

- [x] 4.1 Actualizar `design/kinetic-wayfinder.md` (header de una fila, chip conmutador y selector 3D)
- [x] 4.2 Reescribir las pruebas de `e2e/shell.spec.ts` que usan `radiogroup`, `radio` y el alto del header, y las de `botones-3d.spec.ts` sobre el switch
- [x] 4.3 Añadir pruebas del chip: saldo lleva a `/monedero`, el conmutador alterna sin navegar, se recuerda tras recargar, no desborda a 360 px en `Plata`
- [x] 4.4 Añadir pruebas de Crear: selector 3D, arranque en `Plata` con monto `1000` y sincronía con el header
- [x] 4.5 Revisar visualmente a 360, 375 y 414 px, con y sin sesión
- [x] 4.6 Ejecutar build, lint, `tsc`, la suite e2e y `openspec validate compact-currency-switch`

