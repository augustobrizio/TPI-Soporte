"""Configuración global de la aplicación.

Lee variables del entorno (cargadas desde backend/.env) usando
pydantic-settings para tipado y validación.
"""
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Secreto de firma para desarrollo. Es publico (esta en el repo) a proposito:
# sirve para que `docker compose up` funcione sin configurar nada, y el
# validator de abajo impide que llegue a produccion.
JWT_SECRET_DEV = "dev-only-inseguro-no-usar-en-produccion"


class Settings(BaseSettings):
    """Settings de la app.

    Las variables sensibles vienen de `.env` (gitignored). El template
    está en `.env.example`.
    """

    database_url: str = Field(..., alias="DATABASE_URL")
    environment: str = Field(default="dev", alias="ENVIRONMENT")

    # --- Autenticacion (RF-01, RNF-02, RNF-05) ---
    # Clave con la que se firman los JWT. Quien la tenga puede emitir tokens
    # validos para cualquier usuario, asi que en prod es obligatoria: el
    # validator de abajo impide arrancar con el default de desarrollo.
    jwt_secret: str = Field(default=JWT_SECRET_DEV, alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    # Duracion de la sesion. RNF-05 pide que sea configurable. 12 h por
    # default: cubre una jornada sin obligar a re-loguearse a mitad de cursada.
    jwt_expire_minutes: int = Field(default=720, alias="JWT_EXPIRE_MINUTES")

    # Clasificador IA de novedades (OpenAI). gpt-4o-mini: barato y suficiente.
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    novedades_llm_model: str = Field(
        default="gpt-4o-mini", alias="NOVEDADES_LLM_MODEL"
    )
    novedades_umbral_publicar: float = Field(
        default=0.75, alias="NOVEDADES_UMBRAL_PUBLICAR"
    )
    # Tope de items clasificados por corrida (control de costos, RNF-11).
    novedades_max_items_por_corrida: int = Field(
        default=40, alias="NOVEDADES_MAX_ITEMS_POR_CORRIDA"
    )

    # --- RAG del chatbot (RF-... asistente) ---
    # El RAG usa Google Gemini (tier gratis), independiente de la cuenta OpenAI
    # del clasificador de novedades. Key gratis en https://aistudio.google.com.
    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")
    # Embeddings: convierten texto en vectores para la búsqueda por significado.
    # gemini-embedding-001 soporta dimensión de salida configurable; le pedimos
    # 768 (ver EMBEDDING_DIM en app/db/models/rag.py). OJO: si cambiás el modelo
    # o la dimensión, actualizá EMBEDDING_DIM y re-embebé todo el corpus.
    rag_embedding_model: str = Field(
        default="models/gemini-embedding-001", alias="RAG_EMBEDDING_MODEL"
    )
    # Modelo que redacta la respuesta final del chatbot (chat, tier gratis).
    # flash-lite: más barato y con más capacidad libre en el free tier (el flash
    # "grande" se satura y tira 503 en horario pico). Para sintetizar contexto
    # RAG rinde de sobra. Upgrade opcional: RAG_LLM_MODEL=gemini-flash-latest.
    rag_llm_model: str = Field(
        default="gemini-flash-lite-latest", alias="RAG_LLM_MODEL"
    )
    # Cuántos fragmentos recupera el retriever por pregunta.
    rag_top_k: int = Field(default=5, alias="RAG_TOP_K")

    # Instagram: sessionid de un browser (recomendado); usuario/password fallback.
    instagram_sessionid: str | None = Field(default=None, alias="INSTAGRAM_SESSIONID")
    instagram_usuario: str | None = Field(default=None, alias="INSTAGRAM_USUARIO")
    instagram_password: str | None = Field(default=None, alias="INSTAGRAM_PASSWORD")
    instagram_session_path: str = Field(
        default="/data/instagram_session.json", alias="INSTAGRAM_SESSION_PATH"
    )
    instagram_handles: str = Field(default="", alias="INSTAGRAM_HANDLES")
    novedades_media_dir: str = Field(
        default="/data/novedades_media", alias="NOVEDADES_MEDIA_DIR"
    )

    utn_novedades_url: str | None = Field(default=None, alias="UTN_NOVEDADES_URL")

    # S3: copia propia de las imágenes de novedades (las URLs de origen, ej.
    # CDN de Instagram, expiran). Si no está configurado, cae a disco local.
    aws_access_key_id: str | None = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str | None = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )
    # Lambda la inyecta sola (credencial temporal del rol); distingue keys
    # estáticas de verdad de las de Lambda en storage.py.
    aws_session_token: str | None = Field(default=None, alias="AWS_SESSION_TOKEN")
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    aws_s3_bucket: str | None = Field(default=None, alias="AWS_S3_BUCKET")

    # Scheduler in-process (desactivable en serverless). Intervalo por fuente (RNF-07).
    scheduler_enabled: bool = Field(default=False, alias="SCHEDULER_ENABLED")
    ingesta_instagram_horas: int = Field(default=6, alias="INGESTA_INSTAGRAM_HORAS")
    ingesta_utn_web_horas: int = Field(default=24, alias="INGESTA_UTN_WEB_HORAS")

    # Origenes permitidos por CORS, separados por coma. En dev alcanza el
    # default (localhost); en produccion se agrega el dominio del frontend
    # desplegado. Va por env y no hardcodeado porque la URL de Amplify recien
    # se conoce despues de desplegar.
    cors_origins: str = Field(
        default="http://localhost:3000,http://localhost:3001,http://localhost:3002",
        alias="CORS_ORIGINS",
    )

    @model_validator(mode="after")
    def _exigir_jwt_secret_propio_en_prod(self) -> "Settings":
        """Falla el arranque si prod quedo con el secreto de desarrollo.

        Es preferible no levantar a levantar con una clave que esta publicada
        en el repo: con ella cualquiera puede firmar un token y hacerse pasar
        por cualquier usuario, incluido un admin.
        """
        if self.environment == "prod" and self.jwt_secret == JWT_SECRET_DEV:
            raise ValueError(
                "JWT_SECRET no esta configurado y ENVIRONMENT=prod. Genera uno "
                "con `python -c \"import secrets; print(secrets.token_urlsafe(48))\"` "
                "y cargalo como secreto del servicio."
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        """Origenes de CORS normalizados (sin espacios ni vacios)."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def instagram_handles_list(self) -> list[str]:
        """Handles normalizados (sin ``@`` ni espacios, sin vacíos)."""
        return [
            h.strip().lstrip("@")
            for h in self.instagram_handles.split(",")
            if h.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Devuelve un singleton de Settings (cacheado)."""
    return Settings()  # type: ignore[call-arg]
