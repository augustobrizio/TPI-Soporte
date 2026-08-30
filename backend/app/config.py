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

    # --- Login con Google (OAuth 2.0 / OpenID Connect, RF-01) ---
    # Credenciales del cliente OAuth tipo "Aplicacion web" de Google Cloud
    # Console. Si falta cualquiera de las dos, el login con Google queda
    # apagado: el boton no se renderiza y el endpoint responde 503. El resto
    # de la autenticacion (email + password) sigue funcionando igual, asi que
    # el proyecto arranca sin configurar nada de Google.
    google_client_id: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    google_client_secret: str | None = Field(
        default=None, alias="GOOGLE_CLIENT_SECRET"
    )
    # Dominios de email aceptados al entrar con Google, separados por coma.
    # **Vacio por default: entra cualquier cuenta de Google.** El mecanismo
    # existe porque RNF-04 habla de restringir a @frro.utn.edu.ar, pero se
    # decidio no aplicarlo: muchos alumnos usan su cuenta personal, y dejar
    # afuera a quien no tenga la institucional a mano es peor que el riesgo
    # que evita. Si alguna vez se quiere activar, alcanza con setear la
    # variable — el chequeo ya esta implementado y testeado.
    google_dominios_permitidos: str = Field(
        default="", alias="GOOGLE_DOMINIOS_PERMITIDOS"
    )

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
    # Antigüedad máxima de un item para que valga clasificarlo. El feed de un
    # perfil trae sus 12 últimos posts, que en cuentas poco activas se remontan
    # años: sin este corte gastábamos una llamada de visión (~28k tokens, el
    # motivo de los 429 de TPM) en saludos navideños de 2024. 0 = sin límite.
    novedades_antiguedad_max_dias: int = Field(
        default=90, alias="NOVEDADES_ANTIGUEDAD_MAX_DIAS"
    )

    # Instagram: los posts se leen sin credenciales. El sessionid es opcional
    # y sirve solo para las stories, que siguen detrás del login.
    instagram_sessionid: str | None = Field(default=None, alias="INSTAGRAM_SESSIONID")
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
    def google_dominios_permitidos_list(self) -> list[str]:
        """Dominios normalizados (minuscula, sin ``@``). Vacio = sin restriccion."""
        return [
            d.strip().lstrip("@").lower()
            for d in self.google_dominios_permitidos.split(",")
            if d.strip()
        ]

    @property
    def google_oauth_configurado(self) -> bool:
        """Hay client id y secret cargados, o sea que el flow puede correr."""
        return bool(self.google_client_id and self.google_client_secret)

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
