# Proposal: MVP de I Bet U (Red Social de Desafíos entre Amigos)

## Why

Los desafíos cotidianos entre amigos (*«¿a que no embocás el papel en el cesto?»*) suelen quedar en el aire por falta de una forma instantánea, divertida y transparente de registrarlos, reservar el pozo en juego y construir reputación por cumplir acuerdos. **I Bet U** nace como una red social móvil de fricción cero (accesible en menos de un segundo desde un link de WhatsApp sin obligar a descargar una app) para validar la hipótesis central: *¿la gente vuelve a jugar y trae a sus amigos porque el reto es divertido y competitivo?*

## What Changes

Se construye desde cero el **MVP de I Bet U** bajo una arquitectura desacoplada (Web App móvil hoy en Next.js con estética *Kinetic Wayfinder* estilo Waze, sobre un Backend único preparado para sumar una futura app nativa en Flutter), incorporando:

- **Onboarding sin fricción y vinculación por WhatsApp:** Entrada directa desde un link de invitación compartido por WhatsApp, registro instantáneo con Nombre + `@usuario`, conexión automática de amistad entre retador e invitado, y vinculación/recuperación de cuenta en 1 toque mediante **Mensaje Inverso** al Bot de WhatsApp de I Bet U.
- **Ciclo de vida completo de desafíos personalizados:** Creación rápida en 3 pasos (con ideas pre-armadas/presets opcionales y fecha/hora de vencimiento), estados claros (`Pendiente`, `Activo`, `Resultado`, `Disputa`, `Cerrado`, `Cancelado`), bitácora auditable de eventos, evidencia opcional en video/foto, regla de silencio de **24 horas** desde el primer voto, y resolución de disputas permitiendo **cambiar el voto en cualquier momento** o invitar a un **3er amigo como Juez** (un amigo ya registrado de quien lo propone, aprobado por ambos jugadores con ventana de 48 horas).
- **Economía Dual (Switch `Monedas` / `Plata` estilo plataforma de trading):**
  - **Modo Monedas (Gratis):** Reserva automática al activar el reto (ej. 10 por jugador -> pozo de 20) e idempotencia estricta en la liquidación. Incluye 5 vías transparentes para sumar monedas: Bono de Bienvenida (`50` al entrar + `50` al vincular WhatsApp), Victoria en retos (`+10` netas), Premio de Constancia (`+30` monedas al completar 1 reto limpio por día durante 3 días consecutivos), Premio por Viralidad (`+30` por invitar a un amigo nuevo que vincule su WhatsApp y juegue su primer reto), Premio por ser Juez (`+5` al desempatar a tiempo) y Salvavidas diario (`+20` si el saldo total es menor a 10 monedas, máximo 1 vez cada 24h).
  - **Modo Plata (Acuerdo real entre amigos):** Permite pactar retos por un monto en dinero donde, al cerrarse el resultado, la plataforma facilita los datos de pago entre amigos (P2P) y ambos confirman el cumplimiento (si el perdedor no paga, el ganador puede reclamar el incumplimiento pasado un plazo de gracia de 72 horas), impactando de forma directa en su Credibilidad sin que la plataforma custodie dinero fiduciario en el MVP.
- **Termómetro de Credibilidad (`% Fair Play`) e Historial:** Sistema de reputación visual donde perder nunca baja la credibilidad; cerrar retos de común acuerdo y sin disputa la sube, el vencimiento por silencio de 24h y una disputa resuelta por rectificación son neutros (el silencio ya tiene su castigo: perder el reto), y mentir en una disputa (dictaminado por el Juez) o incumplir un pago la penaliza fuertemente. Se calcula como `100·L/(L+5·F)`, con `L` acuerdos limpios y `F` incumplimientos comprobados, y se muestra con un color (verde, amarillo o rojo).
- **Interfaz Móvil `Kinetic Wayfinder`:** Implementación del sistema de diseño visual luminoso estilo Waze (`Outfit` + `Manrope`, paleta `#0099FF` / `#33CCFF` / `#5CFD80` / `#FFDF99` / `#FF5722` e íconos `Material Symbols Outlined`) adaptado al lenguaje de retos sociales, en una columna de hasta 480 px pensada para el celular.

### Fuera del alcance (Out of Scope para el MVP)

