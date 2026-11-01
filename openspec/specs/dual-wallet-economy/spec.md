# dual-wallet-economy Specification

## Purpose

Administra el monedero del usuario bajo un esquema contable de doble modalidad (`Monedas` gratuitas y acuerdos por `Plata`), garantizando reservas seguras, liquidación idempotente de premios, recompensas por participación/viralidad y confirmación de cumplimiento entre amigos.

## Requirements

### Requirement: Reserva simétrica e idempotencia estricta en liquidación de Monedas
En todo desafío en modo `Monedas`, el sistema MUST reservar exactamente el mismo monto de cada participante al activarse el reto y SHALL garantizar mediante control de idempotencia transaccional que el pozo reservado se liquide o reembolse exactamente una sola vez al cerrarse o cancelarse el desafío.

#### Scenario: Reserva al activar reto de 10 monedas
- **WHEN** ambos jugadores cuentan con al menos 10 monedas disponibles y el reto pasa a estado `Activo`
- **THEN** el sistema descuenta 10 monedas del saldo disponible de cada jugador y las coloca en un pozo reservado de 20 monedas vinculado al reto

#### Scenario: Intento duplicado o concurrente de liquidación
- **WHEN** se dispara más de una solicitud simultánea para cerrar y liquidar el mismo desafío
- **THEN** el sistema procesa únicamente la primera liquidación acreditando las 20 monedas al ganador una sola vez y rechaza las solicitudes duplicadas manteniendo el saldo consistente

### Requirement: Bono de bienvenida desdoblado (Registro + Vinculación WhatsApp)
El sistema SHALL otorgar un total de 100 monedas de bienvenida a cada usuario nuevo, acreditando 50 monedas al crear la cuenta inicial y las 50 monedas restantes únicamente cuando el usuario complete por primera vez la vinculación verificada de su número de WhatsApp.

#### Scenario: Acreditación de bienvenida en dos tramos
- **WHEN** un usuario se registra con Nombre y `@usuario` y posteriormente vincula su número de WhatsApp por primera vez
- **THEN** el sistema acredita 50 monedas en el alta inicial y 50 monedas adicionales tras confirmar el webhook de WhatsApp, registrando ambos movimientos en su historial

### Requirement: Premio de constancia por jugar durante 3 días consecutivos
El sistema SHALL otorgar una recompensa automática de +30 monedas cada vez que un usuario complete al menos un desafío cerrado con ganador definido (sin disputa ni cancelación/empate) por día calendario durante 3 días consecutivos, reiniciando el contador de 3 días tras otorgar el premio o si se interrumpe un día.

#### Scenario: Usuario completa un reto limpio durante 3 días seguidos
- **WHEN** un usuario finaliza con ganador definido al menos un reto en el Día 1, uno en el Día 2 y uno en el Día 3 (haya ganado o perdido cada reto)
- **THEN** al cerrarse el reto del Día 3 el sistema le acredita automáticamente +30 monedas por constancia y reinicia el ciclo de 3 días

#### Scenario: Reto cancelado o empatado no suma al día de constancia
- **WHEN** el único desafío cerrado por un usuario en un día calendario termina en `Cancelado` o `Empate`
- **THEN** el sistema no contabiliza ese día como completado para el premio de constancia de 3 días

### Requirement: Premio por viralidad al invitar amigos nuevos
El sistema SHALL acreditar +30 monedas al usuario invitador por cada amigo nuevo que se registre a través de su enlace de invitación, siempre que dicho amigo haya vinculado su número de WhatsApp y participado en su primer desafío activo.

#### Scenario: Amigo invitado vincula WhatsApp y juega su primer reto
- **WHEN** el Jugador B (invitado por el Jugador A) completa la vinculación de su WhatsApp y acepta su primer desafío
- **THEN** el sistema acredita +30 monedas en el monedero del Jugador A bajo el concepto de premio por viralidad

### Requirement: Recompensa por actuar como Juez y Salvavidas por saldo cero
El sistema SHALL acreditar +5 monedas al tercer amigo Juez que resuelva una disputa dentro del plazo de 48 horas, y SHALL habilitar un botón de "Salvavidas" que otorga +20 monedas gratuitas (máximo una vez cada 24 horas) exclusivamente cuando el saldo total del usuario (disponible más reservado en retos activos) sea menor a 10 monedas.

#### Scenario: Usuario sin monedas ni retos activos solicita Salvavidas
- **WHEN** un usuario tiene menos de 10 monedas totales, no tiene desafíos activos con monedas reservadas y no solicitó un Salvavidas en las últimas 24 horas
- **THEN** el sistema le acredita +20 monedas gratuitas al tocar el botón de Salvavidas

#### Scenario: Juez emite fallo a tiempo
- **WHEN** un usuario designado como Juez emite su fallo antes de que expiren las 48 horas de la disputa
- **THEN** el sistema le acredita +5 monedas en su monedero como recompensa por arbitraje

### Requirement: Modalidad Por Plata con liquidación P2P entre amigos
El sistema SHALL permitir alternar mediante un switch entre `Monedas` y `Plata` al crear un reto y en el monedero; cuando un reto en modo `Plata` se cierra con un ganador, el sistema MUST mostrar los datos de pago/alias del ganador para que el perdedor informe el envío y el ganador confirme la recepción sin que la plataforma custodie fondos fiduciarios.

#### Scenario: Cierre y confirmación de pago en reto Por Plata
- **WHEN** un desafío creado en modo `Plata` (por ejemplo, por $5.000) se cierra a favor del Jugador A
- **THEN** el sistema habilita al Jugador B a marcar "Ya transferí" viendo el alias del Jugador A, y al Jugador A a confirmar "Pago recibido", dejando asentado el cumplimiento del acuerdo

### Requirement: Reclamo de incumplimiento tras el plazo de gracia
El ganador de un reto por `Plata` SHALL poder reclamar el incumplimiento del pago solo una vez vencido un plazo de gracia de 72 horas desde el cierre (configurable); el reclamo marca el pago como incumplido y no puede repetirse, y confirmar el pago cierra el acuerdo sin penalización.

#### Scenario: Reclamo antes del plazo
- **WHEN** el ganador reclama el incumplimiento antes de que se cumplan las 72 horas del cierre
- **THEN** el sistema rechaza el reclamo e indica desde cuándo puede hacerlo

#### Scenario: Reclamo vencido el plazo
- **WHEN** el ganador reclama el incumplimiento pasadas las 72 horas y el pago sigue pendiente (o el perdedor dijo que pagó y el ganador no lo recibió)
- **THEN** el sistema marca el pago como incumplido, lo asienta en la bitácora y reduce la Credibilidad del deudor una sola vez

#### Scenario: Pago ya confirmado
- **WHEN** el ganador ya confirmó "Pago recibido"
- **THEN** el sistema no admite un reclamo de incumplimiento posterior

