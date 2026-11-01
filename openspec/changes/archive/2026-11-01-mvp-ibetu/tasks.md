# Tasks: Implementación del MVP de I Bet U

## 1. Configuración de Monorepo, Base de Datos y Entorno Base

- [x] 1.1 Inicializar el monorepo (`apps/api` con NestJS + TypeScript, `apps/web` con Next.js + Tailwind CSS, `packages/shared` para tipos comunes) y verificar que `npm run build` compile todos los paquetes sin errores.
- [x] 1.2 Configurar `docker-compose.yml` con PostgreSQL y Redis para desarrollo local y verificar la conexión mediante un script de healthcheck.
- [x] 1.3 Definir el esquema inicial en Prisma (`User`, `Friendship`, `Challenge`, `ChallengeEvent`, `WalletTransaction`) con índices únicos de idempotencia y verificar que `npx prisma migrate dev` aplique la migración correctamente.

## 2. Onboarding sin Fricción, Amigos y Vinculación por WhatsApp

- [x] 2.1 Implementar el registro instantáneo (`POST /auth/instant-register`) con Nombre + `@usuario`, emisión de JWT de larga duración y acreditación inicial de 50 monedas (`bonus_init:<userId>`), verificando con tests unitarios el rechazo de `@usuario` duplicados.
- [x] 2.2 Implementar el generador de tokens temporales de vinculación (`POST /auth/whatsapp/link-token`) y el webhook receptor del Mensaje Inverso (`POST /webhooks/whatsapp`), verificando con tests de integración que vincule el teléfono remitente y acredite las +50 monedas (`bonus_wsp:<userId>`) una única vez.
- [x] 2.3 Implementar la recuperación de cuenta sin contraseña vía WhatsApp (envío de Magic Link de un solo uso al recibir mensaje en el bot y validación en `POST /auth/magic-login`), verificando con tests automatizados la expiración y el uso único del token.
- [x] 2.4 Implementar la creación automática de amistad bidireccional al aceptar un reto por link y el listado de amigos (`GET /friends`), verificando con tests de integración que ambos usuarios aparezcan en sus respectivas listas y que se acredite el premio por viralidad (+30 monedas) cuando el invitado vincule su WhatsApp y active su primer reto.

## 3. Motor Contable Dual (Monedas y Plata) e Idempotencia

- [x] 3.1 Implementar el servicio transaccional `WalletService` en PostgreSQL usando `SELECT ... FOR UPDATE` y claves `idempotencyKey` para reserva (`RESERVE`), liquidación (`PAYOUT`) y reembolso (`REFUND`), verificando con tests de concurrencia (10 peticiones paralelas sobre el mismo reto) que el premio se acredite exactamente una vez.
- [x] 3.2 Implementar la lógica del Premio de Constancia de 3 días consecutivos (+30 monedas al cerrar al menos 1 reto limpio con ganador por día durante 3 días seguidos), verificando con tests unitarios que los retos empatados o cancelados no sumen al contador diario y que el ciclo se reinicie al tercer día.
- [x] 3.3 Implementar el endpoint del Salvavidas diario (`POST /wallet/lifeline`, +20 monedas si el saldo total disponible + reservado es menor a 10 y pasaron 24h) y la recompensa de +5 monedas para el Juez, verificando todas las restricciones mediante tests unitarios.
- [x] 3.4 Implementar el flujo de confirmación de pago P2P para retos en modo `Plata` ("Ya transferí" por el perdedor y "Pago recibido" o reclamo de incumplimiento por el ganador), verificando mediante tests de integración los cambios de estado del acuerdo.

## 4. Ciclo de Vida del Desafío, Disputas, Juez y Relojes (BullMQ)

