# Design: Arquitectura Técnica del MVP de I Bet U

## Context

El proyecto parte desde cero (greenfield). Para validar la hipótesis de viralidad y retención (*ver `proposal.md` - Why*), el producto requiere que un usuario que recibe un enlace por WhatsApp pueda abrir el desafío en menos de un segundo en su celular sin instalar nada, registrarse al instante y operar sobre un monedero donde las monedas reservadas y los premios nunca queden en estado inconsistente. Al mismo tiempo, la arquitectura debe permitir incorporar en el futuro una aplicación móvil nativa en **Flutter (iOS y Android)** reutilizando exactamente el mismo Backend y los activos visuales vectoriales.

Versiones de referencia: Next.js 16 (con *Cache Components*), Tailwind CSS 4, NestJS 12 (módulos ESM), Prisma 6, PostgreSQL 16, Redis 7 y BullMQ 6.

## Goals / Non-Goals

**Goals:**
- Lograr un tiempo de carga inicial menor a 1 segundo al abrir un enlace de invitación desde el navegador integrado de WhatsApp.
- Garantizar **idempotencia estricta** y consistencia **ACID** en todas las operaciones del monedero (reservas, liquidación de premios, reembolsos y bonos).
- Que cada cierre de reto sea **atómico**: estado, liquidación o reembolso, estadísticas, constancia, credibilidad y bitácora se confirman juntos o no se confirma nada.
- Automatizar con precisión los tres relojes asíncronos del negocio (vencimiento del reto, 24 horas de silencio y 48 horas del Juez), de modo que un reloj perdido nunca deje monedas trabadas.
- Desacoplar el 100% de la lógica de negocio en una API Backend única para que el cliente Web actual (Next.js) y el cliente futuro (Flutter) consuman los mismos endpoints.

**Non-Goals:**
- Integrar pasarelas bancarias o procesadores de pago con custodia de fondos reales en esta etapa.
- Construir motores de emparejamiento público, geolocalización en tiempo real o mensajería de chat propia.
- Modo oscuro y diseño de varias columnas para tablet y escritorio: la interfaz es una columna pensada para el celular.

## Decisions

### 1. Frontend Web Móvil en Next.js (React + TypeScript) + Tailwind CSS con Design System `Kinetic Wayfinder`
- **Decisión:** Construir el cliente del MVP como una aplicación web móvil progresiva (PWA) en **Next.js (App Router)** estilizada con **Tailwind CSS 4**, adoptando los tokens de `Kinetic Wayfinder` (`Outfit`, `Manrope`, `Material Symbols Outlined`). **Framer Motion** y las animaciones vectoriales **Lottie/Rive** se incorporan cuando las pantallas las necesiten.
- **Por qué:** Next.js permite Server-Side Rendering (SSR) para generar etiquetas **OpenGraph dinámicas** en los enlaces de invitación (`/r/[code]`) y entrega HTML ultraliviano en el primer byte (< 1 seg en 4G). Además, los archivos `.lottie` / `.riv` se reutilizarán sin cambios cuando se desarrolle la app nativa en Flutter.
- **Alternativas descartadas:**
  - *Flutter Web para el MVP:* Descartado para la etapa inicial de validación por link porque descarga un runtime pesado (CanvasKit/Wasm de varios MB) que demora entre 3 y 6 segundos en redes móviles dentro de WhatsApp, afectando la conversión del invitado.
