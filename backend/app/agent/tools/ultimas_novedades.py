"""Tool: novedades publicadas (centros de estudiantes y sitio de la FRRO)."""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.services import novedad_service


def crear_ultimas_novedades(db: Session):
    """Devuelve la tool `ultimas_novedades` atada a esta sesión."""

    @tool
    def ultimas_novedades(limite: int = 5) -> str:
        """Devuelve las últimas novedades y avisos publicados de la facultad.

        Vienen de los centros de estudiantes y del sitio de la UTN FRRO. Usar
        cuando pregunten qué hay de nuevo, si hay avisos, paros, becas, o
        novedades recientes.

        Args:
            limite: cuántas novedades traer (por defecto 5, máximo 15).
        """
        limite = max(1, min(limite, 15))
        novedades = novedad_service.listar(db, limite=limite)
        if not novedades:
            return "No hay novedades publicadas en este momento."

        lineas = ["Últimas novedades:"]
        for n in novedades:
            fecha = (
                n.fecha_publicacion.strftime("%d/%m/%Y")
                if n.fecha_publicacion
                else "sin fecha"
            )
            linea = f"- [{fecha}] {n.titulo or 'Sin título'}"
            if n.descripcion:
                linea += f": {n.descripcion}"
            lineas.append(linea)
        return "\n".join(lineas)

    return ultimas_novedades
