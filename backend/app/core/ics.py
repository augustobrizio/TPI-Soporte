"""Serializacion iCalendar (RFC 5545).

Primitivas de formato, sin nada del dominio: quien sabe que es una mesa de
examen es ``calendario_service``, esto solo sabe escribir un ``.ics`` valido.

Se escribe a mano en vez de tirar de una libreria (``icalendar``, ``ics.py``)
porque lo que necesitamos es un subconjunto chico y estable —VEVENT con fecha,
titulo y descripcion— y la parte dificil de RFC 5545 no es el modelo de datos
sino tres detalles de formato que cualquier libreria tambien tendria que
resolver y que igual hay que entender para testear:

1. **CRLF obligatorio.** El RFC pide ``\\r\\n`` entre lineas. Con ``\\n`` solo,
   Google Calendar suele perdonarlo pero Outlook no.
2. **Plegado a 75 octetos**, contando *bytes* y no caracteres: un ``ó`` ocupa
   dos. Y el corte no puede caer en la mitad de un caracter multibyte o el
   cliente lee basura.
3. **Escapado** de ``\\``, ``;``, ``,`` y saltos de linea dentro de los valores
   de texto. Un titulo con una coma —"Mesa de Analisis, turno noche"— parte el
   valor en dos si no se escapa.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

#: Todo el calendario academico de la FRRO es hora de Rosario.
TZ_ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")
_UTC = ZoneInfo("UTC")

#: Limite de octetos por linea que impone el RFC (sin contar el CRLF).
_MAX_OCTETOS = 75


def escapar(texto: str) -> str:
    """Escapa un valor de texto de RFC 5545.

    El orden importa: la barra invertida va primero, porque si no volveriamos
    a escapar las que acabamos de introducir al escapar las comas.
    """
    return (
        texto.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        # \r\n primero para no dejar un \n suelto convertido dos veces.
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def plegar(linea: str) -> str:
    """Pliega una linea larga en varias de <= 75 octetos.

    Las continuaciones arrancan con un espacio, que el parser descarta al
    reensamblar. Se mide en bytes UTF-8 y se corta en frontera de caracter:
    partir un ``ó`` al medio deja dos bytes invalidos que el cliente muestra
    como basura o directamente rechaza.
    """
    if len(linea.encode("utf-8")) <= _MAX_OCTETOS:
        return linea

    partes: list[str] = []
    actual = ""
    # La primera linea admite 75 octetos; las siguientes, 74 + el espacio inicial.
    disponible = _MAX_OCTETOS
    for caracter in linea:
        octetos = len(caracter.encode("utf-8"))
        if len(actual.encode("utf-8")) + octetos > disponible:
            partes.append(actual)
            actual = ""
            disponible = _MAX_OCTETOS - 1
        actual += caracter
    if actual:
        partes.append(actual)

    return "\r\n ".join(partes)


def instante_utc(momento: datetime) -> str:
    """``20260901T213000Z`` — un instante absoluto.

    El ``datetime`` que llega de la DB es **naive** y representa hora de
    Rosario (las columnas son ``DateTime`` sin timezone). Se lo interpreta asi
    y se lo pasa a UTC: emitir la hora local con una ``Z`` pegada la correria
    tres horas para todos los suscriptores.

    Se usa UTC en vez de emitir un ``VTIMEZONE`` propio porque para un instante
    puntual alcanza y no hay forma de equivocarse. Argentina no tiene horario
    de verano desde 2009, pero ``ZoneInfo`` lo resuelve igual si algun dia
    vuelve.
    """
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=TZ_ARGENTINA)
    return momento.astimezone(_UTC).strftime("%Y%m%dT%H%M%SZ")


def dia(fecha: date) -> str:
    """``20260901`` — una fecha sin hora, para eventos de dia completo."""
    return fecha.strftime("%Y%m%d")


def dia_siguiente(fecha: date) -> str:
    """El ``DTEND`` de un evento de dia completo, que es **exclusivo**.

    Un feriado que dura el 1 de septiembre se escribe
    ``DTSTART;VALUE=DATE:20260901`` / ``DTEND;VALUE=DATE:20260902``. Poner el
    mismo dia en las dos puntas lo deja con duracion cero, y poner el ultimo
    dia real en un evento de varios dias lo corta un dia antes — el error
    clasico de los ``.ics`` hechos a mano.
    """
    return dia(fecha + timedelta(days=1))


class Calendario:
    """Acumula lineas y las cierra en un ``.ics`` completo."""

    def __init__(self, *, nombre: str, descripcion: str, prodid: str) -> None:
        self._lineas: list[str] = []
        self.crudo("BEGIN", "VCALENDAR")
        self.crudo("VERSION", "2.0")
        self.crudo("PRODID", prodid)
        self.crudo("CALSCALE", "GREGORIAN")
        # METHOD:PUBLISH marca el archivo como un calendario para leer, no como
        # una invitacion: sin esto algunos clientes preguntan si aceptas o
        # rechazas cada evento.
        self.crudo("METHOD", "PUBLISH")
        self.texto("X-WR-CALNAME", nombre)
        self.texto("X-WR-CALDESC", descripcion)
        self.crudo("X-WR-TIMEZONE", "America/Argentina/Buenos_Aires")

    def crudo(self, propiedad: str, valor: str) -> None:
        """Escribe **sin escapar**.

        Solo para valores que controlamos nosotros y que no pueden traer
        ``;`` ni ``,``: identificadores, fechas ya formateadas, constantes del
        RFC. Para cualquier cosa que venga de la DB va ``texto()``.
        """
        self._lineas.append(plegar(f"{propiedad}:{valor}"))

    def texto(self, propiedad: str, valor: str) -> None:
        """Escribe un valor de texto libre, escapado y plegado."""
        self._lineas.append(plegar(f"{propiedad}:{escapar(valor)}"))

    def parametro(self, propiedad: str, params: str, valor: str) -> None:
        """Escribe una propiedad con parametros (``DTSTART;VALUE=DATE:...``)."""
        self._lineas.append(plegar(f"{propiedad};{params}:{valor}"))

    def abrir_evento(self) -> None:
        self.crudo("BEGIN", "VEVENT")

    def cerrar_evento(self) -> None:
        self.crudo("END", "VEVENT")

    def cerrar(self) -> str:
        """Devuelve el ``.ics`` completo, con CRLF y salto final."""
        lineas = [*self._lineas, "END:VCALENDAR"]
        return "\r\n".join(lineas) + "\r\n"
