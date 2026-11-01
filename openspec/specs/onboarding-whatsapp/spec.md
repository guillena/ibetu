# onboarding-whatsapp Specification

## Purpose

Permite que cualquier persona invitada a un desafío ingrese desde un enlace compartido en WhatsApp, cree su cuenta instantáneamente sin descargar una aplicación, quede conectada como amigo de quien la invitó y vincule su número de WhatsApp mediante un mensaje inverso al bot oficial para asegurar su cuenta y volver a ingresar en el futuro.

## Requirements

### Requirement: Registro instantáneo sin fricción desde link de invitación
El sistema SHALL permitir que un usuario no registrado que abre el enlace de un desafío ingrese únicamente su Nombre visible y un `@usuario` único para crear su cuenta automáticamente, iniciar sesión con un token persistente y quedar habilitado en el mismo paso para aceptar el desafío.

#### Scenario: Invitado nuevo abre link de desafío y se registra
- **WHEN** un visitante sin sesión activa abre el enlace de un desafío y completa su Nombre y un `@usuario` disponible
- **THEN** el sistema crea el perfil del usuario, emite una sesión activa de larga duración, le acredita el bono inicial de registro (50 monedas) y lo redirige o mantiene en la vista del desafío listo para aceptar

#### Scenario: Nombre de usuario ya ocupado
- **WHEN** un visitante intenta registrarse con un `@usuario` que ya pertenece a otra cuenta
- **THEN** el sistema rechaza el alta indicando que el `@usuario` no está disponible y sugiere variantes libres sin perder los datos del desafío

### Requirement: Conexión automática de amistad por invitación
El sistema MUST registrar una relación de amistad bidireccional de forma automática entre el creador de un desafío (o enlace de invitación) y el usuario que acepta dicho desafío o invitación desde el enlace compartido.

#### Scenario: Amistad creada al aceptar reto por link
- **WHEN** el Jugador B entra mediante el enlace compartido por el Jugador A y acepta el desafío
- **THEN** el sistema agrega a ambos usuarios en sus respectivas listas de amigos sin requerir una solicitud de amistad adicional

### Requirement: Vinculación de cuenta mediante Mensaje Inverso a WhatsApp
El sistema SHALL generar un enlace `wa.me` con un código único temporal de vinculación para que el usuario envíe un mensaje pre-armado desde su propio WhatsApp al bot oficial de I Bet U, asociando de manera verificada el número de teléfono remitente al perfil del usuario.

#### Scenario: Usuario vincula su WhatsApp con mensaje inverso
- **WHEN** un usuario autenticado toca "Vincular mi WhatsApp" y envía el mensaje con el código de vinculación al bot de I Bet U
- **THEN** el webhook del sistema valida el código, asocia el número de teléfono del remitente a la cuenta del usuario y acredita las 50 monedas adicionales del bono de vinculación por única vez

#### Scenario: Código de vinculación expirado o inválido
- **WHEN** el bot recibe un mensaje con un código de vinculación inexistente o vencido
- **THEN** el sistema no vincula ninguna cuenta y responde por WhatsApp con un enlace para generar un nuevo intento

### Requirement: Recuperación de sesión sin contraseña vía Bot de WhatsApp
El sistema SHALL permitir que un usuario con su número de WhatsApp previamente vinculado recupere el acceso a su cuenta desde cualquier dispositivo o navegador solicitando un enlace mágico de acceso (Magic Link) al bot de WhatsApp sin necesidad de recordar su `@usuario` ni una contraseña.

#### Scenario: Reingreso desde nuevo navegador mediante WhatsApp
- **WHEN** un usuario sin sesión activa selecciona "Entrar con mi WhatsApp" y envía el mensaje de ingreso al bot desde su número registrado
- **THEN** el sistema identifica la cuenta asociada a ese número y le responde por WhatsApp con un Magic Link de un solo uso y corta duración que inicia su sesión automáticamente al abrirlo