- **Design System como fuente de verdad en el repositorio:** el documento de Stitch vive en `apps/web/design/kinetic-wayfinder.md` y los tokens se transcriben en `app/globals.css` dentro de `@theme` (Tailwind 4 define los tokens en CSS, no en un `tailwind.config`). Una prueba de Playwright compara cada color, radio, espaciado, sombra y los 14 estilos tipográficos contra ese documento, usando el navegador como árbitro para que la minificación del CSS no dé falsos resultados. Los tres colores que el documento nombra solo en su texto (`#00C853`, `#FFC400`, `#182945`) se declaran como `signal-green`, `signal-amber` e `ink-navy`.
- **Fuentes e íconos:** `Outfit` y `Manrope` se autoalojan con `next/font/google`. `Material Symbols Outlined` no está disponible en `next/font`, así que se usa el paquete oficial `material-symbols` (archivo `.woff2` variable, sin pedir nada a Google en ejecución).
- **Decisiones de interfaz confirmadas:**
  1. **Encabezado fijo de dos filas** (marca, saldo y perfil arriba; el switch `Monedas / Plata` debajo, a todo el ancho). En una sola fila no entraba en 360 px respetando el área táctil mínima de 48 px que exige el sistema.
  2. **En modo Plata el chip del saldo dice "Entre amigos"**, no un número: la app no custodia dinero, así que no existe un saldo de plata.
  3. **El saldo muestra `—` mientras no hay sesión**; nunca se inventan cifras.
  4. **Columna única de 480 px máximo**, centrada en pantallas anchas.
  5. **Zoom del usuario habilitado**: no se usa `maximum-scale=1` ni `user-scalable=no`.
  6. **Sin modo oscuro**: el sistema está pensado para luz de día.
- **Estructura:** el grupo de rutas `(app)` envuelve las pantallas con la barra superior y la navegación inferior (Retos, Amigos, `+ Crear`, Monedero, Historial, más `/perfil`); las pantallas públicas, como la invitación a un reto, quedan fuera del grupo y no la usan. El modo `Monedas / Plata` se guarda en `localStorage` y se lee con `useSyncExternalStore` (el servidor siempre renderiza Monedas y el cliente se ajusta sin errores de hidratación).
- **Verificación:** pruebas de Playwright sobre la compilación de producción en 5 tamaños (360, 375, 414, 768 y 1280 px): sin desborde horizontal, contenido no tapado por las barras fijas, áreas táctiles de al menos 48 px, íconos dibujados como símbolos, ausencia de errores de consola o de red, y ausencia del vocabulario de autos y tránsito de las pantallas de ejemplo.

### 2. Backend Central Desacoplado en Node.js + TypeScript (NestJS)
- **Decisión:** Implementar un servidor API modular en **NestJS (TypeScript)** estructurado por dominios: `Auth`, `Friends`, `Wallet` (monedero y constancia), `Challenges` (retos, resultados, Juez, evidencia, relojes e historial), `CashPayments`, `Credibility`, `Profile`, `Whatsapp`, `Storage` y `Clocks`.
- **Por qué:** Permite compartir tipos y contratos DTO en un monorepo TypeScript con el Frontend Next.js hoy, y expone una API REST limpia para conectar el futuro cliente en Flutter sin reescribir reglas de negocio.
- **Convenciones:** la sesión es un JWT de larga duración (365 días) que se envía como `Authorization: Bearer`; toda inyección de dependencias usa `@Inject()` explícito (no depende de metadatos de decoradores, por lo que funciona igual bajo Vitest).

