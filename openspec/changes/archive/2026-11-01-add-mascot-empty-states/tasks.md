## 1. Assets de personajes

- [x] 1.1 Quitar el fondo blanco y recortar los cuatro JPG de `apps/web/design/brand/characters/` (Dadi, Oso, Búho, Zorro)
- [x] 1.2 Exportar a WebP transparente (~512 px, menos de 30 KB cada uno) en `apps/web/public/brand/characters/`
- [x] 1.3 Revisar los recortes sobre fondo blanco y sobre `surface-container-lowest` (sin halos)

## 2. Componente compartido

- [x] 2.1 Crear `apps/web/components/ui/EmptyState.tsx` con `character`, `message`, `action` opcional y `testId`
- [x] 2.2 Definir el mapa de personajes con ruta, tamaño y `alt` de cada uno
- [x] 2.3 Verificar área táctil de 48 px en el botón y ausencia de desplazamiento de diseño

## 3. Integración en pantallas

- [x] 3.1 Retos: usar `EmptyState` con Dadi en las tres pestañas, conservando `retos-empty-state` y los textos
- [x] 3.2 Amigos: usar `EmptyState` con el Oso, conservando `friends-empty-state`
- [x] 3.3 Historial: usar `EmptyState` con el Búho, sin botón, conservando `history-empty-state`
- [x] 3.4 Invitación: Zorro en "Invitación no disponible" y saludo sobre la tarjeta del reto

## 4. Verificación

- [x] 4.1 Ejecutar los tests existentes de las cuatro pantallas
- [x] 4.2 Añadir pruebas del componente `EmptyState` (personaje, mensaje, acción opcional, `testId`)
- [x] 4.3 Revisar las pantallas a 360, 375 y 414 px sin desborde horizontal
- [x] 4.4 Ejecutar lint, typecheck y `openspec validate add-mascot-empty-states`

