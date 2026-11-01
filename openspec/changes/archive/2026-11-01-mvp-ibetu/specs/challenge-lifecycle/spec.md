# Spec Delta: Ciclo de Vida de los Desafíos

## Purpose

Gestiona la creación, aceptación, máquina de estados, vencimientos, declaraciones de resultados, resolución de disputas (mediante cambio de voto o tercer amigo Juez), evidencia multimedia opcional y bitácora auditable de cada desafío entre amigos.

## ADDED Requirements

### Requirement: Creación de desafío con condiciones y fecha de vencimiento
El sistema SHALL permitir a un jugador crear un desafío definiendo el texto del reto (manualmente o usando plantillas/presets rápidos), el rival (de su lista de amigos o mediante enlace compartible por WhatsApp), el modo y monto de apuesta (`Monedas` o `Plata`), y una fecha/hora de vencimiento obligatoria, iniciando en estado `Pendiente`.

#### Scenario: Creación exitosa de desafío personalizado
- **WHEN** el Jugador A completa el texto del desafío, elige la modalidad de apuesta, fija una fecha de vencimiento futura y confirma la creación
- **THEN** el sistema registra el desafío en estado `Pendiente`, genera un enlace único de invitación para WhatsApp y registra el evento inicial en la bitácora del reto

### Requirement: Aceptación de condiciones y activación del desafío
El sistema MUST exigir que el jugador invitado acepte exactamente las mismas condiciones creadas por el retador para pasar el desafío de `Pendiente` a `Activo`, o permitir que el creador lo cancele sin penalidad mientras permanezca en `Pendiente`.

#### Scenario: Rival acepta el desafío
- **WHEN** el Jugador B acepta un desafío en estado `Pendiente` antes de su vencimiento y ambos jugadores cuentan con saldo suficiente (en modo Monedas)
- **THEN** el sistema reserva las monedas de ambos participantes, cambia el estado del desafío a `Activo` y añade el hito de activación en la bitácora

#### Scenario: Rechazo o cancelación previa a la aceptación
- **WHEN** el Jugador B rechaza la invitación o el Jugador A cancela el desafío mientras sigue en estado `Pendiente`
- **THEN** el sistema pasa el desafío a estado `Cancelado` sin retener ni descontar monedas de ningún participante

### Requirement: Carga opcional de evidencia en foto o video
El sistema SHALL permitir que cualquiera de los dos participantes de un desafío en estado `Activo`, `Resultado` o `Disputa` suba un video corto o fotografía opcional como evidencia de su jugada, quedando visible en el detalle del desafío y registrada en la bitácora.

#### Scenario: Jugador sube video opcional de su intento
- **WHEN** un participante adjunta un archivo de video o imagen válido dentro de un desafío activo
- **THEN** el sistema almacena el archivo multimedia, lo muestra en la sección de evidencia del reto y agrega el registro horario en la bitácora

### Requirement: Cancelación automática por vencimiento sin declaraciones
El sistema MUST cancelar automáticamente cualquier desafío `Pendiente` o `Activo` que alcance su fecha y hora de vencimiento sin que ninguno de los dos participantes haya declarado un resultado, devolviendo íntegramente las monedas reservadas a cada jugador (si las hubiera).

#### Scenario: Vence el plazo del desafío y ningún jugador declaró resultado
- **WHEN** se cumple la fecha/hora de vencimiento del desafío en estado `Activo` y ni el Jugador A ni el Jugador B emitieron su declaración
- **THEN** el sistema cambia el estado a `Cancelado`, libera y devuelve las monedas reservadas a ambos jugadores y registra el cierre por expiración en la bitácora

#### Scenario: Vence una invitación que nadie aceptó
- **WHEN** se cumple la fecha/hora de vencimiento de un desafío en estado `Pendiente`
- **THEN** el sistema cambia el estado a `Cancelado` sin mover monedas de ningún jugador

#### Scenario: Un desafío con una declaración no se cancela por vencimiento
- **WHEN** se cumple la fecha/hora de vencimiento y uno de los jugadores ya declaró un resultado
- **THEN** el sistema no cancela el desafío y este sigue su curso (silencio de 24 horas, acuerdo o disputa)

