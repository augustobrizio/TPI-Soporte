"""Schemas del buscador global.

El item de resultado es deliberadamente plano y **no trae la URL del
frontend**: el backend no sabe (ni tiene por qué saber) que un profesor se
mira en ``/profesores/{id}``. Devuelve ``tipo`` + ``id`` y el que arma el
link es el frontend, que es el dueño de su propio ruteo.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

TipoResultado = Literal["materia", "profesor", "comision", "novedad"]


class ItemBusqueda(BaseModel):
    """Un resultado, ya listo para pintar en la lista del command palette."""

    tipo: TipoResultado
    #: Identificador natural del recurso. Es ``str`` incluso para los que
    #: tienen id numérico (profesor, novedad) porque materia se identifica por
    #: código: un solo tipo para las cuatro entidades simplifica el frontend.
    id: str
    titulo: str
    #: Línea secundaria (email del profe, año de la comisión, etc.). Puede no
    #: haber: no se inventa texto para rellenar.
    detalle: str | None = None
    #: **Sólo para materias**: ``troncal`` o ``electiva``. Es el único caso en
    #: que el ``id`` no alcanza para armar el link, porque el grafo del
    #: frontend se abre por tipo y una electiva no existe en el de troncales.
    #: Antes que hacer una consulta extra del lado del frontend para
    #: averiguarlo, se manda acá, que ya lo teníamos leído.
    tipo_materia: Literal["troncal", "electiva"] | None = None


class RespuestaBusqueda(BaseModel):
    """Resultados agrupados por tipo, con el límite aplicado a cada grupo.

    Se devuelven en grupos y no en una lista plana para que el límite por tipo
    sea parte del contrato: una materia muy buscada no puede desplazar a todos
    los profesores de la respuesta.
    """

    query: str
    total: int
    materias: list[ItemBusqueda] = []
    profesores: list[ItemBusqueda] = []
    comisiones: list[ItemBusqueda] = []
    novedades: list[ItemBusqueda] = []