Quedan explícitamente excluidos de este MVP:
- **Custodia y pasarela de dinero real dentro de la app:** No se procesan depósitos ni retiros bancarios/tarjetas dentro de I Bet U en el MVP (el Modo Plata opera por liquidación directa entre amigos y registro de cumplimiento).
- **Eventos verificables automáticos (Oráculos externos):** Pronósticos conectados a APIs deportivas o climáticas automáticas quedan para una etapa futura.
- **Geolocalización / "Amigos en el mapa":** No se incluyen mapas en vivo ni rastreo de ubicación GPS.
- **Chat interno dentro del reto:** La conversación entre amigos ocurre en WhatsApp; no se construye un mensajero interno.
- **Rachas de victorias, multiplicadores (`3x`) y Niveles (`Nv. 7`):** Se excluyen para no competir visual ni conceptualmente con el **Termómetro de Credibilidad** y el contador de victorias.
- **Dictado por voz al crear retos:** Queda fuera del alcance inicial.
- **Configuración de video obligatorio:** El video o foto de evidencia es siempre opcional en el MVP.
- **Modo oscuro:** El sistema de diseño es de luz de día; no hay tema oscuro.
- **Diseño de varias columnas para tablet y escritorio:** La interfaz es una única columna centrada de hasta 480 px; los diseños de 8 y 12 columnas del sistema quedan para después del MVP.
- **Juez sin cuenta mediante enlace de arbitraje (`/j/:code`):** En el MVP el Juez es un amigo ya registrado de quien lo propone; invitar a alguien que todavía no tiene cuenta queda para una etapa posterior.
- **Apps nativas compiladas en tiendas (iOS/Android en Flutter):** Se construirán en una etapa posterior consumiendo el mismo Backend desarrollado en este MVP.

## Capabilities

### New Capabilities
- `onboarding-whatsapp`: Registro instantáneo sin fricción desde link de invitación, gestión de lista de amigos e integración con el Bot de WhatsApp mediante Mensaje Inverso para vinculación de número, login con Magic Link y notificaciones de estado.
- `challenge-lifecycle`: Máquina de estados del desafío (`Pendiente`, `Activo`, `Resultado`, `Disputa`, `Cerrado`, `Cancelado`), presets rápidos de creación, bitácora de eventos, carga opcional de evidencia multimedia y reglas de resolución (vencimiento del reto, reloj de 24h por silencio, cambio de voto y arbitraje por 3er amigo Juez en 48h).
- `dual-wallet-economy`: Motor contable transaccional (Dual Ledger ACID e idempotente) con switch `Monedas / Plata`, custodia en reserva (escrow de monedas), reglas de emisión de monedas (bienvenida 50+50, constancia de 3 días +30, viralidad +30, arbitraje +5 y salvavidas +20) y flujo de confirmación de pago P2P en Modo Plata.
- `credibility-reputation`: Cálculo, almacenamiento y visualización del Termómetro de Credibilidad (`% Fair Play`), registro de victorias e historial competitivo entre amigos.
- `ui-kinetic-wayfinder`: Sistema de diseño `Kinetic Wayfinder` e interfaz Web App móvil (PWA) con navegación principal (Retos con filtros `En Juego`, `Por Declarar` e `Invitaciones`, Crear Reto, Detalle, Declaración/Disputa, Amigos, Monedero e Historial) y tarjetas OpenGraph para WhatsApp.

### Modified Capabilities
<!-- No hay capacidades existentes que se modifiquen (proyecto inicial). -->

## Impact

- **Nuevos sistemas a crear:**
  - `apps/web`: Web App móvil en **Next.js (React + TypeScript) + Tailwind CSS + Framer Motion + Lottie/Rive**.
  - `apps/api`: Backend REST + WebSockets en **Node.js + TypeScript (NestJS)** con **Prisma ORM**.
  - **Base de datos y colas:** Esquema transaccional en **PostgreSQL** (usuarios, amistades, billeteras, asientos contables idempotentes, retos, votos, arbitrajes y bitácora) y **Redis + BullMQ** para los 3 relojes automáticos (vencimiento del reto, 24h de declaración y 48h de Juez).
  - **Integraciones externas:** Webhook de **WhatsApp Cloud API / Evolution API** (Mensaje Inverso y avisos) y **Cloudflare R2** (almacenamiento de videos/fotos opcionales).

