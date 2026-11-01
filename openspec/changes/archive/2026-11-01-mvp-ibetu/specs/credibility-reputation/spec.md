# Spec Delta: Termómetro de Credibilidad, Victorias e Historial

## Purpose

Mide, actualiza y expone visualmente la confiabilidad de cada jugador mediante el Termómetro de Credibilidad (`% Fair Play`), el contador de victorias totales y el historial completo de desafíos cerrados, premiando el cumplimiento de acuerdos y penalizando únicamente las faltas comprobadas.

## ADDED Requirements

### Requirement: Cálculo del Termómetro de Credibilidad (% Fair Play)
El sistema SHALL calcular para cada jugador un porcentaje de Credibilidad como `100·L/(L+5·F)`, con `L` acuerdos limpios y `F` incumplimientos comprobados, y mostrarlo con un color: Verde desde 80, Amarillo desde 50 y Rojo por debajo. Sin historial vale 100 y es provisional mientras haya menos de 3 hechos. Un acuerdo limpio es un cierre de común acuerdo sin disputa, ganes, pierdas o empates.

#### Scenario: Jugador reconoce su derrota sin disputa
- **WHEN** el Jugador B declara `Ganó mi rival` coincidiendo con la declaración del Jugador A
- **THEN** el sistema registra una derrota deportiva para el Jugador B pero incrementa su contador de acuerdos limpios, manteniendo o subiendo su porcentaje en el Termómetro de Credibilidad

#### Scenario: Un jugador nuevo arranca completo pero provisional
- **WHEN** un jugador sin retos cerrados consulta su Termómetro de Credibilidad
- **THEN** el sistema muestra 100% en Verde y lo marca como provisional

#### Scenario: Un incumplimiento baja fuerte y jugar limpio lo recupera
- **WHEN** un jugador con 10 acuerdos limpios pierde una disputa ante el Juez y luego suma 10 acuerdos limpios más
- **THEN** su porcentaje pasa de 100% a 67% (Amarillo) y después sube a 80% (Verde)

### Requirement: Neutralidad de credibilidad ante cierre por silencio de 24 horas
El sistema MUST tratar como neutro para el Termómetro de Credibilidad el caso en que un jugador pierda un desafío por no responder dentro de las 24 horas posteriores a la declaración de su rival, dado que la pérdida automática del reto y del pozo ya es la sanción, y también una disputa que se cierra porque uno de los jugadores rectifica su voto.

#### Scenario: Cierre automático a las 24 horas por falta de respuesta
- **WHEN** el desafío se adjudica al Jugador A porque el Jugador B no respondió en el plazo de 24 horas
- **THEN** el sistema no aplica la penalización de trampa comprobada sobre el Termómetro de Credibilidad del Jugador B

#### Scenario: Disputa resuelta porque un jugador rectifica
- **WHEN** ambos declararon `Gané yo`, se abrió una disputa y el Jugador B cambia su declaración a `Ganó mi rival`
- **THEN** el sistema cierra el desafío sin registrar acuerdos limpios ni incumplimientos para ninguno de los dos jugadores

### Requirement: Penalización severa por mentira comprobada ante Juez o incumplimiento en Modo Plata
El sistema MUST aplicar una reducción severa en el Termómetro de Credibilidad del jugador cuya declaración de victoria en una `Disputa` sea desmentida por el fallo del tercer amigo Juez, así como cuando incumpla la confirmación de pago en un desafío cerrado en modalidad `Plata`. Quien había declarado `Empate` o reconocido su derrota no es sancionado.

#### Scenario: Juez falla en contra de un jugador en disputa
- **WHEN** ambos jugadores habían declarado `Gané yo` y el Juez designado dictamina que el ganador real fue el Jugador A
- **THEN** el sistema registra un incumplimiento comprobado para el Jugador B y reduce su porcentaje en el Termómetro de Credibilidad

#### Scenario: Quien había declarado empate no es sancionado
- **WHEN** el Jugador A declaró `Gané yo`, el Jugador B declaró `Empate / Cancelar mutuo` y el Juez dictamina que ganó el Jugador A
- **THEN** el sistema no registra ningún incumplimiento para el Jugador B

#### Scenario: Juez desmiente a quien declaró victoria frente a un empate
- **WHEN** el Jugador A declaró `Gané yo`, el Jugador B declaró `Empate / Cancelar mutuo` y el Juez dictamina que ganó el Jugador B
- **THEN** el sistema registra un incumplimiento comprobado para el Jugador A

#### Scenario: Incumplimiento de pago en reto Por Plata
- **WHEN** un reto en modo `Plata` se cierra con ganador y el perdedor no cumple con el pago acordado dentro del plazo establecido y reclamado por el ganador
- **THEN** el sistema marca el acuerdo como incumplido y reduce el Termómetro de Credibilidad del jugador deudor

### Requirement: Registro de victorias totales e historial competitivo sin rachas
El sistema SHALL mostrar en el perfil de cada usuario y en las tarjetas de enfrentamiento únicamente el total de desafíos jugados, las victorias acumuladas y el Termómetro de Credibilidad (`% Fair Play`), excluyendo contadores o multiplicadores de rachas de victorias y niveles de jugador.

#### Scenario: Consulta de perfil e historial entre dos amigos
- **WHEN** un usuario consulta su perfil o el historial con un amigo
- **THEN** el sistema exhibe el listado cronológico de retos cerrados, el balance de victorias y el porcentaje actual del Termómetro de Credibilidad sin mostrar niveles ni multiplicadores de racha

### Requirement: Visibilidad del perfil
El sistema SHALL mostrar el perfil de un usuario solo a él mismo, a sus amigos y a quienes comparten un reto con él (por ejemplo el rival o el Juez), y MUST rechazar la consulta de cualquier otra persona.

#### Scenario: Un desconocido consulta un perfil
- **WHEN** un usuario sin amistad ni retos en común con otro intenta ver su perfil
- **THEN** el sistema rechaza la consulta

#### Scenario: El Juez asignado ve a los dos jugadores
- **WHEN** un Juez aprobado por ambos jugadores consulta el perfil de cualquiera de ellos, aunque sea amigo de uno solo
- **THEN** el sistema muestra el perfil solicitado

### Requirement: Historial de retos cerrados
El historial SHALL listar solo los retos `Cerrado` del usuario, del más reciente al más antiguo, con rival, resultado (ganó, perdió o empate), cómo se resolvió y, en modo Plata, el estado del pago; permite filtrar por rival y paginar sin repetir ni saltar retos, y su balance de victorias, derrotas y empates cubre todos los retos que cumplen el filtro.

#### Scenario: Solo aparecen retos cerrados
- **WHEN** un usuario tiene retos pendientes, activos, en disputa, cancelados y cerrados y consulta su historial
- **THEN** el sistema lista únicamente los cerrados

#### Scenario: Historial con un amigo
- **WHEN** un usuario consulta su historial filtrado por un amigo
- **THEN** el sistema lista solo los retos contra ese amigo y muestra el balance de victorias, derrotas y empates entre ambos

#### Scenario: Paginación sin repetidos ni saltos
- **WHEN** varios retos se cerraron en el mismo instante y el usuario recorre el historial en páginas pequeñas
- **THEN** cada reto aparece exactamente una vez y el balance es el mismo en todas las páginas

