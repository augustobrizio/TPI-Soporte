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
| Dependencias | liviana (`httpx` + `bs4`) | `curl_cffi` (binario de curl-impersonate) |
| Riesgo | ninguno, scraping público | puede ser rate-limiteada/bloqueada por Meta |
| Estado externo | ninguno | ninguno (ya no hay sesión que persistir) |
| Trigger | EventBridge, `rate(7 days)` | EventBridge, `rate(6 hours)` |

Si Instagram falla o queda bloqueada, no debe tumbar la ingesta del sitio
web (y viceversa) — de ahí la separación.

## Por qué imagen de contenedor, no zip

Lambda soporta desplegar código como `.zip` (con el runtime que administra
AWS) o como imagen de contenedor (hasta 10GB, vía ECR). Se eligió **imagen
de contenedor** porque:

- Las dependencias reales (`curl_cffi`, `psycopg2`, `langchain-openai`)
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
- **`secrets/*`** — **obsoleto**. Guardaba la sesión de `instagrapi`. Desde
  que la ingesta lee Instagram sin credenciales (ver abajo) no hay sesión que
  persistir y el prefijo quedó sin uso. Se conserva privado, sin policy
  pública.

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
- **Proxy residencial para Instagram**: ya no hace falta. Se creía que el
  bloqueo era por IP de datacenter y resultó ser por fingerprint TLS (abajo);
  desde Lambda, con un handshake de browser, los endpoints públicos responden
  200 sin proxy.
- **Backfill de imágenes**: algunas novedades quedaron con placeholder en
  vez de imagen propia por fallos de S3 durante el debugging de esta
  infraestructura (ya resueltos) — el dedup por `external_id` no las va a
  reprocesar solas.

## Acceso a Instagram: el bloqueo era el fingerprint TLS (ago 2026)

La ingesta de Instagram estuvo caída ~7 semanas sin que nadie se enterara (ver
"falla silenciosa" abajo). El primer diagnóstico concluyó que no había salida:
la lectura anónima daba `429` **incluso desde una IP residencial**, el login
mobile daba `bad_password` con la contraseña correcta y el login web moría en
`AuthPlatformAntiScriptingException` → checkpoint.

Las observaciones eran correctas; la inferencia no. Instagram clasifica
clientes por el **handshake TLS** (JA3/JA4 + perfil HTTP/2), no solo por la
reputación de la IP. `requests`, `httpx` y `urllib3` tienen firmas fijas que el
WAF reconoce y corta **antes de mirar de dónde viene el request** — por eso el
`429` aparecía igual desde Rosario que desde `us-east-1`, y parecía un
rate-limit inesquivable cuando era una clasificación binaria.

La solución es [`curl_cffi`](https://github.com/lexiforest/curl_cffi), un
binding de `curl-impersonate` que replica el handshake de un browser real.

Medido el 2026-08-30 con una Lambda de diagnóstico desplegada a propósito para
separar la variable *IP* de la variable *fingerprint*:

| Cliente | Origen | Resultado |
|---|---|---|
| `requests` / `httpx` / `curl` | IP residencial | `429` al primer request |
| `requests` / `httpx` | Lambda `us-east-1` | `401` en los 4 handles |
| `curl_cffi` (`impersonate="chrome"`) | IP residencial | `200`, 12 posts |
| `curl_cffi` (`impersonate="chrome"`) | Lambda `us-east-1` | `200`, 12 posts, 4/4 handles |

Y sobre estabilidad, desde Lambda: **24 requests consecutivos, 200 en todos**,
sin warmup, sin cookies y con sesión nueva por ronda. Funciona con cualquier
target moderno (`chrome`, `chrome131`, `safari`, `firefox`): lo que importa es
no parecer una librería HTTP de Python.

### Consecuencias de diseño

- **No hay credenciales de Instagram.** Se eliminaron `instagrapi`, la escalera
  de login, el fingerprint de device y la sesión persistida en S3. La fuente ya
  no tiene estado externo ni nada que pueda vencerse.
- Se usa `GET /api/v1/feed/user/<handle>/username/`, que es **por username**:
  desaparece el lookup previo de `user_id`, que era justo el request que más
  rate-limit comía. Además no rompe en cuentas business, donde
  `web_profile_info` devuelve un `400` del propio backend de Instagram
  (`ig_business_category_subvertical has been deleted`).
- **Las stories siguen detrás del login** y son el único contenido que lo
  exige: sin sesión el endpoint devuelve `200` con `{"reels":{}}`, vacío y sin
  error. Se traen best-effort si hay `INSTAGRAM_SESSIONID` y su ausencia o
  vencimiento **nunca** rompe la ingesta de posts.

### Por qué la sesión anterior duraba días (post-mortem)

Vale registrarlo porque explica el síntoma original. En la ventana de julio en
que la ingesta sí funcionó, el guardado de la sesión en S3 **falló en todas las
corridas** con `InvalidAccessKeyId` (el gotcha de credenciales temporales de
más arriba, corregido después).

Consecuencia: cada invocación construía un cliente nuevo con un **device
fingerprint aleatorio distinto** y readoptaba el mismo `sessionid`. Instagram
vio una sola cookie saltando entre ~20 "teléfonos Android" en 5 días y la
invalidó. La sesión no venció sola: la mataron por comportamiento
inconsistente.

### Falla silenciosa (corregido)

`fetch_recientes()` devolvía `[]` cuando fallaban *todos* los handles, y el
service lo leía como "no había nada nuevo" → `estado=ok` en `ingesta_log`.
Un fallo total era indistinguible de una corrida sana. Ahora, si fallan
todos, se propaga la excepción → `estado=error`, y el handler de Lambda
loguea `INGESTA_FALLIDA` y devuelve `{"ok": false}`.

El mismo criterio se sostiene en el diseño nuevo: si fallan todos los handles
se propaga; si falla uno, se sigue con el resto.

## Clasificador: qué llega al LLM

Entre el fetch y la clasificación hay tres filtros, todos para que la llamada
cara corra lo menos posible:

1. **Dedup exacto** por `external_id` — lo ya visto no se reclasifica nunca.
2. **Corte por antigüedad** (`NOVEDADES_ANTIGUEDAD_MAX_DIAS`, default 90). El
   feed de un perfil devuelve sus 12 últimos posts **sin ventana temporal**: en
   cuentas poco activas eso se remonta años, y cada item cuesta ~28.000 tokens
   porque va con la imagen a visión. Sin este corte se gastaba una llamada de
   visión en saludos navideños de 2024. Los items **sin** fecha pasan igual:
   preferimos gastar la clasificación antes que esconder algo por no saber
   cuándo se publicó.
3. **Tope por corrida** (`NOVEDADES_MAX_ITEMS_POR_CORRIDA`, default 40).

El prompt (`app/ai/prompts/novedades.py`) recibe la fecha de hoy y la de
publicación. Sin eso el modelo no podía saber que "Inscripción al Ciclo Lectivo
2024" estaba vencida y la publicaba con confianza 1.0.

## Moderación manual

`PATCH /novedades/{id}/moderar` (rol `admin`) corrige el estado en los dos
sentidos: republicar lo que el clasificador descartó mal, o bajar lo que
publicó de más.

`novedad.estado_llm` guarda lo que decidió el modelo y **la moderación no lo
pisa**; `novedad.moderado_manual` marca que intervino un humano. Así

```sql
WHERE moderado_manual AND estado <> estado_llm
```

devuelve la lista de errores del clasificador, que es el insumo con el que se
refina el prompt.
