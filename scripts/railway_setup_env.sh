#!/usr/bin/env bash
#
# Carga las variables de entorno de UTNHub en Railway leyendo backend/.env.
#
#   ./scripts/railway_setup_env.sh <URL_BACKEND> <URL_FRONTEND>
#
# Ejemplo:
#   ./scripts/railway_setup_env.sh \
#       https://utnhub-backend.up.railway.app \
#       https://utnhub-frontend.up.railway.app
#
# Los nombres de los servicios se pueden pisar por entorno si en el panel
# quedaron con otro nombre:
#   SERVICIO_BACKEND=UTNHub ./scripts/railway_setup_env.sh <back> <front>
#
# Es bash: correrlo desde Git Bash / WSL, no desde cmd.exe ni PowerShell.

set -euo pipefail

SERVICIO_BACKEND="${SERVICIO_BACKEND:-utnhub-backend}"
SERVICIO_FRONTEND="${SERVICIO_FRONTEND:-utnhub-frontend}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVO_ENV="${ARCHIVO_ENV:-$RAIZ/backend/.env}"

fatal() {
    echo "ERROR: $*" >&2
    exit 1
}

# --- Validacion de argumentos ------------------------------------------------

if [[ $# -ne 2 ]]; then
    cat >&2 <<'USO'
ERROR: faltan argumentos.

Uso:
  ./scripts/railway_setup_env.sh <URL_BACKEND> <URL_FRONTEND>

Las dos URLs salen de `railway domain --service <servicio>`. Generalas ANTES
de correr esto: el backend necesita la URL del frontend para CORS y el
frontend necesita la del backend para pegarle a la API.
USO
    exit 1
fi

URL_BACKEND="${1%/}"   # sin barra final: se concatena con paths mas adelante
URL_FRONTEND="${2%/}"

for url in "$URL_BACKEND" "$URL_FRONTEND"; do
    [[ "$url" =~ ^https?:// ]] || fatal "'$url' no parece una URL (falta http:// o https://)."
done

[[ -f "$ARCHIVO_ENV" ]] || fatal "no existe $ARCHIVO_ENV. Copiá backend/.env.example y completalo."

command -v railway >/dev/null 2>&1 || fatal "no encuentro la CLI de railway en el PATH."

# --- Lectura del .env --------------------------------------------------------
#
# A mano y no con `source`: el .env tiene valores con `&` (la URL de Neon lleva
# ?sslmode=require&channel_binding=require) y con `=` adentro (el padding `==`
# de las API keys en base64). Un `source` interpretaria el `&` como control de
# shell y mandaria medio valor al fondo; el split se hace solo en el PRIMER `=`.

declare -A ENV_VARS=()

while IFS= read -r linea || [[ -n "$linea" ]]; do
    linea="${linea%$'\r'}"                       # CRLF: el .env se edita en Windows
    [[ -z "${linea//[[:space:]]/}" ]] && continue
    [[ "$linea" =~ ^[[:space:]]*# ]] && continue
    [[ "$linea" != *=* ]] && continue

    clave="${linea%%=*}"
    valor="${linea#*=}"

    clave="${clave#"${clave%%[![:space:]]*}"}"   # trim de espacios alrededor
    clave="${clave%"${clave##*[![:space:]]}"}"
    clave="${clave#export }"

    # Comillas envolventes: se sacan solo si abren Y cierran, para no romper un
    # valor que legitimamente empiece o termine con comilla.
    if [[ "$valor" == \"*\" && ${#valor} -ge 2 ]]; then
        valor="${valor:1:${#valor}-2}"
    elif [[ "$valor" == \'*\' && ${#valor} -ge 2 ]]; then
        valor="${valor:1:${#valor}-2}"
    fi

    [[ -z "$clave" ]] && continue
    ENV_VARS["$clave"]="$valor"
done < "$ARCHIVO_ENV"

leer() { printf '%s' "${ENV_VARS[$1]:-}"; }

# --- Variables obligatorias --------------------------------------------------

DATABASE_URL="$(leer DATABASE_URL)"
[[ -n "$DATABASE_URL" ]] || fatal "DATABASE_URL vacia en $ARCHIVO_ENV."

# Con ENVIRONMENT=prod el backend no arranca sin JWT_SECRET. Si el .env ya trae
# uno se respeta (puede haber sesiones vivas firmadas con esa clave); si no,
# se genera uno nuevo acá.
JWT_SECRET="$(leer JWT_SECRET)"
if [[ -z "$JWT_SECRET" ]]; then
    if command -v openssl >/dev/null 2>&1; then
        JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
    elif command -v python >/dev/null 2>&1; then
        JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
    else
        fatal "JWT_SECRET vacio y no hay openssl ni python para generar uno."
    fi
    echo "  · JWT_SECRET vacio en el .env: se genera uno nuevo para produccion."
fi

# --- Armado del set de variables del backend ---------------------------------

args_backend=()
agregar() { args_backend+=(--set "$1=$2"); }

# Overrides de produccion, en orden de importancia.
agregar DATABASE_URL   "$DATABASE_URL"
agregar ENVIRONMENT    "prod"
agregar JWT_SECRET     "$JWT_SECRET"
agregar CORS_ORIGINS   "$URL_FRONTEND"

# La ingesta sigue corriendo en las Lambdas de AWS. Dos schedulers contra la
# misma base duplican trabajo y queman tokens de OpenAI al pedo.
agregar SCHEDULER_ENABLED "false"

# El resto se copia tal cual del .env si tiene valor.
PASAR_SI_EXISTE=(
    JWT_EXPIRE_MINUTES
    OPENAI_API_KEY
    NOVEDADES_LLM_MODEL
    NOVEDADES_UMBRAL_PUBLICAR
    NOVEDADES_MAX_ITEMS_POR_CORRIDA
    NOVEDADES_MEDIA_DIR
    UTN_NOVEDADES_URL
    INGESTA_INSTAGRAM_HORAS
    INGESTA_UTN_WEB_HORAS
    LANGSMITH_TRACING
    LANGSMITH_API_KEY
    LANGSMITH_PROJECT
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_REGION
    AWS_S3_BUCKET
)

for clave in "${PASAR_SI_EXISTE[@]}"; do
    valor="$(leer "$clave")"
    [[ -n "$valor" ]] && agregar "$clave" "$valor"
done

# --- Aplicar -----------------------------------------------------------------

echo "Backend  → servicio '$SERVICIO_BACKEND' (${#args_backend[@]} flags, CORS_ORIGINS=$URL_FRONTEND)"
railway variables --service "$SERVICIO_BACKEND" "${args_backend[@]}"

# NEXT_PUBLIC_API_URL se inlinea en tiempo de BUILD. Setearla acá sirve para que
# el proximo build la tome; si el frontend ya estaba deployado apuntando a otro
# lado, hay que rebuildear (un restart no alcanza).
echo "Frontend → servicio '$SERVICIO_FRONTEND' (NEXT_PUBLIC_API_URL=$URL_BACKEND)"
railway variables --service "$SERVICIO_FRONTEND" --set "NEXT_PUBLIC_API_URL=$URL_BACKEND"

cat <<FIN

Listo. Recordá:
  · NEXT_PUBLIC_API_URL vale desde el proximo build del frontend, no ya mismo.
  · Si la base de Neon es nueva, corré 'CREATE EXTENSION vector;' ANTES del
    primer deploy: Alembic no la crea y el pre-deploy corta el despliegue.
FIN
