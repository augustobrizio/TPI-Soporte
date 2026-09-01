"""Tool: próximos eventos del calendario académico (mesas, exámenes, feriados)."""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.services import calendario_service


def crear_proximos_eventos(db: Session, usuario_id: int | None):
    """Devuelve la tool `proximos_eventos` atada a esta sesión y usuario."""

    @tool
    def proximos_eventos(limite: int = 5) -> str:
        """Devuelve las próximas fechas del calendario académico de la facultad.

        Incluye mesas de examen, fechas de inscripción, feriados y eventos
        institucionales, más los eventos personales del propio estudiante. Usar
        cuando pregunten por fechas, cuándo es algo, cuándo son las mesas o qué
        se viene.

        Args:
            limite: cuántos eventos traer (por defecto 5, máximo 15).
        """
        limite = max(1, min(limite, 15))
        # usuario_id acota a eventos compartidos + los personales de ESTE usuario.
        eventos = calendario_service.proximos_eventos(
            db, limite=limite, usuario_id=usuario_id
        )
        if not eventos:
            return "No hay eventos próximos cargados en el calendario."

        lineas = ["Próximos eventos del calendario académico:"]
        for e in eventos:
            fecha = e.fecha_inicio.strftime("%d/%m/%Y")
            if e.fecha_fin and e.fecha_fin.date() != e.fecha_inicio.date():
                fecha += f" al {e.fecha_fin.strftime('%d/%m/%Y')}"
            linea = f"- {fecha} — {e.titulo} ({e.tipo})"
            if e.descripcion:
                linea += f": {e.descripcion}"
            lineas.append(linea)
        return "\n".join(lineas)

    return proximos_eventos
