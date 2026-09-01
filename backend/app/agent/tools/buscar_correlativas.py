"""Tool: correlativas de una materia (RF-02).

Si sabemos qué usuario pregunta, además le decimos si YA cumple los requisitos,
usando su estado académico cargado.
"""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.agent.tools._comun import buscar_materia
from app.repositories import materia_repo
from app.services import correlatividad_service


def crear_buscar_correlativas(db: Session, usuario_id: int | None):
    """Devuelve la tool `buscar_correlativas` atada a esta sesión y usuario."""

    @tool
    def buscar_correlativas(materia: str) -> str:
        """Devuelve las correlativas necesarias para cursar y rendir una materia.

        Usar cuando pregunten qué necesitan para cursar o rendir una materia, qué
        requisitos tiene, de qué materias depende, o si ya pueden cursarla.

        Args:
            materia: nombre o código de la materia (ej. "Diseño de Sistemas").
        """
        m = buscar_materia(db, materia)
        if m is None:
            return f"No encontré ninguna materia parecida a '{materia}' en el plan."

        correlativas = materia_repo.correlativas_de_materia(db, m.codigo)
        if not correlativas:
            partes = [f"{m.nombre} (código {m.codigo}) no tiene correlativas."]
        else:
            lineas = [
                f"- {c.requerida.nombre if c.requerida else c.materia_requerida}: "
                f"debe estar {c.tipo or 'regular'}"
                for c in correlativas
            ]
            partes = [
                f"Correlativas de {m.nombre} (código {m.codigo}):",
                *lineas,
            ]

        # Estado personal: sólo si el usuario está identificado.
        if usuario_id is not None:
            validacion = correlatividad_service.puede_cursar(db, usuario_id, m.codigo)
            if validacion.permitido:
                partes.append("El estudiante YA cumple los requisitos para cursarla.")
            else:
                faltan = ", ".join(
                    f"{f.nombre or f.materia_requerida} (requiere {f.requiere}, "
                    f"tiene {f.tiene})"
                    for f in validacion.faltantes
                )
                partes.append(
                    f"El estudiante TODAVÍA NO puede cursarla. Le falta: {faltan}."
                    if faltan
                    else "El estudiante todavía no puede cursarla."
                )

        return "\n".join(partes)

    return buscar_correlativas
