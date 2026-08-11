"""Bootstrap de la aplicacion FastAPI."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import calendario, comisiones, materias, novedades, profesores, usuario_materia
from app.config import get_settings
from app.workers import scheduler as scheduler_mod


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Arranca el scheduler de ingesta al iniciar y lo apaga al cerrar.

    El scheduler es opcional (flag ``SCHEDULER_ENABLED``): en serverless o en
    tests se deja apagado y la ingesta se dispara on-demand por endpoint.
    """
    scheduler_mod.start()
    try:
        yield
    finally:
        scheduler_mod.shutdown()


app = FastAPI(title="UTNHub API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Por env (CORS_ORIGINS): el dominio del frontend cambia entre local y
    # produccion. No se usa "*" porque con allow_credentials=True el browser
    # rechaza el wildcard.
    allow_origins=get_settings().cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materias.router)
app.include_router(profesores.router)
app.include_router(usuario_materia.router)
app.include_router(calendario.router)
app.include_router(novedades.router)
app.include_router(comisiones.router)


@app.get("/health")
def health():
    """Endpoint de healthcheck."""
    return {"status": "ok"}
