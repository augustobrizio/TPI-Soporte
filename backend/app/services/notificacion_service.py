"""Panel de notificaciones: qué hay de nuevo para un alumno.

Dos cosas le avisamos, y son de naturaleza distinta:

- **Novedades** — contenido publicado. Lo nuevo es lo posterior a la última
  vez que abrió el panel: semántica de "no leído" clásica.
- **Mesas y exámenes próximos** — no se publican, se acercan. Una mesa no es
  "nueva" porque se haya creado, sino porque *entró en la ventana de aviso*.
  Por eso cuenta como nueva cuando el instante en que faltaban
  ``VENTANA_MESAS_DIAS`` días para ella es posterior a la última visita: si
  cuando miraste todavía faltaban dos semanas, hoy que faltan cinco días es
  información nueva.

Esa distinción es la que evita el problema de la campana anterior, que tenía
el puntito pintado en el markup y avisaba siempre de nada.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models.usuario import Usuario
from app.repositories import novedad_repo
from app.schemas.notificacion import (
    MesaNotificacion,
    NotificacionesOut,
    NovedadNotificacion,
)
from app.services import calendario_service

#: Con cuánta anticipación se avisa una mesa. Una semana: suficiente para
#: llegar a inscribirse o a estudiar, poco como para que la campana esté
#: permanentemente encendida.
VENTANA_MESAS_DIAS = 7

#: Los eventos del calendario que ameritan aviso. Los feriados, TPs y eventos
#: institucionales están en el calendario y no hace falta interrumpir por ellos.
TIPOS_CON_AVISO = ("mesa", "examen")

LIMITE_NOVEDADES = 8
LIMITE_MESAS = 5

#: Techo para una cuenta sin ``created_at`` (filas viejas, o SQLite en tests,
#: donde el server_default no siempre se materializa sin refresh). Sin esto la
#: línea de corte sería el epoch y la campana arrancaría con todo el histórico.
ANTIGUEDAD_MAXIMA_DIAS = 30


def linea_de_corte(usuario: Usuario, *, ahora: datetime | None = None) -> datetime:
    """Instante a partir del cual algo cuenta como nuevo para este usuario.

    Prioridad: la última visita al panel; si nunca lo abrió, la creación de la
    cuenta — nadie quiere estrenar la campana con las novedades de los meses
    anteriores a haberse registrado.
    """
    ahora = ahora or datetime.now()
    if usuario.notificaciones_vistas_at is not None:
        return usuario.notificaciones_vistas_at
    if usuario.created_at is not None:
        return usuario.created_at
    return ahora - timedelta(days=ANTIGUEDAD_MAXIMA_DIAS)


def _fecha_novedad(novedad) -> datetime | None:
    """Fecha real del contenido, con la de ingesta como respaldo.

    Mismo criterio que usa el listado público: ``fecha_publicacion`` primero,
    porque ``created_at`` es cuándo lo scrapeamos nosotros y un backfill haría
    aparecer como nuevo contenido de hace dos años.
    """
    return novedad.fecha_publicacion or novedad.created_at


def _aparicion(novedad) -> datetime | None:
    """Cuándo esta novedad se volvió visible para el alumno.

    **No es la misma fecha que se muestra.** La ingesta guarda en
    ``fecha_publicacion`` la fecha del *evento anunciado*, así que un aviso de
    "curso que arranca el 8 de septiembre" queda fechado en el futuro.
    Decidiendo con esa fecha, la novedad seguía contando como nueva después de
    mirarla —y de mirarla otra vez— hasta que llegara el 8 de septiembre: la
    campana volvía a avisar siempre, el defecto exacto que este panel vino a
    corregir.

    Tampoco alcanza con usar ``created_at`` a secas: un backfill de posts
    viejos recién ingestados aparecería todo junto como novedad de hoy.

    La más temprana de las dos resuelve los dos casos. Es "desde cuándo esto
    podría haberse visto": para un aviso normal es su fecha de publicación,
    para uno que anuncia algo futuro es cuándo lo ingestamos, y para un
    backfill es la fecha original del contenido.
    """
    fechas = [
        f for f in (novedad.fecha_publicacion, novedad.created_at) if f is not None
    ]
    return min(fechas) if fechas else None


def _es_nueva(aparicion: datetime | None, corte: datetime, ahora: datetime) -> bool:
    """Si una novedad que apareció en ese momento cuenta como no vista."""
    if aparicion is None:
        return False
    if aparicion > ahora:
        # Sólo pasa con una fila sin ``created_at`` y con fecha de evento
        # futura: no hay dato de cuándo apareció de verdad. Se elige no
        # avisar — una campana apagada de más molesta mucho menos que una que
        # no se apaga nunca.
        return False
    return aparicion > corte


def _novedades(
    db: Session, corte: datetime, ahora: datetime
) -> list[NovedadNotificacion]:
    """Últimas novedades publicadas, marcando cuáles son posteriores al corte.

    Se devuelven las recientes y no sólo las nuevas: un panel que queda vacío
    apenas lo abrís no le sirve a nadie. Lo que decide si la campana avisa es
    el flag ``nueva``, no que la lista tenga items.

    ``fecha`` es la de mostrar (``_fecha_novedad``) y no la de decidir
    (``_aparicion``): el panel tiene que seguir diciendo "8 sept" en el aviso
    de un curso que arranca el 8 de septiembre.
    """
    items: list[NovedadNotificacion] = []
    for novedad in novedad_repo.listar_recientes(db, limite=LIMITE_NOVEDADES):
        if not novedad.titulo:
            continue
        fecha = _fecha_novedad(novedad)
        items.append(
            NovedadNotificacion(
                id=novedad.id,
                titulo=novedad.titulo,
                fecha=fecha,
                nueva=_es_nueva(_aparicion(novedad), corte, ahora),
            )
        )
    return items


def _mesas(db: Session, usuario: Usuario, corte: datetime, hoy: date) -> list[MesaNotificacion]:
    """Mesas y exámenes dentro de la ventana de aviso.

    El filtro por tipo va en Python y no en el repositorio porque son dos
    tipos: pedirlos por separado son dos queries a Neon para leer la misma
    franja de una semana, que trae un puñado de filas.
    """
    hasta = hoy + timedelta(days=VENTANA_MESAS_DIAS)
    eventos = calendario_service.listar_eventos(
        db, desde=hoy, hasta=hasta, usuario_id=usuario.id
    )

    items: list[MesaNotificacion] = []
    for evento in eventos:
        if evento.tipo not in TIPOS_CON_AVISO:
            continue
        entro_en_ventana = evento.fecha_inicio - timedelta(days=VENTANA_MESAS_DIAS)
        items.append(
            MesaNotificacion(
                id=evento.id,
                titulo=evento.titulo,
                fecha_inicio=evento.fecha_inicio,
                tipo=evento.tipo,
                dias_restantes=max((evento.fecha_inicio.date() - hoy).days, 0),
                nueva=entro_en_ventana > corte,
            )
        )
        if len(items) >= LIMITE_MESAS:
            break
    return items


def resumen(db: Session, usuario: Usuario) -> NotificacionesOut:
    """Lo que muestra el panel de la campana para este usuario."""
    ahora = datetime.now()
    corte = linea_de_corte(usuario, ahora=ahora)

    novedades = _novedades(db, corte, ahora)
    mesas = _mesas(db, usuario, corte, ahora.date())

    return NotificacionesOut(
        nuevas=sum(1 for n in novedades if n.nueva) + sum(1 for m in mesas if m.nueva),
        novedades=novedades,
        mesas=mesas,
        vistas_at=usuario.notificaciones_vistas_at,
    )


def marcar_vistas(db: Session, usuario: Usuario) -> datetime:
    """Corre la línea de corte hasta ahora. El caller commitea.

    Devuelve el instante grabado para que el endpoint pueda contestarlo sin
    volver a leer la fila.
    """
    ahora = datetime.now()
    usuario.notificaciones_vistas_at = ahora
    db.add(usuario)
    db.flush()
    return ahora