### 3. Base de Datos PostgreSQL + Prisma ORM con Patrón Idempotent Ledger
- **Decisión:** Utilizar **PostgreSQL** con bloqueos pesimistas (`SELECT ... FOR UPDATE`) y claves únicas de idempotencia (`idempotencyKey`) en los asientos (`WalletTransaction`, `CredibilityEvent`).
- **Por qué:** La regla técnica crítica exige que cada premio se acredite **exactamente una vez** y que el saldo coincida siempre con el historial.
- **Invariante contable:** `WalletTransaction.amount` es el cambio sobre `coinsAvailable`, por lo tanto `coinsAvailable` siempre es igual a la suma de los asientos del usuario. Las monedas reservadas se llevan aparte en `coinsReserved`.
- **Modelo de datos central:**

  | Tabla | Contenido principal |
  |---|---|
  | `User` | `username` único, `whatsappPhone` único, `paymentAlias`, `invitedById`, `coinsAvailable`, `coinsReserved`, `totalPlayed`, `totalWins`, contadores de credibilidad (`cleanClosedCount`, `disputeLostCount`, `paymentDefaultCount`) y `credibilityScore`, constancia (`streakDaysCount`, `lastCleanChallengeAt`) y `lastLifelineAt` |
  | `Friendship` | par ordenado de usuarios (se guarda una sola vez, es bidireccional) |
  | `Challenge` | `inviteCode` único, `creatorId`, `opponentId`, `mode` (COINS / CASH), `stakeAmount`, `status` (PENDING, ACTIVE, RESULT, DISPUTE, CLOSED, CANCELLED), `expiresAt`, `firstDeclaredAt`, votos de ambos, `winnerId`, `closedAt`, Juez (`judgeId`, `judgeProposedById`, aprobaciones, `judgeAssignedAt`) y `cashPaymentStatus` |
  | `ChallengeEvent` | bitácora: `challengeId`, `actorId` (nulo si lo hizo el sistema), `eventType`, `payload`, `createdAt` |
  | `WalletTransaction` | `userId`, `challengeId`, `currency`, `type` (RESERVE, PAYOUT, REFUND, BONUS_INIT, BONUS_WSP, STREAK3, REFERRAL, JUDGE, LIFELINE), `amount` con signo, `idempotencyKey` única |
  | `CredibilityEvent` | `userId`, `challengeId`, `type` (CLEAN_AGREEMENT, DISPUTE_LOST, PAYMENT_DEFAULT), `idempotencyKey` única; se elimina en cascada con el usuario o el reto |

- **Claves de idempotencia:**
  - Reserva al activar: `reserve:<challengeId>:<userId>`
  - Liquidación de pozo o reembolso al cerrar: `settle:<challengeId>:<userId>`. **Pagar y reembolsar comparten la misma clave**, por lo que es imposible pagar dos veces o pagar y reembolsar el mismo reto. El perdedor recibe un asiento de cierre de monto 0 que libera su reserva.
  - Bono registro: `bonus_init:<userId>` · Bono vinculación WhatsApp: `bonus_wsp:<userId>`
  - Premio viralidad: `referral:<inviterId>:<invitedId>` · Premio Juez: `judge_reward:<challengeId>:<judgeId>`
  - Premio de constancia: `streak3:<userId>:<yyyy-mm-dd>` · Salvavidas: `lifeline:<userId>:<instante>`
  - Credibilidad: `cred:<tipo>:<challengeId>:<userId>`

### 4. Atomicidad y orden de candados
- **Decisión:** Toda operación compuesta corre en **una sola transacción**. `reservePot`, `settleWinner`, `refundPot`, `credit`, el Premio de Constancia y el registro de credibilidad aceptan una transacción ya abierta; aceptar un reto o cerrarlo compone todo con el cambio de estado y la bitácora.
- **Orden global de candados:** reto → usuarios en orden de id (y el Juez, cuando interviene). Los candados de usuario se toman **antes** de escribir asientos que referencian al usuario.
- **Por qué:** una clave foránea toma un candado débil sobre la fila del usuario; si luego el cierre pide uno fuerte, dos cierres simultáneos del mismo jugador (en retos distintos) o de un mismo Juez se bloqueaban entre sí (*deadlock* de PostgreSQL, reproducido 6 de 6 veces en una prueba de concurrencia). Con el orden fijo, la misma prueba pasa 12 de 12.
- **Alternativa descartada:** reintentar la transacción ante el error `40P01`: oculta el defecto en vez de evitarlo.

