from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import clasificador_novedades, placeholders  # noqa: E402
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
        # Relativa a hoy a propósito: con una fecha fija, el corte por
        # antigüedad del pipeline empieza a filtrar estos items el día que la
        # fecha queda vieja y los tests se rompen solos meses después.
        fecha_publicacion=datetime.now() - timedelta(days=2),
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


def test_detalle_api_resuelve_la_imagen_de_portada() -> None:
    """El detalle devuelve imagen como el feed: propia si tiene, si no una genérica.

    Es lo que mira la preview del link compartido (`og:image`): con
    ``imagen_url`` en null la tarjeta de WhatsApp sale sin imagen, y la
    novedad sin flyer propio es el caso comun, no el raro.
    """
    db = _session()
    sin_imagen = _crear(db, external_id="a", titulo="a", estado="publicada")
    con_imagen = _crear(db, external_id="b", titulo="b", estado="publicada")
    con_imagen.imagen_url = "https://bucket.s3.amazonaws.com/novedades/b.jpg"
    db.commit()

    app = FastAPI()
    app.include_router(novedades_api.router)
    app.dependency_overrides[get_db] = lambda: (yield db)
    client = TestClient(app)

    assert placeholders.es_placeholder(
        client.get(f"/novedades/{sin_imagen.id}").json()["imagen_url"]
    )
    assert (
        client.get(f"/novedades/{con_imagen.id}").json()["imagen_url"]
        == "https://bucket.s3.amazonaws.com/novedades/b.jpg"
    )


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


# --- corte por antiguedad (previo al LLM) ----------------------------------


def _con_fecha(external_id: str, dias_atras: int | None):
    fecha = None if dias_atras is None else datetime.now() - timedelta(days=dias_atras)
    return NovedadCruda(
        external_id=external_id, fuente="instagram", fecha_publicacion=fecha
    )


def test_corte_por_antiguedad_separa_vigentes_de_viejos():
    vigentes, viejos = novedad_service._partir_por_antiguedad(
        [_con_fecha("nuevo", 10), _con_fecha("viejo", 200)], 90
    )
    assert [c.external_id for c in vigentes] == ["nuevo"]
    assert [c.external_id for c in viejos] == ["viejo"]


def test_items_sin_fecha_nunca_se_cortan():
    """Preferimos gastar la clasificacion antes que esconder algo sin fecha."""
    vigentes, viejos = novedad_service._partir_por_antiguedad(
        [_con_fecha("sin_fecha", None)], 90
    )
    assert [c.external_id for c in vigentes] == ["sin_fecha"]
    assert viejos == []


def test_max_dias_en_cero_desactiva_el_corte():
    vigentes, viejos = novedad_service._partir_por_antiguedad(
        [_con_fecha("viejisimo", 3000)], 0
    )
    assert len(vigentes) == 1 and viejos == []


def test_los_items_viejos_no_llegan_al_clasificador(monkeypatch):
    """El corte tiene que ahorrar la llamada de vision, no solo descartar despues."""
    db = _session()
    llamadas = []
    monkeypatch.setattr(
        clasificador_novedades,
        "clasificar",
        lambda item, recientes=None: llamadas.append(item.external_id),
    )
    viejo = NovedadCruda(
        external_id="instagram_post:NAVIDAD2024",
        fuente="instagram",
        texto="Saludos navideños",
        fecha_publicacion=datetime.now() - timedelta(days=600),
    )
    res = novedad_service.run_ingesta_novedades(db, [_FuenteFake([viejo])])

    assert llamadas == []
    assert res.fuentes[0].items_viejos == 1
    assert res.fuentes[0].items_novedad == 0


# --- moderacion manual -----------------------------------------------------


def test_crear_novedad_congela_el_estado_del_clasificador():
    db = _session()
    n = _crear(db, external_id="x:1", titulo="t", estado="descartada")
    db.commit()
    assert n.estado_llm == "descartada"
    assert n.moderado_manual is False


def test_moderar_corrige_el_estado_sin_pisar_lo_que_dijo_el_llm():
    """Es lo que permite listar despues los errores del clasificador."""
    db = _session()
    n = _crear(db, external_id="x:2", titulo="Charla de IA", estado="descartada")
    db.commit()

    novedad_service.moderar(db, n.id, "publicada")

    assert n.estado == "publicada"
    assert n.estado_llm == "descartada"  # el LLM se habia equivocado
    assert n.moderado_manual is True


def test_moderar_tambien_sirve_para_bajar_algo_publicado_de_mas():
    db = _session()
    n = _crear(db, external_id="x:3", titulo="Curso de Revit", estado="publicada")
    db.commit()

    novedad_service.moderar(db, n.id, "descartada")

    assert n.estado == "descartada"
    assert n.estado_llm == "publicada"
    assert n.moderado_manual is True


def test_moderar_una_novedad_inexistente_devuelve_none():
    assert novedad_service.moderar(_session(), 999, "publicada") is None


