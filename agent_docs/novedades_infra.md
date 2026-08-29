# Infraestructura de Novedades (S3 + Lambda)

El pipeline de ingesta de Novedades (ver [`scraper_guide.md`](scraper_guide.md)
para la lógica del pipeline en sí) corre hoy en **dos Lambdas de AWS**,
independientes entre sí, disparadas por EventBridge. Este doc cubre la capa
de infraestructura: qué existe, por qué está armado así, y los gotchas que
costó descubrir.

## Por qué dos Lambdas, no una

Cada fuente tiene un perfil de riesgo/dependencias/horario distinto:

| | `utnhub-ingesta-utn-web` | `utnhub-ingesta-instagram` |
|---|---|---|
| Dependencias | liviana (`httpx` + `bs4`) | pesada (`instagrapi`) |
| Riesgo | ninguno, scraping público | puede ser rate-limiteada/bloqueada por Meta |
| Estado externo | ninguno | sesión de IG persistida |
| Trigger | EventBridge, `rate(7 days)` | EventBridge, `rate(6 hours)` |

Si Instagram falla o queda bloqueada, no debe tumbar la ingesta del sitio
web (y viceversa) — de ahí la separación.

## Por qué imagen de contenedor, no zip

Lambda soporta desplegar código como `.zip` (con el runtime que administra
AWS) o como imagen de contenedor (hasta 10GB, vía ECR). Se eligió **imagen
de contenedor** porque:

- Las dependencias reales (`instagrapi`, `psycopg2`, `langchain-openai`)
  superan cómodo el límite de 250MB descomprimido de un zip.
- `psycopg2` tiene extensiones en C — compilarlo en Windows/Mac produce
  binarios incompatibles con el runtime real de Lambda (Amazon Linux). El
  Dockerfile usa `FROM public.ecr.aws/lambda/python:3.12` (la imagen base
  oficial de AWS) y corre `pip install` *adentro*, garantizando binarios
  correctos.
- Se puede probar local con el Runtime Interface Emulator (RIE, incluido en
  la imagen base) antes de desplegar nada: `docker run -p 9000:8080 <imagen>`
  + `curl http://localhost:9000/2015-03-31/functions/function/invocations`.

Cada Lambda tiene su propio `requirements-lambda-*.txt`, deliberadamente
recortado — no es `pyproject.toml` completo. Se confirmó rastreando los
imports reales de `run_ingesta_novedades` para cada fuente que no hace
falta fastapi/langgraph/pandas/pymupdf/etc.

Archivos: `backend/Dockerfile.lambda-utn-web`, `backend/Dockerfile.lambda-instagram`,
`backend/requirements-lambda-*.txt`, `backend/app/lambda_handlers/*.py`
(un `handler(event, context)` fino por fuente, llama al mismo callable que
usa el scheduler in-process y el endpoint `/novedades/sincronizar`).

## S3 (bucket `utnhub-novedades-media`)

Dos usos, dos prefijos con permisos distintos:

- **`novedades/*`** — copia propia de las imágenes (las URLs de origen, ej.
  CDN de Instagram, expiran en horas/días). Público de solo lectura
  (`s3:GetObject` para `Principal: *`, acotado a este prefijo en la bucket
  policy — no al bucket entero).
- **`secrets/*`** — sesión de Instagram persistida (`instagrapi` la dumpea
  como JSON). **Privado**, sin policy pública. Necesario porque Lambda solo
  tiene `/tmp` escribible y no persiste entre invocaciones frías — sin esto,
  cada cold start forzaría un login nuevo (justo el escenario de
  challenge/rate-limit que se quiere evitar). `instagram.py::_login()`
  baja la sesión de S3 al arrancar si no hay una local, y la sube después
  de un login nuevo.

Lógica en `backend/app/core/storage.py` (`subir`/`bajar`/`habilitado`).
Best-effort: un fallo de S3 no debe tumbar la ingesta (cae a disco local en
dev sin AWS configurado).

### Gotcha: credenciales temporales de Lambda

Lambda **no permite** setear `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`
a mano (son nombres reservados) — las inyecta sola, derivadas del rol de
ejecución. Esas credenciales son **temporales**: un trío (access key +
secret + **session token**), no un par. Pasarle a `boto3.client()` solo 2
de los 3 campos (como hacíamos al principio) hace que AWS rechace todo con
`InvalidAccessKeyId` — no alcanza con "si hay access key, pasala explícita"
porque esa access key puede ser la temporal que Lambda ya puso en el
entorno. La regla correcta (`storage.py::_cliente()`): si hay
`AWS_SESSION_TOKEN` seteado, es una credencial temporal → no pasar nada
explícito, dejar que la cadena default de boto3 la resuelva completa.

## IAM

Un rol de ejecución por Lambda (`utnhub-ingesta-<fuente>-role`), cada uno
con: `AWSLambdaBasicExecutionRole` (logs a CloudWatch) + una policy inline
acotada a `s3:PutObject`/`GetObject`/`DeleteObject` sobre
`utnhub-novedades-media/*` únicamente. Nada de `AmazonS3FullAccess`.

