FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copiar ambos archivos para que cambios en cualquiera invaliden el cache
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

# Logs sin buffer: si Python bufferea stdout, CloudWatch no muestra nada hasta
# que el buffer se llena (o el proceso muere), y se pierde el rastro de errores.
ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# El codigo va DESPUES de las deps: cambiar un .py no reinvalida el layer de
# uv sync. En docker-compose este COPY queda tapado por el bind mount de
# ./backend:/app (por eso alcanzaba sin el en dev), pero App Runner solo
# recibe la imagen: sin esto arrancaria sin codigo.
COPY . .

EXPOSE 8000

# Sin --reload (es de dev: vigila archivos y reinicia, cuesta CPU y rompe el
# manejo de senales). Se invoca el binario del venv directo, no `uv run`, para
# no depender de que uv resuelva el lock en runtime.
#
# Forma shell (no exec) a proposito: Railway asigna el puerto por la variable
# PORT y la forma exec no pasa por el shell, con lo que uvicorn recibiria el
# literal "${PORT}" y fallaria el healthcheck. El `exec` de adelante hace que
# uvicorn reemplace al shell y quede como PID 1, asi le llega el SIGTERM del
# apagado en vez de morir por timeout. El default 8000 deja intacto compose.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