### Requirement: Declaración de resultado por ambos jugadores
El sistema SHALL permitir a cada participante declarar quién ganó (`Gané yo`, `Ganó mi rival` o `Empate / Cancelar mutuo`), pasando el reto a estado `Resultado` al primer voto, y MUST cerrarlo cuando ambas declaraciones coinciden: `Gané yo` contra `Ganó mi rival` da el pozo a quien dijo `Gané yo`; `Empate` de ambos, o `Ganó mi rival` de ambos, devuelve las monedas reservadas.

#### Scenario: Ambos jugadores coinciden en el ganador
- **WHEN** el Jugador A declara que ganó el Jugador A y el Jugador B declara que ganó el Jugador A
- **THEN** el sistema cierra el desafío en estado `Cerrado`, liquida el pozo a favor del Jugador A y registra el acuerdo en la bitácora

#### Scenario: Ambos jugadores declaran empate o cancelación mutua
- **WHEN** ambos jugadores coinciden declarando `Empate / Cancelar mutuo`
- **THEN** el sistema pasa el desafío a `Cerrado` sin ganador y reembolsa el 100% de las monedas reservadas a cada jugador

#### Scenario: Ambos jugadores reconocen que ganó el rival
- **WHEN** ambos jugadores declaran `Ganó mi rival`, de modo que nadie reclama el premio
- **THEN** el sistema pasa el desafío a `Cerrado` sin ganador y reembolsa el 100% de las monedas reservadas a cada jugador

### Requirement: Resolución automática por silencio de 24 horas
Con una única declaración y sin respuesta del rival en 24 horas, el sistema MUST cerrar el reto: si el declarante dijo `Gané yo`, gana el declarante; si dijo `Ganó mi rival`, gana el rival que calla; si dijo `Empate`, se devuelve el pozo. Si el único votante cambia su voto, las 24 horas se cuentan desde el cambio.

#### Scenario: Silencio del rival durante 24 horas tras declaración de victoria
- **WHEN** el Jugador A declara `Gané yo` y transcurren 24 horas sin que el Jugador B emita su declaración
- **THEN** el sistema adjudica automáticamente la victoria al Jugador A, pasa el desafío a `Cerrado` y liquida el pozo a su favor

#### Scenario: Silencio del rival tras un reconocimiento de derrota
- **WHEN** el Jugador A declara `Ganó mi rival` y transcurren 24 horas sin que el Jugador B emita su declaración
- **THEN** el sistema adjudica la victoria al Jugador B, pasa el desafío a `Cerrado` y liquida el pozo a su favor

#### Scenario: Silencio del rival tras una propuesta de empate
- **WHEN** el Jugador A declara `Empate / Cancelar mutuo` y transcurren 24 horas sin que el Jugador B emita su declaración
- **THEN** el sistema pasa el desafío a `Cerrado` sin ganador y reembolsa el 100% de las monedas reservadas a cada jugador

#### Scenario: El único votante cambia su voto
- **WHEN** el Jugador A declara `Gané yo`, y diez horas después cambia su declaración a `Empate / Cancelar mutuo`
- **THEN** el plazo de 24 horas se cuenta desde el cambio y a las 24 horas de la primera declaración el sistema todavía no cierra el desafío

#### Scenario: El rival responde antes de las 24 horas
- **WHEN** el Jugador B declara su resultado antes de que se cumplan las 24 horas
- **THEN** el sistema no ejecuta ninguna adjudicación automática y resuelve el desafío con las dos declaraciones

### Requirement: Estado de Disputa y cambio de voto en cualquier momento
El sistema MUST pasar el desafío a estado `Disputa` manteniendo el pozo bloqueado cuando las declaraciones de ambos jugadores se contradicen, y SHALL permitir que cualquiera de los dos cambie su voto en cualquier momento mientras el desafío no haya sido cerrado para resolver la disputa por acuerdo mutuo.

