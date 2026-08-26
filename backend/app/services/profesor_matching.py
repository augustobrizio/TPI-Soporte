"""Identidad de profesores: normalizacion de nombres y matching contra el padron.

Punto unico de verdad para decidir si dos grafias son la misma persona. Lo usan
los tres flujos que dan de alta profesores (horarios de consulta FRRO, sheet de
mails UTNTAC, sheet de catedras UTNTAC) y el matcher de cursadas.

Cada fuente escribe el mismo nombre distinto::

    'RIPANI, Luciano Ernesto'    (padron FRRO)  vs  'Ripani, Luciano'          (mails)
    'CAMPERCHIOLI, Maria Norma'                 vs  'Camperchioli, M. Norma'
    'D ARRIGO, Florencia'                       vs  'D’Arrigo, Florencia'
    'RUGGIERO, Franco'                          vs  'RUGGIERO,Franco'

Matchear por string exacto —lo que se hacia antes— crea un profesor por cada
variante, y cada duplicado se lleva una parte de las reseñas, con lo cual el
score de la catedra queda partido en dos.

``IndicePadron.resolver`` prueba tres señales, de mas fuerte a mas debil:

1. ``clave_nombre`` exacta: misma persona sin ambiguedad.
2. email exacto: señal fuerte e independiente de la grafia. Resuelve apellidos
   compuestos que una fuente recorta ('OLIVEROS VEGA, Miguel' vs
   'Oliveros, Miguel').
3. mismo apellido + nombres de pila compatibles: inicial abreviada, segundo
   nombre faltante, o un typo de un caracter.

Ante **mas de un** candidato en el paso 3 devolvemos ``None`` a proposito: es
preferible crear un duplicado visible —y facil de purgar despues— antes que
fusionar dos personas distintas y mezclarles las reseñas, que es irreversible.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.core.texto import normalizar_texto
from app.db.models.profesor import Profesor
from app.repositories import profesor_repo

# Un token de <= 2 caracteres se lee como inicial abreviada ('M.', 'Ma', 'E').
LARGO_MAX_INICIAL = 2

# Similitud minima para aceptar que dos tokens son el mismo nombre con un typo
# ('Marie' vs 'Mariel'). Alto a proposito: 'Ana' vs 'Analia' da 66 y no pasa.
SIMILITUD_MIN_TYPO = 90.0
LARGO_MIN_TYPO = 4

# Primeros nombres de compuestos que la segunda fuente suele omitir:
# 'NALLI, María Yanina' aparece como 'NALLI, Yanina'. La lista es corta a
# proposito — sin ella, permitir el salteo de cualquier token de cabecera
# fusionaria 'PEREZ, Carlos' con 'PEREZ, Juan Carlos'.
PARTICULAS_COMPUESTAS = frozenset({"maria", "ma", "jose"})


def clave_nombre(nombre: str) -> str:
    """Clave canonica exacta de un nombre. Es lo que persiste ``profesor.nombre_key``.

    Colapsa mayusculas, acentos, puntuacion y espaciado, de modo que
    'RUGGIERO, Franco', 'RUGGIERO,Franco' y 'Ruggiero, Franco' comparten clave.
    Sobre esta clave hay un unique index: la DB deja de aceptar el mismo nombre
    dos veces aunque cambie el email.
    """
    apellido, nombres = _partir(nombre)
    return f"{apellido}|{' '.join(nombres)}".strip("|")


def apellido_principal(nombre_o_docente: str) -> str:
    """Primer token del apellido: 'BADOGLIO, Mariano Javier' -> 'badoglio'.

    Es lo que necesita el matcher de cursadas, donde ``cursada.docente`` viene
    del Excel como un apellido suelto y sin segundo apellido.
    """
    tokens = normalizar_texto(nombre_o_docente.split(",")[0]).split()
    return tokens[0] if tokens else ""


def _partir(nombre: str) -> tuple[str, tuple[str, ...]]:
    """``'De Sanctis, M. Ana'`` -> ``('desanctis', ('m', 'ana'))``.

    El apellido va sin espacios para que 'D ARRIGO' y 'D’Arrigo' colapsen a
    'darrigo'. Sin coma, se toma todo como apellido (no adivinamos el corte).
    """
    cabeza, _, cola = nombre.partition(",")
    apellido = normalizar_texto(cabeza).replace(" ", "")
    nombres = tuple(normalizar_texto(cola).split())
    return apellido, nombres


def _es_inicial_de(corto: str, largo: str) -> bool:
    """'m' es inicial de 'maria'; 'ma' tambien. 'm' no es inicial de 'norma'."""
    return len(corto) <= LARGO_MAX_INICIAL and len(largo) > len(corto) and largo.startswith(corto)


def _tokens_compatibles(a: str, b: str) -> bool:
    """Dos nombres de pila en la misma posicion son el mismo nombre."""
    if a == b:
        return True
    if _es_inicial_de(a, b) or _es_inicial_de(b, a):
        return True
    if min(len(a), len(b)) >= LARGO_MIN_TYPO:
        return fuzz.ratio(a, b) >= SIMILITUD_MIN_TYPO
    return False


def _variantes(nombres: tuple[str, ...]) -> list[tuple[str, ...]]:
    """El nombre tal cual, y sin la particula de compuesto si la tiene."""
    variantes = [nombres]
    if len(nombres) > 1 and nombres[0] in PARTICULAS_COMPUESTAS:
        variantes.append(nombres[1:])
    return variantes


def _nombres_compatibles(a: tuple[str, ...], b: tuple[str, ...]) -> bool:
    """Comparacion posicional: el mas corto tiene que ser prefijo del mas largo.

    Asi 'Luciano' matchea 'Luciano Ernesto' (falta el segundo nombre) pero
    'Maria Belen' no matchea 'Maria Evangelina' (el segundo nombre difiere).
    """
    for va in _variantes(a):
        for vb in _variantes(b):
            if not va or not vb:
                continue
            if all(_tokens_compatibles(x, y) for x, y in zip(va, vb)):
                return True
    return False


def son_la_misma_persona(nombre_a: str, nombre_b: str) -> bool:
    """True si dos grafias corresponden al mismo profesor (sin mirar el email)."""
    ap_a, nom_a = _partir(nombre_a)
    ap_b, nom_b = _partir(nombre_b)
    if not ap_a or ap_a != ap_b:
        return False
    return _nombres_compatibles(nom_a, nom_b)


def es_mas_completo(nuevo: str, actual: str) -> bool:
    """True si ``nuevo`` es una grafia mas informativa que ``actual``.

    Gana el que tiene mas nombres de pila; a igual cantidad, el que tiene menos
    iniciales abreviadas ('Maria Norma' le gana a 'M. Norma'). Ante empate se
    conserva el actual, para que re-correr los syncs no cambie el padron.
    """
    _, nom_nuevo = _partir(nuevo)
    _, nom_actual = _partir(actual)
    if len(nom_nuevo) != len(nom_actual):
        return len(nom_nuevo) > len(nom_actual)
    iniciales = sum(len(t) <= LARGO_MAX_INICIAL for t in nom_nuevo)
    iniciales_actual = sum(len(t) <= LARGO_MAX_INICIAL for t in nom_actual)
    return iniciales < iniciales_actual


@dataclass
class IndicePadron:
    """Padron completo en memoria, indexado para resolver un nombre por fila.

    Los syncs procesan cientos de filas: cargar el padron una vez y resolver
    contra este indice evita una query por fila. ``registrar`` mantiene el
    indice al dia con lo que se va creando dentro de la misma corrida.
    """

    por_clave: dict[str, Profesor] = field(default_factory=dict)
    por_email: dict[str, Profesor] = field(default_factory=dict)
    por_apellido: dict[str, list[Profesor]] = field(default_factory=dict)

    @classmethod
    def cargar(cls, db: Session) -> IndicePadron:
        """Construye el indice con todo el padron actual."""
        indice = cls()
        for prof in profesor_repo.list_profesores(db):
            indice.registrar(prof)
        return indice

    def registrar(self, prof: Profesor) -> None:
        """Suma un profesor al indice (o refresca sus claves si cambio el nombre)."""
        if not prof.nombre:
            return
        apellido, _ = _partir(prof.nombre)
        self.por_clave.setdefault(clave_nombre(prof.nombre), prof)
        if prof.email:
            self.por_email.setdefault(prof.email.strip().lower(), prof)
        candidatos = self.por_apellido.setdefault(apellido, [])
        if prof not in candidatos:
            candidatos.append(prof)

    def resolver(self, nombre: str, email: str | None = None) -> Profesor | None:
        """Devuelve el profesor del padron que corresponde a ``nombre``, o ``None``.

        Ver el docstring del modulo para el orden de las señales. Si el apellido
        tiene mas de un candidato compatible, devuelve ``None`` (ambiguo).
        """
        exacto = self.por_clave.get(clave_nombre(nombre))
        if exacto is not None:
            return exacto

        if email:
            por_mail = self.por_email.get(email.strip().lower())
            if por_mail is not None:
                return por_mail

        apellido, nombres = _partir(nombre)
        candidatos = [
            prof
            for prof in self.por_apellido.get(apellido, [])
            if prof.nombre and _nombres_compatibles(nombres, _partir(prof.nombre)[1])
        ]
        return candidatos[0] if len(candidatos) == 1 else None


def obtener_o_crear(
    db: Session, indice: IndicePadron, *, nombre: str, email: str | None
) -> tuple[Profesor, bool]:
    """Resuelve ``nombre`` contra el padron o crea el profesor. -> ``(profesor, creado)``.

    Cuando la fila entrante aporta algo que el padron no tenia, lo completa:
    el email si estaba vacio, y el nombre si la grafia nueva es mas completa
    (asi el resultado no depende de que sync corrio primero). Nunca pisa un
    email ya cargado.

    NO hace ``db.commit()`` — eso es responsabilidad del endpoint.
    """
    prof = indice.resolver(nombre, email)
    if prof is None:
        prof = profesor_repo.crear_profesor(
            db, nombre=nombre, nombre_key=clave_nombre(nombre), email=email
        )
        indice.registrar(prof)
        return prof, True

    if email and not prof.email:
        profesor_repo.update_email(db, prof.id, email)
        indice.registrar(prof)

    if prof.nombre and es_mas_completo(nombre, prof.nombre):
        clave_nueva = clave_nombre(nombre)
        ocupante = indice.por_clave.get(clave_nueva)
        # Si otro profesor ya tiene esa clave, el unique index rechazaria el
        # UPDATE: dejamos el nombre como esta.
        if ocupante is None or ocupante is prof:
            profesor_repo.actualizar_nombre(
                db, prof.id, nombre=nombre, nombre_key=clave_nueva
            )
            indice.por_clave[clave_nueva] = prof

    return prof, False
