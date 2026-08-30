from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import clasificador_novedades  # noqa: E402
from app.api import novedades as novedades_api  # noqa: E402
from app.db.models.novedad import (  # noqa: E402
    Centro,
    IngestaLog,
    Novedad,
    NovedadFuente,
)
from app.db.session import get_db  # noqa: E402
from app.repositories import novedad_repo  # noqa: E402
from app.schemas.novedad import ClasificacionNovedad  # noqa: E402
from app.scrapers.novedades.base import NovedadCruda  # noqa: E402
from app.services import novedad_service  # noqa: E402


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Orden: padres (Centro, Novedad) antes que NovedadFuente (FKs).
    Centro.__table__.create(engine)
    Novedad.__table__.create(engine)
    NovedadFuente.__table__.create(engine)
    IngestaLog.__table__.create(engine)
    SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return SessionLocal()


def _centro(db: Session) -> Centro:
    return novedad_repo.get_or_create_centro(
        db, handle="ceit", nombre="CEIT", tipo="instagram"
    )


def _crear(db: Session, *, external_id: str, titulo: str, estado: str) -> Novedad:
    return novedad_repo.crear_novedad(
        db,
        centro=_centro(db),
        external_id=external_id,
        fuente_url=None,
        fuente_imagen_url=None,
        fuente_imagen_path=None,
        titulo=titulo,
        descripcion="d",
        categoria="aviso",
        imagen_url=None,
        imagen_path=None,
        estado=estado,
        confianza=0.9,
        motivo_descarte=None,
        fecha_publicacion=datetime(2026, 6, 1),
    )


class _FuenteFake:
    nombre = "instagram"

    def __init__(self, crudos: list[NovedadCruda]) -> None:
        self._crudos = crudos

    def fetch_recientes(self):
        return self._crudos


def _crudo(external_id: str, texto: str = "algo") -> NovedadCruda:
    return NovedadCruda(
        external_id=external_id,
        fuente="instagram",
        origen="@ceit",
        url="https://instagram.com/p/x/",
        texto=texto,
        fecha_publicacion=datetime(2026, 6, 1),
    )


def test_dedup_external_ids_existentes() -> None:
    db = _session()
    _crear(db, external_id="instagram_post:AAA", titulo="t", estado="publicada")
    db.commit()

    existentes = novedad_repo.external_ids_existentes(
        db, ["instagram_post:AAA", "instagram_post:BBB"]
    )
    assert existentes == {"instagram_post:AAA"}


def test_pipeline_rutea_estados_y_registra_log(monkeypatch) -> None:
    db = _session()

    def fake_clasificar(crudo: NovedadCruda, recientes=None):
        if crudo.external_id.endswith("ALTA"):
            clf = ClasificacionNovedad(
                es_novedad=True, categoria="aviso", titulo="Paro docente",
                descripcion="Hay paro el jueves.", confianza=0.95,
            )
        elif crudo.external_id.endswith("MEDIA"):
            clf = ClasificacionNovedad(
                es_novedad=True, categoria="evento", titulo="Charla",
                descripcion="Charla de algo.", confianza=0.5,
            )
        else:
            clf = ClasificacionNovedad(
                es_novedad=False, categoria="general", titulo="Meme",
                descripcion="-", confianza=0.9, motivo="No es informativo",
            )
        return clasificador_novedades.ResultadoClasificacion(clasificacion=clf, tokens=10)

    monkeypatch.setattr(clasificador_novedades, "clasificar", fake_clasificar)

    fuente = _FuenteFake(
        [_crudo("instagram_story:ALTA"), _crudo("instagram_story:MEDIA"), _crudo("instagram_story:NO")]
    )
    resultado = novedad_service.run_ingesta_novedades(db, [fuente])

    res = resultado.fuentes[0]
    assert res.items_vistos == 3
    assert res.items_nuevos == 3
    assert res.items_novedad == 2  # ALTA + MEDIA
    assert res.items_descartados == 1  # NO

    estados = {
        n.fuentes[0].external_id: n.estado
        for n in novedad_repo.listar(db, estado=None)
    }
    assert estados["instagram_story:ALTA"] == "publicada"
    assert estados["instagram_story:MEDIA"] == "pendiente"
    assert estados["instagram_story:NO"] == "descartada"

    logs = db.query(IngestaLog).all()
    assert len(logs) == 1
    assert logs[0].tokens_usados == 30