#### Scenario: Declaraciones contradictorias abren disputa
- **WHEN** el Jugador A declara `Gané yo` y el Jugador B también declara `Gané yo`
- **THEN** el sistema cambia el estado del desafío a `Disputa`, mantiene las monedas en reserva y habilita las opciones de cambiar voto o proponer un Juez

#### Scenario: Una victoria declarada contra un empate también es una contradicción
- **WHEN** el Jugador A declara `Gané yo` y el Jugador B declara `Empate / Cancelar mutuo`
- **THEN** el sistema cambia el estado del desafío a `Disputa` y mantiene las monedas en reserva

#### Scenario: Jugador rectifica su declaración durante una disputa
- **WHEN** un desafío está en `Disputa` y el Jugador B cambia su declaración a `Ganó mi rival` (coincidiendo con el Jugador A)
- **THEN** el sistema resuelve la disputa de inmediato, pasa el desafío a `Cerrado` y acredita el pozo al Jugador A

### Requirement: Arbitraje por tercer amigo Juez con ventana de 48 horas
El sistema SHALL permitir que en estado `Disputa` un jugador proponga a un tercer amigo como Juez y que el rival lo apruebe; una vez aprobado por ambos, el Juez tendrá 48 horas para emitir el fallo definitivo, habilitándose la elección de un nuevo Juez bajo el mismo esquema si no responde en ese plazo.

#### Scenario: Juez aprobado por ambos define el ganador dentro de las 48 horas
- **WHEN** el Jugador A propone al Amigo C como Juez, el Jugador B aprueba la designación y el Amigo C emite su fallo a favor del Jugador A antes de las 48 horas
- **THEN** el sistema cierra el desafío en estado `Cerrado`, liquida el pozo a favor del Jugador A y registra el fallo arbitral en la bitácora

#### Scenario: Juez no emite fallo en 48 horas
- **WHEN** transcurren 48 horas desde que ambos jugadores aprobaron al Juez sin que este haya votado
- **THEN** el sistema revoca la asignación de ese Juez y habilita nuevamente a los jugadores para proponer y aprobar a otro Juez

### Requirement: Designación del Juez
El Juez SHALL ser un amigo ya registrado de quien lo propone y no uno de los jugadores; una nueva propuesta reemplaza a la pendiente y solo el rival de quien propuso puede aprobarla. Solo el Juez asignado, dentro de sus 48 horas, puede fallar y elige a uno de los dos jugadores. El Juez ve la evidencia únicamente cuando ambos jugadores lo aprobaron.

#### Scenario: El rival contrapropone a otro Juez
- **WHEN** el Jugador A propone al Amigo C como Juez y el Jugador B, en lugar de aprobarlo, propone al Amigo D
- **THEN** la propuesta del Amigo D reemplaza a la anterior y ahora quien debe aprobarla es el Jugador A

#### Scenario: Quien propuso no puede aprobar a su propio Juez
- **WHEN** el Jugador A propone al Amigo C como Juez e intenta aprobarlo él mismo
- **THEN** el sistema rechaza la aprobación y el Juez no queda asignado hasta que lo apruebe el Jugador B

#### Scenario: Un Juez solo propuesto no puede fallar ni ver la evidencia
- **WHEN** el Amigo C fue propuesto como Juez pero el rival todavía no lo aprobó
- **THEN** el sistema rechaza su fallo y no le muestra la evidencia del desafío

#### Scenario: Fallo fuera de plazo
- **WHEN** el Juez asignado intenta fallar una vez cumplidas las 48 horas de su designación
- **THEN** el sistema rechaza el fallo y el desafío sigue en `Disputa`

### Requirement: Bitácora auditable de eventos del desafío
El sistema MUST registrar de forma cronológica e inmutable cada cambio de estado, subida de evidencia, declaración de resultado, designación de Juez y liquidación dentro de la bitácora del desafío, mostrándola a los participantes y al Juez designado.

#### Scenario: Visualización de la bitácora en el detalle del reto
- **WHEN** un participante o el Juez abre el detalle del desafío
- **THEN** el sistema muestra la lista ordenada con fecha y hora exacta de todos los hitos ocurridos desde la creación del reto

