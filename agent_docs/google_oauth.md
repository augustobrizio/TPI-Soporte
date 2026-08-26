# Login con Google (OAuth 2.0 / OpenID Connect)

Guía de puesta en marcha. El código ya está: **solo falta crear el cliente OAuth
en Google Cloud Console y pegar las dos credenciales en `backend/.env`.**

Mientras `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` estén vacíos, el botón
"Continuar con Google" no se renderiza y el resto del login (email + password)
funciona igual. No hay que tocar código para prenderlo o apagarlo.

---

## 1. Crear el cliente OAuth en Google

1. Entrar a <https://console.cloud.google.com/> y elegir (o crear) el proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**
   - Tipo de usuario: **Externo**.
   - Cargar nombre de la app ("UTNHub"), mail de soporte y mail de contacto.
   - Permisos: dejar los tres de siempre (`openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`). No hace falta pedir nada más — son los
     únicos scopes que usa el backend.
   - Mientras la app esté en modo **Prueba**, solo entran las cuentas cargadas
     en "Usuarios de prueba". Para abrirla a cualquiera hay que **Publicar**.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**
   - Tipo de aplicación: **Aplicación web**.

### Las URLs que hay que cargar

En la misma pantalla, dos campos:

| Campo | Valor (dev) | Valor (prod) |
|---|---|---|
| Orígenes autorizados de JavaScript | `http://localhost:3000` | `https://TU-DOMINIO` |
| **URIs de redireccionamiento autorizados** | `http://localhost:3000/api/auth/google/callback` | `https://TU-DOMINIO/api/auth/google/callback` |

> **Ojo:** el redirect va al **frontend**, no al backend. Google devuelve al
> usuario a Next, que es quien puede escribir la cookie de sesión (ver abajo).
> Se pueden cargar las de dev y las de prod al mismo tiempo en el mismo cliente.

Google compara el `redirect_uri` **byte a byte**: `http` vs `https`, una barra
final de más o `127.0.0.1` en vez de `localhost` dan `redirect_uri_mismatch`.

## 2. Pegar las credenciales

En `backend/.env`:

```
GOOGLE_CLIENT_ID=1234567890-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
```

Reiniciar el backend (`docker compose restart backend`). El botón aparece solo:
el frontend le pregunta al backend en cada render si está configurado.

### Restricción de dominio — apagada

**Entra cualquier cuenta de Google.** RNF-04 hablaba de restringir a
`@frro.utn.edu.ar`, pero se decidió no aplicarlo: muchos alumnos usan su cuenta
personal y dejar afuera a quien no tenga la institucional a mano cuesta más de
lo que aporta. Va en línea con el registro por contraseña, que tampoco filtra
por dominio.

El chequeo igual quedó **implementado y testeado** por si el criterio cambia:
alcanza con setear la variable, sin tocar código.

```
GOOGLE_DOMINIOS_PERMITIDOS=                                  # default: sin restricción
GOOGLE_DOMINIOS_PERMITIDOS=frro.utn.edu.ar                   # solo institucional
GOOGLE_DOMINIOS_PERMITIDOS=frro.utn.edu.ar,alumnos.utn.edu.ar
```

Con la restricción activa, una cuenta de otro dominio recibe un 403 con el
motivo explícito (no un error genérico): sin decir cuál es el dominio esperado,
el usuario reintenta con la misma cuenta para siempre.

**En producción** hay un paso más, en `frontend/.env`:

```
APP_URL=https://TU-DOMINIO
```

Detrás de un proxy (Cloud Run, Amplify) el host que ve Next puede no ser el que
el usuario tiene en la barra, y el `redirect_uri` tiene que coincidir exacto con
el registrado. En dev se deja vacío y se deriva del request.

El `client_secret` vive **solo en el backend**. El frontend nunca lo ve.

---

## Cómo funciona

```
browser                    Next (frontend)              FastAPI (backend)         Google
   │                             │                            │                     │
   │ click "Continuar con Google"│                            │                     │
   ├────────────────────────────>│ GET /api/auth/google/start │                     │
   │                             │  genera `state` + PKCE     │                     │
   │                             ├───────────────────────────>│ GET /auth/google/   │
   │                             │  (manda el `challenge`)    │     autorizar       │
   │                             │<───────────────────────────┤ { url }             │
   │                             │  cookie `state` + verifier │                     │
   │<────────────────────────────┤  302 a accounts.google.com │                     │
   ├─────────────────────────────────────────────────────────────────────────────> │
   │                             │                            │  elige cuenta       │
   │<──────────────────────────────────────────────────────────────────────────────┤
   │ 302 a /api/auth/google/callback?code=…&state=…           │                     │
   ├────────────────────────────>│  valida `state` vs cookie  │                     │
   │                             ├───────────────────────────>│ POST /auth/google   │
   │                             │  (manda code + verifier)   │  canjea code ───────>
   │                             │                            │  valida id_token    │
   │                             │                            │  crea/vincula user  │
   │                             │<───────────────────────────┤ { access_token, … } │
   │<────────────────────────────┤  Set-Cookie utnhub_session │                     │
   │  302 al destino             │  (httpOnly)                │                     │
```

