# Proposal

## Why

La barra superior ocupa dos filas (unos 120 px) por un switch `Monedas / Plata` a todo el ancho que solo cambia el texto del chip de saldo y deja predefinido el modo de Crear reto. En un celular de 360 px esos 60 px extra de header cuestan espacio útil en todas las pantallas. Además, el selector ya existe dentro de Crear reto, que es donde realmente importa. Se busca un header de una sola fila con un control compacto y con estilo de juego.

## What Changes

- El header pasa a **una sola fila**: se elimina la segunda fila con el switch a todo el ancho y `--shell-header-h` baja de 7,5 rem a unos 3,5 rem.
- El chip de saldo se convierte en un **chip conmutador** de dos partes:
  - **Saldo** (izquierda): icono y valor del modo actual (🪙 saldo de monedas, o 💵 "Amigos" en Plata). **Al tocarlo lleva al Monedero.**
  - **Conmutador** (derecha): mini botón 3D con una base de 3 px que muestra el icono del otro modo y alterna Monedas ⇄ Plata. Es accesible como interruptor (`role="switch"`).
- En **Crear reto**, el selector Monedas / Plata pasa a **botones 3D** (seleccionado en azul `#0099FF`, no seleccionado blanco con borde y base grises) y mantiene sus `data-testid`.
- **Cada reto arranca con el último modo usado**: el modo ya se guarda en el navegador; el formulario deja de arrancar siempre con el monto de monedas (`10`) y usa el monto por defecto del modo guardado (`1000` en Plata).
- Los dos selectores (header y Crear) comparten un solo estado: cambiar uno actualiza el otro.

### Fuera del alcance

- Filtrar listas (Retos, Historial) por modo.
- Cambiar cómo se guarda el modo (sigue en `localStorage`, clave `ibetu:mode`).
- Cambiar el contenido del Monedero.
- Cambiar los tabs de Retos ni la barra inferior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `ui-kinetic-wayfinder`: la barra superior pasa a una fila con chip conmutador (requisito de navegación) y el bloque de apuesta de Crear reto usa un selector 3D con el último modo (requisito del flujo de creación).

## Impact

- Código: `components/shell/AppHeader.tsx`, `BalanceChip.tsx`, `CurrencySwitch.tsx` (se elimina o se reemplaza por el conmutador), `components/crear/CrearRetoForm.tsx`, `app/layout.tsx` y `app/globals.css` (`--shell-header-h`).
- Documentación: `design/kinetic-wayfinder.md` (header y chip) y la spec `ui-kinetic-wayfinder`.
- Pruebas: `e2e/shell.spec.ts` (hoy usa `radiogroup`, `radio` y el alto del header) y `e2e/botones-3d.spec.ts`; se añaden pruebas del chip y de Crear.
- Depende visualmente del estilo `.btn-3d` del cambio `add-3d-buttons` (ya implementado, aún sin archivar).
- Sin cambios de API ni de dependencias.

