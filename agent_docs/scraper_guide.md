# Guía de scrapers e ingesta (Novedades)

Pipeline de ingesta multi-fuente con clasificación IA. Cubre: contrato de
fuentes, pipeline del service, storage de media (S3) y cómo sumar una fuente
nueva.

## Contrato de fuente

Cada fuente implementa el protocolo `FuenteNovedad`
([backend/app/scrapers/novedades/base.py](../backend/app/scrapers/novedades/base.py)):
solo sabe **traer** contenido crudo (`fetch_recientes() -> list[NovedadCruda]`).
No clasifica, no deduplica, no persiste — eso es responsabilidad exclusiva de
`novedad_service`. Mantener ese límite es lo que permite enchufar fuentes
nuevas sin tocar el pipeline.

Fuentes actuales:
- **`utn_web.py`**: home de FRRO. Notas (`div.blog-post-content`) + sección
  "Fechas Importantes". Contenido de texto, `usar_vision=False`.
- **`instagram.py`**: posts de los centros, **sin credenciales**. Descarga la
  imagen, `usar_vision=True` (el LLM clasifica leyendo el flyer).

  Lee el endpoint web público `/api/v1/feed/user/<handle>/username/`. La única
  condición para que responda es **presentar un handshake TLS de browser
  real**: Instagram clasifica por fingerprint (JA3/HTTP2), no solo por IP, y a
  `requests`/`httpx` los corta con 401/429 al primer request incluso desde una
  IP residencial. Por eso el módulo usa `curl_cffi` con
  `impersonate="chrome"` — con eso los mismos endpoints devuelven 200 desde
  una Lambda, sin login, sin sesión y sin rate-limit observable.

  **No usar `requests`/`httpx`/`instagrapi` contra Instagram**: el problema no
  es la IP ni la reputación de la cuenta, es el fingerprint del cliente TLS.

  Detalles que importan:
  - El endpoint es *por username*, así que no hace falta resolver el `user_id`
    antes (ese lookup era justo el que más rate-limit comía).
  - `web_profile_info` sirve para lo mismo pero **rompe con 400** en cuentas
    business (le pasa a `@sauutnrosario`); el endpoint de feed no.
  - Las **stories** son lo único que sigue detrás del login. Se traen
    best-effort si hay `INSTAGRAM_SESSIONID`; si falta o vence, se saltean y
    la ingesta sigue con los posts. Nunca son camino crítico.

## Pipeline (`novedad_service.run_ingesta_novedades`)

Por fuente, en orden:

1. **Fetch** — `fuente.fetch_recientes()`.
2. **Dedup exacto** (antes del LLM, control de costos RNF-11) — se filtran
   los `external_id` ya existentes en `NovedadFuente` (clave única).
3. **Clasificación IA** — `ai/clasificador_novedades.py`, recibe el crudo +
   contexto de las últimas novedades registradas (para el paso siguiente).
4. **Dedup semántico** — si el LLM marca `duplicado_de` (mismo hecho que una
   novedad ya registrada), se suma como una fuente más (`agregar_fuente`) en
   vez de crear una novedad nueva. Así una misma novedad puede tener múltiples
   `NovedadFuente` (ej. un mismo aviso publicado por dos centros).
5. **Gate de estado** — `es_novedad=False` → descartada; `confianza >=
   NOVEDADES_UMBRAL_PUBLICAR` → publicada directo; si no, pendiente de
   moderación manual (`PATCH /novedades/{id}/moderar`).
6. **Persistencia + `ingesta_log`** (auditoría, RNF-08).

Es un callable host-agnóstico (`run_ingesta_novedades(db, fuentes)`) — lo
llama tanto el endpoint `POST /novedades/sincronizar` como el scheduler
in-process (`workers/scheduler.py`, apagado por defecto vía
`SCHEDULER_ENABLED`). Pensado para migrar a serverless sin reescribir lógica.

## Orden y fechas: ingesta vs evento

`Novedad.created_at` es la fecha en la que **nosotros** ingerimos el
contenido. `Novedad.fecha_publicacion` es la fecha real del contenido
(`taken_at` de IG, o la fecha del evento en "Fechas Importantes" del sitio
web). **El feed ordena por `fecha_publicacion`** (con fallback a
`created_at` si la fuente no la expone, ej. notas web) —
`novedad_repo.listar()`. Si se ordenara por `created_at`, un backfill de
posts viejos de IG aparecería mezclado con contenido genuinamente nuevo solo
por haberse ingerido hoy.

## Storage de media (S3)

Las URLs de origen (CDN de Instagram) son firmadas y **expiran en
horas/días**. Por eso `_guardar_evidencia()` en
[novedad_service.py](../backend/app/services/novedad_service.py) sube una
copia propia y esa es la URL que se persiste como `imagen_url`/`imagen_path`
(tanto en `Novedad` como en cada `NovedadFuente`) — no la de origen.

- Implementación en [`app/core/storage.py`](../backend/app/core/storage.py):
  `subir(contenido, key, content_type)` sube a S3 vía `boto3` y devuelve la
  URL pública, o `None` si S3 no está configurado o falla la subida
  (best-effort: un fallo de storage no debe tumbar la ingesta).
- **Fallback a disco local** (`NOVEDADES_MEDIA_DIR`) si `AWS_S3_BUCKET` /
  credenciales no están seteadas — para dev sin AWS configurado.
- Config: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
  `AWS_S3_BUCKET` (ver `.env.example`).
- **Bucket**: `utnhub-novedades-media` (us-east-1), público de **solo
  lectura** — bucket policy con `s3:GetObject` para `Principal: *` (nadie
  puede listar ni escribir sin credenciales). El backend sube con un usuario
  IAM (`utnhub-backend-s3`) con una policy acotada a
  `PutObject`/`GetObject`/`DeleteObject` sobre ese bucket únicamente (no
  `AmazonS3FullAccess`).
- Convención de key: `novedades/<external_id_sanitizado>.<ext>`.
- Pendiente: backfill de las novedades ya ingeridas antes de esto (sus
  `imagen_path`/`imagen_url` locales o de CDN expirado no se migraron).

## Sumar una fuente nueva

1. Implementar `FuenteNovedad` (`fetch_recientes`) en `scrapers/novedades/`.
2. Registrarla en `construir_fuentes()` (`novedad_service.py`), atrás de un
   flag de config si requiere credenciales opcionales.
3. Si es un centro de estudiantes, sumarlo a `CENTROS_CONOCIDOS` (nombre,
   logo, url de perfil) — si no está mapeado, se crea con defaults del
   handle.
4. `external_id` debe ser estable y único por fuente (es la clave de dedup
   exacto) — seguir el patrón `<fuente>:<id_o_slug>`.