### Por qué el callback cae en el frontend y no en el backend

La cookie de sesión es **httpOnly y del mismo origen que el browser**, y el
único que puede escribirla es Next. Es la misma regla que ya seguían
`/api/auth/login` y `/api/auth/register`: el backend emite el JWT en el body, el
route handler de Next lo convierte en cookie. Si el callback cayera en FastAPI,
habría que mandar la sesión cross-site entre dos servicios distintos.

### Decisiones que conviene no revertir sin pensarlo

- **Todo lo de Google vive en el backend** (client id, secret, scopes,
  validación). El frontend pide la URL de autorización y reenvía el `code`. Si
  el client id estuviera duplicado en los dos servicios, un valor desincronizado
  daría un `invalid_client` bastante difícil de rastrear.
- **`state` obligatorio.** Va en una cookie httpOnly de un solo uso, con `path`
  acotado a `/api/auth/google` y 10 minutos de vida. Sin él existe el *CSRF de
  login*: un tercero arranca el flow con su cuenta, le hace abrir a la víctima
  el callback con ese `code`, y la deja escribiendo dentro de la cuenta ajena.
- **PKCE (RFC 7636) obligatorio.** El `code_verifier` se genera en `/start`,
  vive en la cookie httpOnly y recién viaja al backend en el canje. Como
  cliente confidencial (el backend tiene `client_secret`) sería opcional; se
  usa igual porque OAuth 2.1 lo recomienda para todos y ata el `code` a quien
  inició el flow. El campo es **requerido** en el schema: omitirlo da 422, no
  un login sin PKCE.
- **`email_verified` obligatorio.** El backend vincula por email una cuenta
  preexistente de UTNHub con una de Google. Eso es seguro *solo* porque antes
  exige que Google haya verificado la dirección; sin ese chequeo, cualquiera
  registra un Google con el mail de otro y se queda con su cuenta.
- **Si se activa la restricción de dominio, se valida en el servidor**, no con
  el parámetro `hd` de Google: `hd` solo pre-filtra el selector de cuentas, no
  impide mandar otra a mano.
- **El vínculo real es `google_sub`, no el email.** Si el usuario cambia su mail
  en Google, se lo sigue reconociendo; el email de UTNHub no se pisa.
- **Los errores viajan como código, no como texto** (`?error=google_estado`). Un
  `?error=` con texto libre deja mostrar un mensaje inventado —"tu sesión venció,
  llamá al 0800…"— alojado en nuestro propio dominio. El texto sale de una tabla
  en `LoginForm`.

### Cuentas mixtas

Una cuenta puede tener contraseña local, Google vinculado, o las dos:

- Quien ya tenía cuenta con email + password y entra con Google, queda vinculado
  y de ahí en más puede usar cualquiera de las dos vías. La contraseña sigue
  funcionando.
- Quien entra por primera vez con Google no tiene contraseña local
  (`usuario.password` queda en NULL) y no puede usar `/auth/login` hasta que se
  implemente un "definir contraseña" desde el perfil.

---

## Archivos

| Archivo | Qué hace |
|---|---|
| `backend/app/services/google_oauth.py` | Cliente de Google: URL de autorización (+ PKCE), canje del code, validación del id_token contra las JWKS |
| `backend/app/services/auth_service.py` | `autenticar_con_google`: alta, vinculación y reglas de negocio |
| `backend/app/api/auth.py` | `GET /auth/google/config`, `GET /auth/google/autorizar`, `POST /auth/google` |
| `frontend/src/lib/googleOAuth.ts` | Cookies, `redirect_uri`, llamadas al backend |
| `frontend/src/app/api/auth/google/start/route.ts` | Genera el `state` y redirige a Google |
| `frontend/src/app/api/auth/google/callback/route.ts` | **La URL que va en Google Cloud Console.** Valida el `state` y setea la sesión |
| `frontend/src/features/auth/BotonGoogle.tsx` | El botón y el separador |
| `backend/tests/test_google_oauth.py` | 31 tests: validación del id_token, PKCE, alta/vinculación, filtro de dominio (opcional), endpoints |

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| `Error 400: redirect_uri_mismatch` | La URI de redireccionamiento en Google no coincide **exacta** con la de la app. En prod, revisar `APP_URL`. |
| `Error 401: invalid_client` | `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` mal pegados, o el cliente es de otro proyecto. |
| El botón no aparece | El backend no tiene credenciales, o está caído. Verificar con `curl localhost:8000/auth/google/config`. |
| `Tenés que ingresar con tu cuenta institucional` | Alguien seteó `GOOGLE_DOMINIOS_PERMITIDOS`. Vaciarla para volver al default sin restricción. |
| `?error=google_estado` | La cookie de `state` venció (>10 min), el flow se abrió en otra pestaña, o se recargó el callback. Reintentar. |
| `Acceso bloqueado: no se completó el proceso de verificación` | La app está en modo Prueba y esa cuenta no está en "Usuarios de prueba". |