def test_pipeline_es_idempotente(monkeypatch) -> None:
    db = _session()
    monkeypatch.setattr(
        clasificador_novedades,
        "clasificar",
        lambda crudo, recientes=None: clasificador_novedades.ResultadoClasificacion(
            clasificacion=ClasificacionNovedad(
                es_novedad=True, categoria="aviso", titulo="t",
                descripcion="d", confianza=0.99,
            ),
            tokens=5,
        ),
    )

    novedad_service.run_ingesta_novedades(db, [_FuenteFake([_crudo("instagram_post:DUP")])])
    novedad_service.run_ingesta_novedades(db, [_FuenteFake([_crudo("instagram_post:DUP")])])

    assert len(novedad_repo.listar(db, estado=None)) == 1


def test_dedup_semantico_suma_fuente_a_existente(monkeypatch) -> None:
    db = _session()
    base = _crear(
        db, external_id="utn_web:1", titulo="Inscripcion a idiomas", estado="publicada"
    )
    db.commit()
    base_id = base.id

    def fake(crudo: NovedadCruda, recientes=None):
        # El LLM marca esta publicacion como el mismo hecho que la base.
        return clasificador_novedades.ResultadoClasificacion(
            clasificacion=ClasificacionNovedad(
                es_novedad=True, categoria="aviso", titulo="Idiomas 2do cuatri",
                descripcion="d", confianza=0.95, duplicado_de=base_id,
            ),
            tokens=7,
        )

    monkeypatch.setattr(clasificador_novedades, "clasificar", fake)

    resultado = novedad_service.run_ingesta_novedades(
        db, [_FuenteFake([_crudo("instagram_post:XYZ")])]
    )
    res = resultado.fuentes[0]
    assert res.items_duplicados == 1
    assert res.items_novedad == 0

    # Sigue habiendo UNA novedad, ahora con dos fuentes.
    novedades = novedad_repo.listar(db, estado=None)
    assert len(novedades) == 1
    ext_ids = {f.external_id for f in novedades[0].fuentes}
    assert ext_ids == {"utn_web:1", "instagram_post:XYZ"}


def test_listar_api_solo_publicadas_por_defecto() -> None:
    db = _session()
    for eid, estado in (("a", "publicada"), ("b", "pendiente"), ("c", "descartada")):
        _crear(db, external_id=eid, titulo=eid, estado=estado)
    db.commit()

    app = FastAPI()
    app.include_router(novedades_api.router)
    app.dependency_overrides[get_db] = lambda: (yield db)
    client = TestClient(app)

    res = client.get("/novedades")
    assert res.status_code == 200
    titulos = [n["titulo"] for n in res.json()]
    assert titulos == ["a"]


def _texto_del_prompt(item, recientes=None):
    msg = clasificador_novedades._build_message(item, recientes or [])
    return next(p["text"] for p in msg["content"] if p["type"] == "text")


def test_el_prompt_incluye_hoy_y_la_fecha_de_publicacion(monkeypatch):
    """Sin estas fechas el modelo publicaba contenido vencido con confianza 1.0."""
    from datetime import UTC

    monkeypatch.setattr(
        clasificador_novedades, "_hoy", lambda: datetime(2026, 8, 30, tzinfo=UTC)
    )
    item = NovedadCruda(
        external_id="instagram_post:X",
        fuente="instagram",
        texto="Inscripcion al Cursado Ciclo Lectivo 2024",
        fecha_publicacion=datetime(2024, 3, 1, tzinfo=UTC),
    )
    texto = _texto_del_prompt(item)
    assert "Fecha de hoy: 2026-08-30" in texto
    assert "Fecha de publicación: 2024-03-01" in texto
    assert "hace 912 días" in texto


def test_fecha_de_publicacion_naive_se_asume_utc(monkeypatch):
    """utn_web produce datetimes naive; no debe romper el calculo de antiguedad."""
    from datetime import UTC

    monkeypatch.setattr(
        clasificador_novedades, "_hoy", lambda: datetime(2026, 8, 30, tzinfo=UTC)
    )
    item = NovedadCruda(
        external_id="utn_web:1", fuente="utn_web", fecha_publicacion=datetime(2026, 8, 20)
    )
    assert "hace 10 días" in _texto_del_prompt(item)


def test_sin_fecha_de_publicacion_se_declara_desconocida(monkeypatch):
    from datetime import UTC

    monkeypatch.setattr(
        clasificador_novedades, "_hoy", lambda: datetime(2026, 8, 30, tzinfo=UTC)
    )
    item = NovedadCruda(external_id="utn_web:2", fuente="utn_web")
    assert "Fecha de publicación: desconocida" in _texto_del_prompt(item)