Separado de esto, el usuario operador `utnhub-tp` (CLI/Terraform futuro)
tiene sus propios permisos —ECR, Lambda, EventBridge, y un permiso acotado
para gestionar roles con prefijo `utnhub-*`— distinto del usuario de
aplicación `utnhub-backend-s3` (solo S3, es el que corre en local sin rol
de Lambda disponible).

## EventBridge

Trigger vía "Add trigger → EventBridge (CloudWatch Events)" desde la propia
página de cada función — crea la regla y el permiso de invocación sin pasos
de IAM manuales. `rate(7 days)` para la web, `rate(6 hours)` para Instagram.

## Gotchas operativos (Windows + Docker moderno)

- **Manifest no soportado por Lambda**: `docker build` (via BuildKit) agrega
  por default un "provenance/attestation" que convierte la imagen en un
  índice multi-plataforma — Lambda no lo entiende
  (`"image manifest... is not supported"`). Fix: buildear con
  `--provenance=false --sbom=false`.
- **Git Bash + paths que empiezan con `/`**: se interpretan como paths de
  Windows (`/aws/lambda/...` → `C:/Program Files/Git/aws/lambda/...`).
  Prefijo `MSYS_NO_PATHCONV=1` antes del comando `aws` lo evita.
- **Log group de CloudWatch**: se crea recién en la primera invocación
  exitosa, no al crear la función — si lo buscás antes, no existe todavía.

## Costo

A este volumen (4 invocaciones/mes la web, ~120/mes Instagram), tanto el
cómputo de Lambda como EventBridge, ECR (storage de las imágenes) y
CloudWatch Logs quedan muy por debajo de los free tiers permanentes de AWS
— el costo real es, en la práctica, $0. El único gasto real y recurrente es
la clasificación con OpenAI (`gpt-4o-mini`), facturada aparte por OpenAI, y
también de centavos al mes salvo picos de backlog (ej. la primera ingesta
de una cuenta de Instagram nueva).

## Pendiente / próximos pasos

- **IaC**: todo lo de este doc se armó a mano (consola + CLI), a propósito,
  para aprender el terreno antes de codificarlo. Terraform queda pendiente.
- **Proxy residencial para Instagram**: no se agregó — se decidió probar
  primero sin proxy (la sesión persistida evita el login repetido desde IP
  de datacenter, que es el paso más "detectable"). Si Meta empieza a
  bloquear, retomar esa conversación.
- **Backfill de imágenes**: algunas novedades quedaron con placeholder en
  vez de imagen propia por fallos de S3 durante el debugging de esta
  infraestructura (ya resueltos) — el dedup por `external_id` no las va a
  reprocesar solas.

## Autenticación de Instagram: qué funciona y qué no (ago 2026)

La ingesta de Instagram estuvo caída ~7 semanas sin que nadie se enterara
(ver "falla silenciosa" abajo). Al investigarlo se midió lo siguiente:

| Camino | Resultado |
|---|---|
| Lectura anónima (instaloader, sin login) | ❌ `429` ya en el primer request, incluso desde IP residencial con 2 requests/hora. La lectura sin autenticar está muerta. |
| Endpoint público `web_profile_info` | ❌ `429`. Es el fallback de `_user_id()` y nunca conviene llegar ahí. |
| Login mobile de instagrapi (`client.login`) | ⚠️ `bad_password` aun con credenciales correctas — [problema conocido](https://github.com/subzeroid/instagrapi/issues/1498). instagrapi lo aclara en su propio fuente: *"can also happen when Instagram rejects the proxy/IP, device fingerprint, or login context, even if the password is correct"*. |
| **Login web** (`/api/v1/web/accounts/login/ajax/`) | ✅ Funciona como camino programático. Da errores **precisos** (`UserInvalidCredentials` con `user: true/false`) y devuelve el `sessionid` en caso de éxito. |
| `sessionid` de browser | ✅ Funciona, pero es un token estático que vence y requiere un humano. |

Por eso `_autenticar()` implementa esta escalera: `INSTAGRAM_SESSIONID` →
**login web** (renovable, sin humano) → login mobile de instagrapi (último
recurso). El login web es lo que permite obtener un sessionid fresco
programáticamente, sin sacar cookies del browser a mano.

### Falla silenciosa (corregido)

`fetch_recientes()` devolvía `[]` cuando fallaban *todos* los handles, y el
service lo leía como "no había nada nuevo" → `estado=ok` en `ingesta_log`.
Un fallo total era indistinguible de una corrida sana. Ahora, si fallan
todos, se propaga la excepción → `estado=error`, y el handler de Lambda
loguea `INGESTA_FALLIDA` y devuelve `{"ok": false}`.

Además `_login()` valida la sesión con `account_info()` antes de reusarla:
sin eso, una sesión muerta en S3 ganaba para siempre sobre un sessionid
fresco y la ingesta no se recuperaba nunca.
