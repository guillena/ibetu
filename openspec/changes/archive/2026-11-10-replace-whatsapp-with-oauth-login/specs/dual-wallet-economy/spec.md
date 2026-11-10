## MODIFIED Requirements

### Requirement: Bono de bienvenida desdoblado (Registro + Vinculación WhatsApp)
El sistema SHALL otorgar un total de 100 monedas de bienvenida a cada usuario nuevo, acreditando las 100 monedas en un único tramo en el momento en que el usuario completa su alta inicial autenticándose con Google o Apple y confirmando su `@usuario`.

#### Scenario: Acreditación de bienvenida en dos tramos
- **WHEN** un usuario nuevo se autentica por primera vez con Google o Apple y confirma su Nombre y `@usuario`
- **THEN** el sistema acredita las 100 monedas de bienvenida en su monedero de forma idempotente (`BONUS_INIT`) y registra el movimiento en su historial

### Requirement: Premio por viralidad al invitar amigos nuevos
El sistema SHALL acreditar +30 monedas al usuario invitador por cada amigo nuevo que se registre con su cuenta verificada de Google o Apple a través de su enlace de invitación y participe en su primer desafío activo.

#### Scenario: Amigo invitado vincula WhatsApp y juega su primer reto
- **WHEN** el Jugador B (invitado por el Jugador A) completa su registro con Google o Apple desde el enlace compartido y acepta su primer desafío
- **THEN** el sistema acredita +30 monedas en el monedero del Jugador A bajo el concepto de premio por viralidad
