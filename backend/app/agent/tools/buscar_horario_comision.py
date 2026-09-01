"""Tool: horarios y comisiones en las que se dicta una materia."""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.agent.tools._comun import buscar_materia, formatear_hora
from app.db.models.academico import Comision, Cursada


def crear_buscar_horario_comision(db: Session):
    """Devuelve la tool `buscar_horario_comision` atada a esta sesión."""

    @tool
    def buscar_horario_comision(materia: str) -> str:
        """Devuelve los horarios y comisiones en las que se cursa una materia.

        Usar cuando pregunten a qué hora o qué día se cursa algo, en qué
        comisiones se dicta, en qué aula, o quién la dicta.

        Args:
            materia: nombre o código de la materia (ej. "Análisis Matemático I").
        """
        m = buscar_materia(db, materia)
        if m is None:
            return f"No encontré ninguna materia parecida a '{materia}' en el plan."

        cursadas = db.scalars(
            select(Cursada)
            .where(Cursada.materia_codigo == m.codigo)
            .options(
                selectinload(Cursada.horarios),
                selectinload(Cursada.comision),
                selectinload(Cursada.profesor),
            )
            .join(Comision)
            .order_by(Comision.nombre)
        ).all()

        if not cursadas:
            return f"No hay comisiones cargadas para {m.nombre} (código {m.codigo})."

        partes = [f"Comisiones de {m.nombre} (código {m.codigo}):"]
        for c in cursadas:
            comision = c.comision.nombre if c.comision else "sin nombre"
            docente = (c.profesor.nombre if c.profesor else None) or c.docente
            cabecera = f"- Comisión {comision}"
            if c.cuatrimestre:
                cabecera += f" (cuatrimestre {c.cuatrimestre})"
            if docente:
                cabecera += f", a cargo de {docente}"
            partes.append(cabecera)
            for h in c.horarios:
                aula = f", aula {h.aula}" if h.aula else ""
                partes.append(
                    f"    {h.dia or 'día sin especificar'}: "
                    f"{formatear_hora(h.hora_inicio, h.hora_fin)}{aula}"
                )
        return "\n".join(partes)

    return buscar_horario_comision
