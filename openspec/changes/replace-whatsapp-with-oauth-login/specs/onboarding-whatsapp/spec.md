## ADDED Requirements

### Requirement: Autenticación integrada con Google y Apple con confirmación inicial de @usuario
El sistema SHALL permitir que cualquier usuario inicie sesión o cree su cuenta eligiendo entre Google (Gmail) o Apple, validando criptográficamente el token de identidad en el backend, iniciando la sesión de forma directa si la cuenta ya existe o solicitando por única vez la confirmación de su `@usuario` antes de emitir la sesión si es su primer ingreso.

#### Scenario: Usuario nuevo elige Google o Apple y confirma su @usuario
- **WHEN** una persona sin cuenta previa se autentica con Google o Apple y confirma su Nombre visible y un `@usuario` disponible
- **THEN** el sistema crea su cuenta vinculada al identificador único del proveedor (`googleSub` o `appleSub`) y su correo electrónico, le acredita el bono de bienvenida de 100 monedas y guarda una sesión persistente en el dispositivo

#### Scenario: Usuario existente vuelve a ingresar con Google o Apple
- **WHEN** una persona que ya tiene una cuenta asociada a ese identificador de Google/Apple (o al mismo correo verificado) elige "Continuar con Google" o "Continuar con Apple"
- **THEN** el sistema inicia su sesión inmediatamente sin volver a pedirle confirmación de `@usuario`, recuperando su saldo de monedas, retos e historial

## MODIFIED Requirements

### Requirement: Registro instantáneo sin fricción desde link de invitación
El sistema SHALL permitir que un visitante que abre el enlace de un desafío (`/r/[code]`) se autentique con Google o Apple (confirmando su `@usuario` únicamente si es su primera vez) para iniciar una sesión persistente y quedar habilitado en la misma pantalla para aceptar el desafío, omitiendo por completo el paso de login cuando el dispositivo ya posea una sesión activa.

#### Scenario: Invitado nuevo abre link de desafío y se registra
- **WHEN** un visitante sin sesión activa en el dispositivo abre el enlace de un desafío, elige "Continuar con Google" o "Continuar con Apple" y confirma su Nombre y un `@usuario` disponible
- **THEN** el sistema crea el perfil del usuario, emite una sesión activa persistente en el dispositivo, le acredita el bono inicial de bienvenida (100 monedas) y lo mantiene en la vista del desafío listo para aceptar

#### Scenario: Nombre de usuario ya ocupado
- **WHEN** un visitante nuevo intenta confirmar en su primer ingreso un `@usuario` que ya pertenece a otra cuenta
- **THEN** el sistema rechaza ese `@usuario` indicando que no está disponible y sugiere variantes libres sin perder la validación de Google o Apple ni los datos del desafío

#### Scenario: Dispositivo ya logueado abre el enlace de un reto
- **WHEN** un usuario que ya inició sesión previamente en ese dispositivo o navegador abre el enlace de invitación de un desafío (`/r/[code]`)
- **THEN** el sistema no le solicita iniciar sesión nuevamente y le muestra directamente la tarjeta del desafío con el botón "Aceptar Reto ahora" para seguir sumando monedas o retos

### Requirement: Puerta de entrada dual desde el sitio institucional
El sistema SHALL proveer una ruta de acceso (`/entrar`) que soporte el ingreso desde los botones del sitio institucional (`?modo=nuevo` y `?modo=ingresar`) mediante Google o Apple, redirigiendo automáticamente al tablero principal (`/`) si el dispositivo ya cuenta con una sesión activa.

#### Scenario: Visitante con sesión activa abre el enlace desde el sitio web
- **WHEN** un usuario que ya tiene una sesión activa en `localStorage` navega a `/entrar` (en cualquier modo)
- **THEN** el sistema lo redirige automáticamente a `/` sin mostrar botones de inicio de sesión

#### Scenario: Nuevo jugador entra desde el botón de crear perfil
- **WHEN** un visitante sin sesión activa abre `/entrar` o `/entrar?modo=nuevo`
- **THEN** el sistema muestra la tarjeta de acceso con los botones 3D "Continuar con Google" y "Continuar con Apple" y al autenticar una cuenta nueva solicita confirmar su `@usuario` antes de acreditar las 100 monedas de bienvenida

#### Scenario: Jugador recurrente entra desde el botón "Ya tengo perfil"
- **WHEN** un visitante sin sesión activa abre `/entrar?modo=ingresar` o selecciona "Ya tengo perfil"
- **THEN** el sistema muestra los botones 3D "Continuar con Google" y "Continuar con Apple" y al elegir su proveedor restaura su sesión existente directamente sin pasos adicionales

## REMOVED Requirements

### Requirement: Vinculación de cuenta mediante Mensaje Inverso a WhatsApp
**Reason**: Reemplazado por la autenticación directa e integrada con Google (Gmail) y Apple desde el primer ingreso, eliminando la necesidad de un bot de WhatsApp y códigos `VINC-XXXXXX`.
**Migration**: La identidad verificada del usuario se obtiene directamente del token OAuth/OIDC de Google o Apple en `POST /auth/oauth/verify`.

### Requirement: Recuperación de sesión sin contraseña vía Bot de WhatsApp
**Reason**: Reemplazado por el inicio de sesión con un toque mediante Google o Apple directamente en la aplicación web.
**Migration**: Los usuarios existentes reingresan desde cualquier dispositivo seleccionando "Continuar con Google" o "Continuar con Apple" en `/entrar`, `/perfil`, `/crear` o `/r/[code]`.