def test_moderar_exige_rol_admin():
    """El endpoint quedo abierto desde que se creo; esto fija que ya no lo esta."""
    from app.api.deps import requerir_admin

    db = _session()
    n = _crear(db, external_id="x:4", titulo="t", estado="descartada")
    db.commit()

    app = FastAPI()
    app.include_router(novedades_api.router)
    app.dependency_overrides[get_db] = lambda: (yield db)
    client = TestClient(app)

    # Sin credenciales de admin no pasa.
    assert client.patch(
        f"/novedades/{n.id}/moderar", json={"estado": "publicada"}
    ).status_code in (401, 403)

    # Con el rol correcto, sí.
    app.dependency_overrides[requerir_admin] = lambda: object()
    resp = client.patch(f"/novedades/{n.id}/moderar", json={"estado": "publicada"})
    assert resp.status_code == 200
    assert resp.json()["estado"] == "publicada"
    assert resp.json()["moderado_manual"] is True


# ---------------------------------------------------------------------------
# Orden de "Últimas novedades" en la portada
# ---------------------------------------------------------------------------


def _novedad(db: Session, titulo: str, *, estado: str = "publicada") -> Novedad:
    n = Novedad(titulo=titulo, estado=estado)
    db.add(n)
    db.flush()
    return n


def test_la_portada_respeta_el_orden_fijado_por_el_admin() -> None:
    db = _session()
    a, b, c = (_novedad(db, t) for t in ("A", "B", "C"))
    db.commit()

    novedad_repo.fijar_orden_portada(db, [c.id, a.id, b.id])
    db.commit()

    assert [n.titulo for n in novedad_repo.listar_portada(db)] == ["C", "A", "B"]


def test_una_novedad_nueva_entra_primera_y_desplaza_a_la_ultima() -> None:
    """La regla del carrusel: entran tres, la cuarta saca a la tercera."""
    db = _session()
    a, b, c = (_novedad(db, t) for t in ("A", "B", "C"))
    novedad_repo.fijar_orden_portada(db, [a.id, b.id, c.id])
    db.commit()

    nueva = _novedad(db, "Nueva")
    novedad_repo.promover_a_portada(db, nueva.id)
    db.commit()

    assert [n.titulo for n in novedad_repo.listar_portada(db)] == ["Nueva", "A", "B"]
    # La que salió queda sin posición, no borrada.
    assert db.get(Novedad, c.id).orden_portada is None
    assert db.get(Novedad, c.id).estado == "publicada"


def test_fijar_el_orden_saca_a_las_que_no_estan_en_la_lista() -> None:
    db = _session()
    a, b, c = (_novedad(db, t) for t in ("A", "B", "C"))
    novedad_repo.fijar_orden_portada(db, [a.id, b.id, c.id])
    db.commit()

    novedad_repo.fijar_orden_portada(db, [b.id])
    db.commit()

    assert [n.titulo for n in novedad_repo.listar_portada(db)] == ["B"]
    assert db.get(Novedad, a.id).orden_portada is None


def test_despublicar_saca_de_la_portada_y_cierra_el_hueco() -> None:
    db = _session()
    a, b, c = (_novedad(db, t) for t in ("A", "B", "C"))
    novedad_repo.fijar_orden_portada(db, [a.id, b.id, c.id])
    db.commit()

    novedad_service.moderar(db, b.id, "descartada")

    assert [n.titulo for n in novedad_repo.listar_portada(db)] == ["A", "C"]
    # Sin huecos: la que estaba tercera pasa a segunda.
    assert db.get(Novedad, c.id).orden_portada == 1


def test_publicar_a_mano_mete_la_novedad_al_frente() -> None:
    db = _session()
    a, b = (_novedad(db, t) for t in ("A", "B"))
    novedad_repo.fijar_orden_portada(db, [a.id, b.id])
    pendiente = _novedad(db, "Pendiente", estado="pendiente")
    db.commit()

    novedad_service.moderar(db, pendiente.id, "publicada")

    assert [n.titulo for n in novedad_repo.listar_portada(db)] == ["Pendiente", "A", "B"]


def test_sin_orden_fijado_la_portada_cae_a_lo_mas_reciente() -> None:
    """Base recién migrada: la portada no queda vacía."""
    db = _session()
    vieja = _novedad(db, "Vieja")
    vieja.fecha_publicacion = datetime(2026, 1, 1)
    nueva = _novedad(db, "Nueva")
    nueva.fecha_publicacion = datetime(2026, 9, 1)
    db.commit()

    assert [n.titulo for n in novedad_repo.listar_portada(db)][0] == "Nueva"


def test_pedir_las_no_publicadas_sin_ser_admin_da_403() -> None:
    """Lo descartado es material que decidimos no mostrar."""
    db = _session()
    _novedad(db, "Descartada", estado="descartada")
    db.commit()

    app = FastAPI()
    app.include_router(novedades_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    assert client.get("/novedades?estado=descartada").status_code == 403
    assert client.get("/novedades").status_code == 200