### 5. Relojes Automáticos con Redis + BullMQ
- **Decisión:** La **base de datos es la fuente de verdad**. Cada reloj es una función idempotente que bloquea el reto y vuelve a verificar estado y fechas antes de actuar, así un trabajo viejo, repetido, adelantado o ejecutado dos veces no hace daño. **BullMQ aporta la puntualidad** con trabajos diferidos de ID determinístico, y un **barrido cada 60 segundos** re-ejecuta todo lo vencido (red de seguridad ante un Redis reiniciado o un fallo al agendar).
- **Los tres relojes** (BullMQ no admite `:` en los IDs personalizados, por eso el separador es `__`):
  1. `challenge-expire__<challengeId>`: se agenda al crear el reto para `expiresAt`. Si al dispararse el reto sigue **`PENDING` o `ACTIVE`** sin declaraciones, pasa a `CANCELLED` y devuelve lo reservado. Un reto con alguna declaración sigue su curso.
  2. `declare-timeout-24h__<challengeId>`: se agenda con la primera declaración (24 h). Si el único votante cambia su voto, el reloj se reagenda desde el cambio. Pasadas las 24 h sin respuesta: dijo "gané yo" → gana quien declaró; dijo "ganó mi rival" → gana el rival que calla; dijo "empate" → se devuelve el pozo. Es neutro para la Credibilidad.
  3. `judge-timeout-48h__<challengeId>`: se agenda cuando el segundo jugador aprueba al Juez (48 h). Si no falla, se revoca su asignación y los jugadores pueden proponer y aprobar a otro; la disputa y las monedas reservadas quedan como estaban.
- **Qué agenda o cancela cada acción:** crear agenda el vencimiento; la primera declaración cancela el vencimiento y agenda las 24 h; una disputa cancela ambos; cerrar o cancelar el reto cancela todo; aprobar al Juez agenda las 48 h y su fallo cancela todo.
- **Consistencia:** los relojes se agendan **después** de confirmar la transacción; si Redis falla, se registra el error y la acción del usuario igual se completa (el barrido lo corrige). Los trabajos tienen hasta 3 intentos con espera exponencial. El worker arranca con la API salvo que `CLOCKS_ENABLED=false`.

### 6. Resolución de resultados, disputas y Juez
- **Evaluación de votos** (cada voto es desde la perspectiva de quien lo emite: `WIN` = "gané yo", `LOSS` = "ganó mi rival", `DRAW` = "empate"):
  - uno dice `WIN` y el otro `LOSS` → gana el que dijo "gané";
  - ambos `DRAW` → se devuelve el pozo;
  - ambos `LOSS` (nadie reclama el premio) → se devuelve el pozo;
  - cualquier otra combinación, incluido "gané" contra "empate" → **disputa**.
- **Cambio de voto:** permitido mientras el reto esté en `ACTIVE`, `RESULT` o `DISPUTE`; repetir el mismo voto no hace nada. Sin ninguna declaración, pasada la fecha límite ya no se puede declarar; con una declaración hecha se puede seguir votando.
- **Juez:** lo propone un jugador y debe ser **amigo de quien propone**, ya registrado, y no uno de los jugadores. La propuesta cuenta como su aprobación; **solo el rival** puede aprobar. Una nueva propuesta reemplaza a la pendiente (así el rival puede contraproponer). Solo el Juez asignado, dentro de sus 48 h, puede fallar y solo elige a uno de los dos jugadores. El Juez ve la evidencia únicamente cuando ambos lo aprobaron. Su recompensa de +5 se acredita en la misma transacción del fallo.
- **Cierre:** liquida o reembolsa, actualiza `totalPlayed` y `totalWins`, evalúa la constancia y la credibilidad, y deja `CHALLENGE_CLOSED` en la bitácora con `resolvedBy` (`AGREEMENT`, `JUDGE` o `TIMEOUT`), `hadDispute`, ganador, perdedor y ambos votos. En modo Plata no hay movimiento de monedas: el reto queda cerrado con el pago en `PENDING`.
- **Pago por Plata (P2P):** el perdedor marca "Ya transferí", el ganador confirma "Pago recibido". El ganador puede reclamar incumplimiento una vez vencido el plazo de gracia, **72 horas desde el cierre**, configurable con `CASH_PAYMENT_GRACE_HOURS`; ese reclamo lleva el pago a `DEFAULTED` y penaliza al deudor en su Credibilidad.

