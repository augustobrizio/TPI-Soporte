"""Configuración global de la aplicación.

Lee variables del entorno (cargadas desde backend/.env) usando
pydantic-settings para tipado y validación.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings de la app.

    Las variables sensibles vienen de `.env` (gitignored). El template
    está en `.env.example`.
    """

    database_url: str = Field(..., alias="DATABASE_URL")
    environment: str = Field(default="dev", alias="ENVIRONMENT")

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
