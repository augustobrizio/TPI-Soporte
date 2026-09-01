"""Tool: datos de un profesor (materias que dicta, mail, horarios de consulta)."""
from __future__ import annotations

from langchain_core.tools import tool
from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from app.agent.tools._comun import buscar_materia, formatear_hora
from app.db.models.profesor import MateriaProfesor, Profesor
from app.repositories import profesor_repo


def _describir(db: Session, profesor: Profesor) -> str:
    partes = [f"- {profesor.nombre or 'Sin nombre'}"]
    if profesor.email:
        partes.append(f"    Mail: {profesor.email}")
    for h in profesor.horarios_consulta:
        modalidad = f" ({h.modalidad})" if h.modalidad else ""
        aula = f", aula {h.aula}" if h.aula else ""
        partes.append(
            f"    Consulta {h.dia or 'sin día'}: "
            f"{formatear_hora(h.hora_inicio, h.hora_fin)}{aula}{modalidad}"
        )
    return "\n".join(partes)


def crear_buscar_profesor(db: Session):
    """Devuelve la tool `buscar_profesor` atada a esta sesión."""

    @tool
    def buscar_profesor(consulta: str) -> str:
        """Busca profesores por su nombre o por la materia que dictan.

        Devuelve su mail y sus horarios de consulta. Usar cuando pregunten quién
        da una materia, cómo contactar a un docente, o cuándo atiende consultas.

        Args:
            consulta: nombre del profesor (ej. "Pérez") o de la materia
                (ej. "quién da Física I").
        """
        consulta = (consulta or "").strip()
        if not consulta:
            return "Necesito un nombre de profesor o de materia para buscar."

        # 1) ¿Es el nombre de una materia? Entonces listamos su cátedra.
        materia = buscar_materia(db, consulta)
        if materia is not None:
            cargos = (
                db.query(MateriaProfesor)
                .filter(MateriaProfesor.materia_codigo == materia.codigo)
                .all()
            )
            if cargos:
                lineas = [f"Profesores de {materia.nombre} (código {materia.codigo}):"]
                for cargo in cargos:
                    prof = profesor_repo.get_profesor_detalle(db, cargo.profesor_id)
                    if prof is None:
                        continue
                    bloque = _describir(db, prof)
                    if cargo.cargo:
                        bloque = bloque.replace(
                            f"- {prof.nombre or 'Sin nombre'}",
                            f"- {prof.nombre or 'Sin nombre'} ({cargo.cargo})",
                            1,
                        )
                    lineas.append(bloque)
                return "\n".join(lineas)

        # 2) Si no, buscamos por nombre de profesor (difuso).
        profesores = list(profesor_repo.list_profesores(db))
        nombres = {p.nombre: p for p in profesores if p.nombre}
        if not nombres:
            return "No hay profesores cargados en el sistema."

        matches = process.extract(
            consulta, nombres.keys(), scorer=fuzz.WRatio, limit=3, score_cutoff=70
        )
        if not matches:
            return f"No encontré profesores que coincidan con '{consulta}'."

        lineas = ["Profesores encontrados:"]
        for nombre, _score, _idx in matches:
            detalle = profesor_repo.get_profesor_detalle(db, nombres[nombre].id)
            if detalle is not None:
                lineas.append(_describir(db, detalle))
        return "\n".join(lineas)

    return buscar_profesor
