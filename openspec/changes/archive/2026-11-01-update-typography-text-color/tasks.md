## 1. Documento de diseño

- [x] 1.1 Reemplazar `Outfit` y `Manrope` por `Nunito` en `typography` y en la prosa de `design/kinetic-wayfinder.md`, con los nuevos pesos
- [x] 1.2 Actualizar `on-surface`, `on-background`, `ink-navy-deep` a `#4B4B4B` y `on-surface-variant` a `#6B6B6B`; conservar `#182945` para acciones amarillas y verdes

## 2. Código

- [x] 2.1 `app/layout.tsx`: cargar Nunito (variable, autoalojada) en lugar de Outfit y Manrope
- [x] 2.2 `app/globals.css`: apuntar `--font-display` y `--font-body` a Nunito y actualizar los pesos de los estilos tipográficos
- [x] 2.3 `app/globals.css`: actualizar los tokens de color de texto
- [x] 2.4 Revisar el único componente con color o fuente escrito a mano y alinearlo a los tokens

## 3. Pruebas y especificación

- [x] 3.1 Actualizar `e2e/design-tokens.spec.ts` (familias `Nunito`, colores y pesos del documento)
- [x] 3.2 Añadir una comprobación de contraste mínimo del texto principal (7:1) y secundario (4,5:1) sobre `#F9F9FF`
- [x] 3.3 Revisar las pantallas a 360, 375 y 414 px sin desborde horizontal
- [x] 3.4 Ejecutar build, lint, `tsc` y las pruebas e2e; luego `openspec validate update-typography-text-color`