### 7. Credibilidad, perfil e historial
- **Fórmula (Fair Play):** `round( 100 · L / (L + 5·F) )`, con `L` acuerdos limpios y `F` incumplimientos comprobados. Es una razón recalculable desde los asientos, no un contador que se pueda desincronizar (`recompute` la reconstruye). Un usuario sin historial tiene 100. Verde desde 80, amarillo desde 50, rojo por debajo; con menos de 3 hechos el puntaje es **provisional**. Los valores son constantes con nombre (`FAULT_WEIGHT`, `GREEN_MIN`, `YELLOW_MIN`, `PROVISIONAL_BELOW`).
- **Qué cuenta:** un **acuerdo limpio** es un cierre de común acuerdo **sin disputa** (ganes, pierdas o empates) y suma a ambos jugadores. Es **neutro**: el silencio de 24 h, una disputa resuelta por rectificación, y los retos cancelados o vencidos. **Incumplimiento comprobado**: solo el jugador cuya declaración de **victoria** desmiente el Juez (quien había dicho "empate" o reconoció la derrota no es sancionado), y el deudor cuyo pago se reclama como incumplido. Confirmar un pago no suma ni resta.
- **Perfil** (`GET /users/:id/profile`, también `me`): devuelve únicamente jugados, victorias y `% Fair Play` (puntaje, color y si es provisional), sin niveles, rachas ni el desglose interno de disputas o pagos. Lo ven uno mismo, sus amigos y quienes comparten un reto con él (por ejemplo el rival o el Juez); el resto recibe `403`.
- **Historial** (`GET /challenges/history`): solo retos **cerrados**, del más reciente al más antiguo, con rival, resultado, cómo se resolvió y estado del pago. `?with=<amigo>` limita al historial entre dos. Paginación por cursor sobre la clave compuesta (fecha de cierre, id) para no repetir ni saltar retos que cierran en el mismo instante (20 por página, máximo 50). El balance de victorias, derrotas y empates se calcula sobre todos los retos que cumplen el filtro, no solo la página.

### 8. Flujo de "Mensaje Inverso" con Bot de WhatsApp
- **Decisión:** Implementar un endpoint de webhook para **WhatsApp Cloud API (o Evolution API)**.
  - Cuando el usuario toca *"Vincular mi WhatsApp"*, el Backend genera un token corto (`LinkToken` en Redis con TTL de 15 min, ej. `VINC-8F9A2B`) y abre `https://wa.me/<BOT_NUMBER>?text=Vincular%20mi%20cuenta%20IBetU%20%23VINC-8F9A2B`.
  - Cuando el usuario presiona Enviar en su WhatsApp, el webhook recibe el payload oficial con el teléfono real del remitente (`from`) y el texto. El Backend consume el código (uso único), vincula `whatsappPhone` al usuario y acredita las `+50` monedas (una sola vez). Un número ya vinculado a otra cuenta se rechaza. Si el invitado ya había activado su primer reto, la vinculación completa la condición del premio por viralidad.
  - Para **recuperar sesión**, el usuario envía `"Entrar a mi cuenta"` al mismo bot y, si su número está vinculado, recibe un **Magic Link** (`/auth/magic?token=...` con TTL de 10 min y un solo uso).
  - Se atiende además la verificación `GET` del webhook que exige Meta.
- **Registro por link de un reto:** `POST /auth/instant-register` acepta el `inviteCode` del reto y atribuye al invitador, que es lo que habilita el premio por viralidad.

### 9. Almacenamiento Multimedia Directo a Cloudflare R2 (Pre-signed URLs)
- **Decisión:** La evidencia opcional (video o foto) se sube en **dos pasos**: (1) el Backend entrega una URL pre-firmada de subida (PUT, 15 min) hacia **Cloudflare R2**, con una clave `challenges/<reto>/<usuario>/<uuid>.<ext>` generada por el servidor; (2) tras subir, el jugador adjunta el archivo al reto y el Backend verifica en R2 que exista y coincida en tipo y tamaño antes de dejar el asiento `EVIDENCE_ADDED` en la bitácora (idempotente por clave). El celular sube directo a R2 sin pasar por la memoria del servidor Node.js.
- **Límites:** tipos permitidos MP4, MOV, WebM, JPG, PNG y WebP; máximo 15 MB. La firma incluye el **tipo y el tamaño exactos**, así que solo vale el archivo declarado. Solo suben los jugadores y solo con el reto en `ACTIVE`, `RESULT` o `DISPUTE`. Las URLs de lectura se firman por 1 hora.
- **Detalles técnicos:** el SDK de AWS agrega por defecto un checksum del cuerpo que en una URL pre-firmada se calcula sobre un cuerpo vacío e invalidaría la subida real; se desactiva (`requestChecksumCalculation: 'WHEN_REQUIRED'`). Si R2 no está configurado o no responde, la API devuelve `503` con un mensaje claro y no deja asientos.