- [x] 4.1 Implementar los endpoints de creación (`POST /challenges` con soporte de Presets, modo `COINS`/`CASH` y `expiresAt`), aceptación (`POST /challenges/:id/accept`) y cancelación/rechazo previo, verificando con tests de integración el paso de `PENDING` a `ACTIVE` con reserva de monedas y el registro en la bitácora (`ChallengeEvent`).
- [x] 4.2 Implementar el servicio de URLs pre-firmadas hacia Cloudflare R2 y el endpoint para adjuntar foto/video opcional al reto (`POST /challenges/:id/evidence`), verificando con tests que el evento quede asentado en la bitácora.
- [x] 4.3 Implementar el endpoint de declaración de resultado (`POST /challenges/:id/declare` con opciones `WIN`, `LOSS`, `DRAW`) y la posibilidad de cambiar el voto en cualquier momento mientras el reto siga en `RESULT` o `DISPUTE`, verificando con tests de integración el cierre inmediato por coincidencia, el reembolso por empate y la apertura de disputa por contradicción.
- [x] 4.4 Implementar la propuesta y aprobación consensuada del tercer amigo Juez (`POST /challenges/:id/judge/propose`, `POST /challenges/:id/judge/approve`) y el fallo del Juez (`POST /challenges/:id/judge/verdict`), verificando con tests que solo un Juez aprobado por ambos pueda laudar y reciba sus +5 monedas.
- [x] 4.5 Configurar los 3 workers de BullMQ en Redis (`challenge-expire`, `declare-timeout-24h`, `judge-timeout-48h`) con cancelación determinística de jobs, verificando con tests de reloj simulado (fake timers) la devolución por vencimiento sin votos, la adjudicación automática a las 24h de silencio y la liberación del Juez a las 48h.
- [x] 4.6 Implementar el listado de retos abiertos del usuario (`GET /challenges`), con cada reto clasificado como `En Juego`, `Por Declarar`, invitación recibida o invitación enviada y con su rival, pozo, plazos y si requiere una acción del usuario, verificando con tests de integración y de API la clasificación por estado, el orden y que cada usuario vea solo sus retos.

## 5. Termómetro de Credibilidad (% Fair Play) e Historial

- [x] 5.1 Implementar el servicio `CredibilityService` que recalcula el porcentaje y estado del Termómetro de Credibilidad al cerrarse cada reto (sube por acuerdo limpio ganes o pierdas, neutro por timeout de 24h, baja fuerte por perder disputa ante Juez o incumplir pago en modo `Plata`), verificando cada regla con tests unitarios.
- [x] 5.2 Implementar los endpoints de perfil e historial competitivo entre amigos (`GET /users/:id/profile`, `GET /challenges/history`), verificando con tests de API que devuelvan victorias totales, porcentaje de `% Fair Play` y listado de retos cerrados sin exponer niveles ni rachas.

## 6. Interfaz Web Móvil (Next.js + Design System Kinetic Wayfinder)

- [x] 6.1 Configurar en `apps/web` el tema Tailwind CSS con los tokens exactos de `Kinetic Wayfinder` (paleta de colores, tipografías `Outfit` y `Manrope`, íconos `Material Symbols Outlined`), el Header con el switch `Monedas / Plata` y la barra de navegación inferior (`Retos`, `Amigos`, `+ Crear`, `Monedero`, `Historial`), verificando el renderizado responsivo móvil.
- [x] 6.2 Construir la pantalla principal `Retos` con las 3 pestañas en píldora (`En Juego`, `Por Declarar`, `Invitaciones`), el indicador de `% Fair Play` y las tarjetas de desafíos sin jerga de tránsito, verificando con tests de componentes la filtración por estado.
- [x] 6.3 Construir la pantalla `Crear Reto` en 3 bloques (selector de amigo o link de WhatsApp, descripción con píldoras de Presets rápidos sin botón de voz, y apuesta en `Monedas`/`Plata` con fecha de vencimiento), verificando la validación del formulario con tests en el cliente.
- [x] 6.4 Construir la página pública de invitación `/r/[code]` con metadatos OpenGraph dinámicos para WhatsApp y modal de registro instantáneo (Nombre + `@usuario` + botón de Mensaje Inverso para vincular WhatsApp), verificando con tests que `curl -I` / el HTML SSR contenga las etiquetas `og:title` y `og:description` del reto.
- [x] 6.5 Construir las vistas de `Detalle del Reto` (cuenta regresiva, barra 50/50 del pozo, reproductor/subida de evidencia opcional y bitácora) y `Declarar Resultado / Disputa` (3 botones de votación, botón para cambiar voto en vivo y flujo para proponer/aprobar/votar como 3er amigo Juez), verificando con tests los estados visuales.
- [x] 6.6 Construir las vistas de `Monedero` (saldo disponible y en juego, progreso de los 3 días de Constancia, botón Salvavidas e historial de movimientos) y `Amigos / Historial`, verificando la visualización de datos reales desde la API.

## 7. Verificación End-to-End (E2E) del Flujo Principal

- [x] 7.1 Ejecutar suite de tests E2E (Playwright) cubriendo el circuito completo: Jugador A crea reto de 10 monedas -> comparte link -> Jugador B se registra desde el link y acepta (20 monedas en reserva) -> ambos declaran resultado (caso coincidencia y caso disputa resuelta por Juez C) -> se liquida el pozo una única vez y se actualiza el `% Fair Play`.

