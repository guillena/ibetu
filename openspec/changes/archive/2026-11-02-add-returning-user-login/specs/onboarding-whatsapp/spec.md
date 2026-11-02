## ADDED Requirements

### Requirement: Puerta de entrada dual desde el sitio institucional
El sistema SHALL proveer una ruta de acceso (`/entrar`) que soporte el ingreso para usuarios nuevos (`?modo=nuevo`) y para usuarios con cuenta existente (`?modo=ingresar`), redirigiendo automáticamente al tablero principal (`/`) si el navegador ya cuenta con una sesión activa.

#### Scenario: Visitante con sesión activa abre el enlace desde el sitio web
- **WHEN** un usuario que ya tiene una sesión activa en `localStorage` navega a `/entrar` (en cualquier modo)
- **THEN** el sistema lo redirige automáticamente a `/` sin mostrar formularios de registro ni de inicio de sesión

#### Scenario: Nuevo jugador entra desde el botón de crear perfil
- **WHEN** un visitante sin sesión activa abre `/entrar` o `/entrar?modo=nuevo`
- **THEN** el sistema muestra el formulario de creación instantánea de perfil (+50 monedas de regalo) junto con un acceso visible para cambiar al modo "Ya tengo perfil"

#### Scenario: Jugador recurrente entra desde el botón "Ya tengo perfil"
- **WHEN** un visitante sin sesión activa abre `/entrar?modo=ingresar` o selecciona "Ya tengo perfil" desde `/perfil` o desde la tarjeta de registro
- **THEN** el sistema muestra la vista de recuperación por WhatsApp con el botón 3D "Entrar con mi WhatsApp" que abre `wa.me` hacia el bot oficial con el mensaje pre-armado de ingreso

## MODIFIED Requirements

### Requirement: Vinculación de cuenta mediante Mensaje Inverso a WhatsApp
El sistema SHALL generar un enlace `wa.me` con un código único temporal de vinculación para que el usuario envíe un mensaje pre-armado desde su propio WhatsApp al bot oficial de I Bet U, asociando de manera verificada el número de teléfono remitente al perfil del usuario, y MUST presentar este aviso de vinculación inmediatamente después de que un usuario sin WhatsApp vinculado cree su primer desafío.

#### Scenario: Usuario vincula su WhatsApp con mensaje inverso
- **WHEN** un usuario autenticado toca "Vincular mi WhatsApp" y envía el mensaje con el código de vinculación al bot de I Bet U
- **THEN** el webhook del sistema valida el código, asocia el número de teléfono del remitente a la cuenta del usuario y acredita las 50 monedas adicionales del bono de vinculación por única vez

#### Scenario: Código de vinculación expirado o inválido
- **WHEN** el bot recibe un mensaje con un código de vinculación inexistente o vencido
- **THEN** el sistema no vincula ninguna cuenta y responde por WhatsApp con un enlace para generar un nuevo intento

#### Scenario: Aviso de vinculación al crear el primer reto
- **WHEN** un usuario autenticado que aún no tiene un número de WhatsApp vinculado termina de crear un desafío en `/crear`
- **THEN** la pantalla de confirmación del reto creado muestra, además del botón para compartir el desafío, la tarjeta de vinculación con WhatsApp (+50 monedas y protección de cuenta) para generar su código `VINC-XXXXXX` y enviarlo al bot

### Requirement: Recuperación de sesión sin contraseña vía Bot de WhatsApp
El sistema SHALL permitir que un usuario con su número de WhatsApp previamente vinculado recupere el acceso a su cuenta desde cualquier dispositivo o navegador solicitando un enlace mágico de acceso (Magic Link) al bot de WhatsApp y canjeándolo en la ruta `/auth/magic` sin necesidad de recordar su `@usuario` ni una contraseña.

#### Scenario: Reingreso desde nuevo navegador mediante WhatsApp
- **WHEN** un usuario sin sesión activa selecciona "Entrar con mi WhatsApp" y envía el mensaje de ingreso al bot desde su número registrado
- **THEN** el sistema identifica la cuenta asociada a ese número y le responde por WhatsApp con un Magic Link de un solo uso y corta duración que apunta a `/auth/magic?token=...`

#### Scenario: Canje exitoso del enlace mágico en la web
- **WHEN** el usuario abre `/auth/magic?token=<token_valido>` en su navegador
- **THEN** la aplicación web consume `POST /auth/magic-login`, guarda la sesión resultante en el navegador y redirige al usuario a `/` con su cuenta activa

#### Scenario: Enlace mágico vencido o ya utilizado
- **WHEN** el usuario abre `/auth/magic?token=<token_invalido>` con un token inexistente, expirado o ya consumido
- **THEN** la página `/auth/magic` muestra un estado de error claro con la opción de volver a pedir un nuevo enlace por WhatsApp