## Risks / Trade-offs

- **[Riesgo] El navegador interno de WhatsApp (In-App Browser) pierde las cookies si el usuario luego abre Safari/Chrome.** → **Mitigación:** Incentivar la vinculación de WhatsApp inmediatamente después de aceptar el primer reto con las **+50 monedas de regalo**, de modo que pueda volver a entrar en 1 toque desde cualquier navegador pidiendo su Magic Link al bot.
- **[Riesgo] Dos amigos intentan "farmear" monedas creando retos falsos entre ellos.** → **Mitigación:** En un reto normal la suma es cero (+10 para uno, -10 para el otro, no se emiten monedas nuevas). El premio de constancia (+30) exige **3 días calendario consecutivos** (en hora de Argentina) y retos cerrados con ganador y sin disputa, y el premio por viralidad (+30) exige un número de WhatsApp único nuevo verificado.
- **[Riesgo] Condición de carrera si ambos jugadores o un reloj automático cierran el reto en el mismo milisegundo.** → **Mitigación:** Transacción en PostgreSQL con `SELECT ... FOR UPDATE` sobre la fila de `Challenge`, verificación de estado dentro de la transacción y `idempotencyKey` única en los asientos.
- **[Riesgo] Bloqueos cruzados (*deadlock*) entre cierres simultáneos del mismo jugador o Juez.** → **Mitigación:** orden global de candados (reto → usuarios ordenados) tomado antes de escribir asientos que referencian al usuario (ver Decisión 4), con pruebas de concurrencia de regresión.
- **[Riesgo] Redis se reinicia, pierde los trabajos diferidos o falla al agendar, y un reto queda sin reloj.** → **Mitigación:** la base es la fuente de verdad y el barrido de 60 segundos re-ejecuta todo lo vencido (ver Decisión 5).
- **[Riesgo] Los números de la Credibilidad (peso 5, umbrales 80 y 50, provisional con menos de 3 hechos) son una propuesta sin datos reales de uso.** → **Mitigación:** son constantes con nombre y el puntaje se recalcula desde los asientos, así que ajustarlos no exige migrar datos.

## Migration Plan

1. Configurar monorepo (`apps/web`, `apps/api`, `packages/shared`) y variables de entorno: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `APP_URL`, `WHATSAPP_BOT_NUMBER`, `WHATSAPP_VERIFY_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, y opcionales `CASH_PAYMENT_GRACE_HOURS`, `STREAK_TIMEZONE`, `CLOCKS_ENABLED` y `CLOCK_QUEUE_NAME`.
2. Desplegar PostgreSQL y Redis gestionados (Railway / Supabase) y aplicar las migraciones de Prisma (`init` y `credibility`).
3. Desplegar `apps/api` con el worker de relojes activo y configurar el webhook del número de WhatsApp.
4. Desplegar `apps/web` en Vercel apuntando al dominio corto para los enlaces compartibles.
5. Verificar con `npm run test -w api` (unidad e integración), `npm run test:e2e -w api` (API por HTTP) y `npm run test:e2e -w web` (interfaz).

## Open Questions

- **Credenciales de Cloudflare R2:** la firma de las URLs está probada con credenciales de prueba, pero una subida real a R2 solo se puede verificar con la cuenta definitiva. No cambia el enfoque ni las tareas.
- **Envío saliente de WhatsApp:** hoy el webhook devuelve el texto de respuesta del bot, pero no lo envía por la Cloud API; eso depende de tener el número del bot y los tokens de Meta. No cambia el enfoque ni las tareas.
