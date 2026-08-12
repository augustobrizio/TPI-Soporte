"""Repository de Materia / Correlatividad / UsuarioMateria.

Único punto de acceso a la DB para el dominio académico. Los services
hablan con este módulo, nunca con SQLAlchemy directamente. Mantenerlo
pegado al modelo: nada de lógica de negocio acá.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence

from sqlalchemy import and_, select
from sqlalchemy.orm import Session, selectinload

from app.db.models.academico import (
    CondicionMateria,
    Correlatividad,
    Materia,
    UsuarioMateria,
)


# ---------------------------------------------------------------------------
# Materia
# ---------------------------------------------------------------------------
def get_by_codigo(db: Session, codigo: str) -> Materia | None:
    """Devuelve una materia por su código natural."""
    return db.get(Materia, codigo)


def get_by_codigos(db: Session, codigos: Iterable[str]) -> Sequence[Materia]:
    """Devuelve las materias cuyos códigos están en la lista."""
    stmt = select(Materia).where(Materia.codigo.in_(list(codigos)))
    return db.execute(stmt).scalars().all()


def list_materias(db: Session, *, tipo: str | None = None) -> Sequence[Materia]:
    """Lista materias, opcionalmente filtradas por tipo (``troncal`` / ``electiva``)."""
    stmt = select(Materia).order_by(
        Materia.anio_carrera.nulls_last(),
        Materia.cuatrimestre.nulls_first(),
        Materia.codigo,
    )
    if tipo is not None:
        stmt = stmt.where(Materia.tipo == tipo)
    return db.execute(stmt).scalars().all()


def list_codigos_por_tipo(db: Session, tipo: str) -> set[str]:
    """Conjunto de códigos para un tipo dado. Útil para reglas globales."""
    stmt = select(Materia.codigo).where(Materia.tipo == tipo)
    return {row[0] for row in db.execute(stmt).all()}


def upsert_materia(db: Session, **fields) -> Materia:
    """Inserta o actualiza una materia por ``codigo``. Usado por el seed."""
    codigo = fields["codigo"]
    materia = db.get(Materia, codigo)
    if materia is None:
        materia = Materia(**fields)
        db.add(materia)
    else:
        for key, value in fields.items():
            if key == "codigo":
                continue
            setattr(materia, key, value)
    return materia


# ---------------------------------------------------------------------------
# Correlatividad
# ---------------------------------------------------------------------------
def correlativas_de(
    db: Session, codigos: Iterable[str], *, con_requerida: bool = False
) -> Sequence[Correlatividad]:
    """Trae las correlativas de un conjunto de materias (un único query).

    ``con_requerida`` precarga la materia requerida. Solo hace falta para armar
    mensajes con ``corr.requerida.nombre``; calcular estados usa nada más las
    columnas ``materia_requerida`` y ``tipo``. Cada eager-load de más es un
    round-trip a Neon (~190 ms), asi que por defecto no se precarga.
    """
    codigos = list(codigos)
    if not codigos:
        return []
    stmt = select(Correlatividad).where(Correlatividad.materia_codigo.in_(codigos))
    if con_requerida:
        stmt = stmt.options(selectinload(Correlatividad.requerida))
    return db.execute(stmt).scalars().all()


def correlativas_de_materia(
    db: Session, materia_codigo: str
) -> Sequence[Correlatividad]:
    """Correlativas de una sola materia, con la requerida precargada (los
    callers arman los faltantes con ``corr.requerida.nombre``)."""
    return correlativas_de(db, [materia_codigo], con_requerida=True)


def upsert_correlativa(
    db: Session,
    *,
    materia_codigo: str,
    materia_requerida: str,
    tipo: str,
) -> Correlatividad:
    """Inserta una correlativa si no existe (idempotente por la tripleta)."""
    stmt = select(Correlatividad).where(
        and_(
            Correlatividad.materia_codigo == materia_codigo,
            Correlatividad.materia_requerida == materia_requerida,
            Correlatividad.tipo == tipo,
        )
    )
    existing = db.execute(stmt).scalar_one_or_none()
    if existing is not None:
        return existing
    correl = Correlatividad(
        materia_codigo=materia_codigo,
        materia_requerida=materia_requerida,
        tipo=tipo,
    )
    db.add(correl)
    return correl


# ---------------------------------------------------------------------------
# UsuarioMateria
# ---------------------------------------------------------------------------
def condiciones_usuario(
    db: Session, usuario_id: int
) -> dict[str, CondicionMateria]:
    """Mapa ``codigo -> condicion`` con todo el historial del usuario."""
    stmt = select(UsuarioMateria.materia_codigo, UsuarioMateria.condicion).where(
        UsuarioMateria.usuario_id == usuario_id
    )
    return {codigo: condicion for codigo, condicion in db.execute(stmt).all()}


def condiciones_y_cursadas_usuario(
    db: Session, usuario_id: int
) -> tuple[dict[str, CondicionMateria], dict[str, int]]:
    """``(condiciones, cursadas_elegidas)`` del usuario en un solo query.

    Ambos mapas salen de la misma fila de ``usuario_materia``; pedirlos por
    separado son dos round-trips a Neon para leer la misma tabla.
    """
    stmt = select(
        UsuarioMateria.materia_codigo,
        UsuarioMateria.condicion,
        UsuarioMateria.cursada_id,
    ).where(UsuarioMateria.usuario_id == usuario_id)

    condiciones: dict[str, CondicionMateria] = {}
    cursadas: dict[str, int] = {}
    for codigo, condicion, cursada_id in db.execute(stmt).all():
        condiciones[codigo] = condicion
        if cursada_id is not None:
            cursadas[codigo] = cursada_id
    return condiciones, cursadas


def notas_usuario(db: Session, usuario_id: int) -> dict[str, float | None]:
    """Mapa ``codigo -> nota`` del usuario."""
    stmt = select(UsuarioMateria.materia_codigo, UsuarioMateria.nota).where(
        UsuarioMateria.usuario_id == usuario_id
    )
    return {codigo: nota for codigo, nota in db.execute(stmt).all()}


def usuario_materia(
    db: Session, usuario_id: int, materia_codigo: str
) -> UsuarioMateria | None:
    """Una sola fila de cursada. Usa first() para tolerar duplicados en DB."""
    stmt = (
        select(UsuarioMateria)
        .where(
            and_(
                UsuarioMateria.usuario_id == usuario_id,
                UsuarioMateria.materia_codigo == materia_codigo,
            )
        )
        .order_by(UsuarioMateria.id.desc())
    )
    return db.execute(stmt).scalars().first()


def list_usuario_materias(
    db: Session, usuario_id: int
) -> Sequence[UsuarioMateria]:
    """Todas las cursadas registradas para un usuario."""
    stmt = (
        select(UsuarioMateria)
        .where(UsuarioMateria.usuario_id == usuario_id)
        .options(selectinload(UsuarioMateria.materia))
        .order_by(UsuarioMateria.materia_codigo)
    )
    return db.execute(stmt).scalars().all()


def upsert_usuario_materia(
    db: Session,
    *,
    usuario_id: int,
    materia_codigo: str,
    condicion: CondicionMateria,
    nota: float | None,
    anio_cursada: int | None,
) -> UsuarioMateria:
    """Crea o actualiza el estado de una materia para un usuario.

    Defensivo ante duplicados en DB: si existen múltiples filas (puede ocurrir
    si la UniqueConstraint no estaba activa), conserva la de mayor id y borra
    las restantes para dejar el estado consistente.
    """
    filas = db.execute(
        select(UsuarioMateria)
        .where(
            and_(
                UsuarioMateria.usuario_id == usuario_id,
                UsuarioMateria.materia_codigo == materia_codigo,
            )
        )
        .order_by(UsuarioMateria.id.desc())
    ).scalars().all()

    if not filas:
        fila = UsuarioMateria(
            usuario_id=usuario_id,
            materia_codigo=materia_codigo,
            condicion=condicion,
            nota=nota,
            anio_cursada=anio_cursada,
        )
        db.add(fila)
    else:
        fila = filas[0]  # la de mayor id es la más reciente
        for dup in filas[1:]:
            db.delete(dup)  # limpiar duplicados al vuelo
        fila.condicion = condicion
        fila.nota = nota
        fila.anio_cursada = anio_cursada

    db.flush()
    return fila


def delete_usuario_materia(
    db: Session, usuario_id: int, materia_codigo: str
) -> bool:
    """Borra la fila de cursada. Devuelve True si había algo para borrar."""
    fila = usuario_materia(db, usuario_id, materia_codigo)
    if fila is None:
        return False
    db.delete(fila)
    db.flush()
    return True


def delete_all_usuario_materias(db: Session, usuario_id: int) -> int:
    """Borra TODOS los registros de cursada de un usuario.

    Devuelve la cantidad de filas eliminadas.
    """
    filas = list_usuario_materias(db, usuario_id)
    for fila in filas:
        db.delete(fila)
    db.flush()
    return len(filas)
