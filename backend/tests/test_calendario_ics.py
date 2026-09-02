"""Exportacion del calendario a iCalendar (T11.1 del Frente 11).

Un ``.ics`` roto no falla ruidosamente: Google Calendar importa lo que
entiende y descarta el resto en silencio, asi que el alumno se entera de que
faltan tres mesas cuando ya no le sirve. Por eso los tests miran el **texto
generado** y no solo que la funcion devuelva algo.

Lo que se fija, en orden de que tan facil es romperlo sin darse cuenta:

1. **DTEND es exclusivo** en eventos de dia completo. Un feriado del 1/9 se
   escribe DTSTART 20260901 / DTEND 20260902. Es el error clasico del .ics
   hecho a mano y hace que todo aparezca un dia corto.
2. **Dia completo vs horario.** El calendario de la FRRO publica fechas, no
   horarios: el scraper las guarda a medianoche. Emitidas como evento con hora
   le aparecen al alumno como una cita a las 00:00.
3. **Zona horaria.** Los datetime de la DB son naive y son hora de Rosario.
   Pegarles una "Z" sin convertir corre todo tres horas.
4. **Escapado y plegado**, que es donde un titulo con una coma o un acento
   parte el archivo.
5. **Aislamiento**: el .ics de un alumno no puede traer los eventos personales
   de otro. Es el mismo requisito que el resto del calendario (RNF-06), pero
   por una ruta nueva.
"""
from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app.core import ics
from app.db.models.calendario import EventoCalendario
from app.db.models.usuario import Usuario
from app.services import calendario_service


def _evento(db: Session, **campos) -> EventoCalendario:
    base = {
        "titulo": "Mesa de Análisis Matemático I",
        "descripcion": None,
        "fecha_inicio": datetime(2026, 9, 1),
        "fecha_fin": None,
        "tipo": "mesa",
        "carrera": "ISI",
        "fuente_url": None,
        "content_hash": f"hash-{campos.get('titulo', 'x')}-{campos.get('fecha_inicio', '')}",
        "origen": "sistema",
        "usuario_id": None,
    }
    base.update(campos)
    evento = EventoCalendario(**base)
    db.add(evento)
    db.commit()
    return evento


def _lineas(texto: str) -> list[str]:
    """Desdobla el plegado y devuelve las lineas logicas.

    Reensambla como lo hace un cliente: una linea que arranca con espacio es
    continuacion de la anterior. Sin esto, buscar "SUMMARY:..." en un archivo
    con lineas largas falla aunque el archivo este bien.
    """
    salida: list[str] = []
    for linea in texto.split("\r\n"):
        if linea.startswith(" ") and salida:
            salida[-1] += linea[1:]
        else:
            salida.append(linea)
    return salida


def _valor(texto: str, propiedad: str) -> str:
    """Primer valor de una propiedad, ya desdoblada."""
    for linea in _lineas(texto):
        if linea.startswith(f"{propiedad}:"):
            return linea.split(":", 1)[1]
        if linea.startswith(f"{propiedad};"):
            return linea.split(":", 1)[1]
    raise AssertionError(f"{propiedad} no aparece en el .ics")


# ---------------------------------------------------------------------------
# Estructura del archivo
# ---------------------------------------------------------------------------
def test_envoltorio_minimo(db: Session) -> None:
    _evento(db)
    texto = calendario_service.generar_ics(db)
    lineas = _lineas(texto)

    assert lineas[0] == "BEGIN:VCALENDAR"
    assert "VERSION:2.0" in lineas
    assert "CALSCALE:GREGORIAN" in lineas
    assert "END:VCALENDAR" in lineas
    assert "BEGIN:VEVENT" in lineas
    assert "END:VEVENT" in lineas


def test_termina_en_crlf(db: Session) -> None:
    """El RFC pide CRLF. Con \\n solo, Outlook rechaza el archivo."""
    _evento(db)
    texto = calendario_service.generar_ics(db)

    assert texto.endswith("\r\n")
    # Ningun \n suelto: todos tienen que venir precedidos de \r.
    assert "\n" not in texto.replace("\r\n", "")


def test_un_vevent_por_evento(db: Session) -> None:
    _evento(db, titulo="Mesa A", content_hash="h-a")
    _evento(db, titulo="Mesa B", content_hash="h-b")
    _evento(db, titulo="Mesa C", content_hash="h-c")

    texto = calendario_service.generar_ics(db)
    assert texto.count("BEGIN:VEVENT") == 3
    assert texto.count("END:VEVENT") == 3


def test_calendario_vacio_sigue_siendo_valido(db: Session) -> None:
    """Sin eventos no se devuelve un string vacio ni se rompe."""
    texto = calendario_service.generar_ics(db)
    lineas = _lineas(texto)

    assert lineas[0] == "BEGIN:VCALENDAR"
    assert "END:VCALENDAR" in lineas
    assert "BEGIN:VEVENT" not in texto


def test_uid_estable_entre_descargas(db: Session) -> None:
    """El mismo evento tiene que dar el mismo UID siempre.

    Es lo que le permite al cliente entender que un evento editado es el mismo
    y no uno nuevo. Con UID aleatorio, cada resync duplica todo el calendario.
    """
    _evento(db, content_hash="hash-estable")

    primera = calendario_service.generar_ics(db)
    segunda = calendario_service.generar_ics(db)

    assert _valor(primera, "UID") == "hash-estable@utnhub"
    assert primera == segunda


# ---------------------------------------------------------------------------
# Dia completo vs evento con horario
# ---------------------------------------------------------------------------
def test_evento_a_medianoche_sale_como_dia_completo(db: Session) -> None:
    """Sin esto, un feriado le aparece al alumno como una cita a las 00:00."""
    _evento(db, fecha_inicio=datetime(2026, 9, 1), tipo="feriado")
    texto = calendario_service.generar_ics(db)

    assert "DTSTART;VALUE=DATE:20260901" in _lineas(texto)


def test_dtend_de_un_dia_completo_es_exclusivo(db: Session) -> None:
    """Un evento de un solo dia termina al dia SIGUIENTE.

    Es contraintuitivo y es el bug clasico: con DTEND igual a DTSTART el
    evento dura cero y varios clientes directamente no lo muestran.
    """
    _evento(db, fecha_inicio=datetime(2026, 9, 1), fecha_fin=None)
    lineas = _lineas(calendario_service.generar_ics(db))

    assert "DTSTART;VALUE=DATE:20260901" in lineas
    assert "DTEND;VALUE=DATE:20260902" in lineas


def test_dtend_de_varios_dias_no_corta_el_ultimo(db: Session) -> None:
    """Del 1 al 5 inclusive => DTEND 20260906, no 20260905."""
    _evento(
        db,
        fecha_inicio=datetime(2026, 9, 1),
        fecha_fin=datetime(2026, 9, 5),
    )
    lineas = _lineas(calendario_service.generar_ics(db))

    assert "DTSTART;VALUE=DATE:20260901" in lineas
    assert "DTEND;VALUE=DATE:20260906" in lineas


def test_evento_con_hora_sale_con_horario(db: Session) -> None:
    """Un TP a las 18:30 no es una fecha: va como instante, no como dia."""
    _evento(
        db,
        titulo="Entrega TP Soporte",
        tipo="trabajo_practico",
        fecha_inicio=datetime(2026, 9, 1, 18, 30),
        fecha_fin=datetime(2026, 9, 1, 20, 0),
    )
    lineas = _lineas(calendario_service.generar_ics(db))

    assert not any(l.startswith("DTSTART;VALUE=DATE") for l in lineas)
    # 18:30 en Rosario (UTC-3) son las 21:30 UTC.
    assert "DTSTART:20260901T213000Z" in lineas
    assert "DTEND:20260901T230000Z" in lineas


def test_la_hora_se_convierte_a_utc_no_se_etiqueta(db: Session) -> None:
    """El bug silencioso: pegarle una Z a la hora local corre todo 3 horas."""
    _evento(db, fecha_inicio=datetime(2026, 9, 1, 9, 0), tipo="examen")
    texto = calendario_service.generar_ics(db)

    assert "DTSTART:20260901T120000Z" in _lineas(texto)
    assert "DTSTART:20260901T090000Z" not in _lineas(texto)


# ---------------------------------------------------------------------------
# Escapado y plegado (RFC 5545)
# ---------------------------------------------------------------------------
def test_la_coma_del_titulo_se_escapa(db: Session) -> None:
    """Sin escapar, la coma parte el valor en dos y se pierde media linea."""
    _evento(db, titulo="Mesa de Análisis, turno noche")
    texto = calendario_service.generar_ics(db)

    assert "Análisis\\, turno noche" in _valor(texto, "SUMMARY")


def test_punto_y_coma_y_barra_se_escapan(db: Session) -> None:
    _evento(db, titulo="Taller: C:\\temp; sala 3")
    summary = _valor(calendario_service.generar_ics(db), "SUMMARY")

    assert "\\\\temp" in summary
    assert "\\;" in summary


def test_el_salto_de_linea_se_vuelve_backslash_n(db: Session) -> None:
    """Un \\n literal dentro de un valor termina el campo. Va como \\\\n."""
    _evento(db, descripcion="Primera linea\nSegunda linea")
    texto = calendario_service.generar_ics(db)

    assert "Primera linea\\nSegunda linea" in _valor(texto, "DESCRIPTION")


def test_ninguna_linea_pasa_de_75_octetos(db: Session) -> None:
    """Y se mide en bytes, no en caracteres: los acentos ocupan dos."""
    _evento(
        db,
        titulo="Mesa de Análisis Matemático II con muchísimos acentos "
        "para forzar el plegado más allá del límite de setenta y cinco octetos",
    )
    texto = calendario_service.generar_ics(db)

    for linea in texto.split("\r\n"):
        assert len(linea.encode("utf-8")) <= 75, linea


def test_el_plegado_no_parte_un_caracter_multibyte(db: Session) -> None:
    """Cortar un 'ó' al medio deja dos bytes invalidos.

    Que el archivo se pueda decodificar como UTF-8 es la prueba: si el corte
    hubiera caido en la mitad de un caracter, esto explota.
    """
    _evento(db, titulo="ó" * 200)
    texto = calendario_service.generar_ics(db)

    texto.encode("utf-8").decode("utf-8")
    # Y desdoblado se recupera el titulo entero.
    assert "ó" * 200 in _valor(texto, "SUMMARY").replace("\\", "")


def test_el_desdoblado_reconstruye_el_valor_original(db: Session) -> None:
    """Un cliente que reensambla tiene que ver el titulo tal cual."""
    largo = "Mesa de " + ("Sistemas Operativos " * 6).strip()
    _evento(db, titulo=largo)

    assert _valor(calendario_service.generar_ics(db), "SUMMARY").endswith(
        "Sistemas Operativos"
    )


# ---------------------------------------------------------------------------
# Contenido del evento
# ---------------------------------------------------------------------------
def test_el_titulo_lleva_el_tipo_adelante(db: Session) -> None:
    """En Google el evento se ve suelto, sin el contexto de la pantalla."""
    _evento(db, titulo="Análisis Matemático I", tipo="mesa")
    assert _valor(calendario_service.generar_ics(db), "SUMMARY").startswith("Mesa · ")


def test_no_se_repite_el_tipo_si_el_titulo_ya_lo_dice(db: Session) -> None:
    """"Mesa · Mesa de Análisis" queda feo y es la mitad de los titulos."""
    _evento(db, titulo="Mesa de Análisis Matemático I", tipo="mesa")
    assert not _valor(calendario_service.generar_ics(db), "SUMMARY").startswith(
        "Mesa · Mesa"
    )


def test_la_fuente_viaja_como_url(db: Session) -> None:
    _evento(db, fuente_url="https://frro.utn.edu.ar/calendario.pdf")
    lineas = _lineas(calendario_service.generar_ics(db))

    assert "URL:https://frro.utn.edu.ar/calendario.pdf" in lineas


def test_los_institucionales_no_marcan_ocupado(db: Session) -> None:
    """Un feriado no deberia bloquearle la agenda a nadie."""
    _evento(db, tipo="feriado", usuario_id=None)
    assert "TRANSP:TRANSPARENT" in _lineas(calendario_service.generar_ics(db))


# ---------------------------------------------------------------------------
# Aislamiento entre usuarios (RNF-06 por una ruta nueva)
# ---------------------------------------------------------------------------
def test_sin_sesion_solo_salen_los_institucionales(db: Session) -> None:
    alumno = Usuario(email="ana@frro.utn.edu.ar")
    db.add(alumno)
    db.commit()

    _evento(db, titulo="Mesa institucional", content_hash="h-inst")
    _evento(
        db,
        titulo="TP privado de Ana",
        content_hash="h-ana",
        origen="usuario",
        usuario_id=alumno.id,
    )

    texto = calendario_service.generar_ics(db, usuario_id=None)
    assert "Mesa institucional" in texto
    assert "TP privado de Ana" not in texto


def test_con_sesion_salen_los_propios_ademas(db: Session) -> None:
    alumno = Usuario(email="ana@frro.utn.edu.ar")
    db.add(alumno)
    db.commit()

    _evento(db, titulo="Mesa institucional", content_hash="h-inst")
    _evento(
        db,
        titulo="TP privado de Ana",
        content_hash="h-ana",
        origen="usuario",
        usuario_id=alumno.id,
    )

    texto = calendario_service.generar_ics(db, usuario_id=alumno.id)
    assert "Mesa institucional" in texto
    assert "TP privado de Ana" in texto


def test_no_se_filtran_los_eventos_de_otro_alumno(db: Session) -> None:
    """El caso que importa: el .ics de Beto no puede traer el TP de Ana."""
    ana = Usuario(email="ana@frro.utn.edu.ar")
    beto = Usuario(email="beto@frro.utn.edu.ar")
    db.add_all([ana, beto])
    db.commit()

    _evento(
        db,
        titulo="TP privado de Ana",
        content_hash="h-ana",
        origen="usuario",
        usuario_id=ana.id,
    )

    texto = calendario_service.generar_ics(db, usuario_id=beto.id)
    assert "TP privado de Ana" not in texto


# ---------------------------------------------------------------------------
# Primitivas de app/core/ics.py
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "entrada,esperado",
    [
        ("simple", "simple"),
        ("con,coma", "con\\,coma"),
        ("con;punto", "con\\;punto"),
        ("con\\barra", "con\\\\barra"),
        ("dos\nlineas", "dos\\nlineas"),
        ("crlf\r\naca", "crlf\\naca"),
    ],
)
def test_escapar(entrada: str, esperado: str) -> None:
    assert ics.escapar(entrada) == esperado


def test_escapar_no_re_escapa_las_barras_que_introduce() -> None:
    """El orden importa: si la coma se escapara antes que la barra, la barra
    que introduce el escape de la coma se volveria a escapar."""
    assert ics.escapar("a,b") == "a\\,b"
    assert ics.escapar("a\\,b") == "a\\\\\\,b"


def test_plegar_deja_corta_la_linea_que_ya_entra() -> None:
    assert ics.plegar("corta") == "corta"


def test_plegar_usa_espacio_de_continuacion() -> None:
    plegada = ics.plegar("X" * 200)
    assert "\r\n " in plegada
    for linea in plegada.split("\r\n"):
        assert len(linea.encode("utf-8")) <= 75


def test_dia_siguiente_cruza_fin_de_mes() -> None:
    from datetime import date

    assert ics.dia_siguiente(date(2026, 9, 30)) == "20261001"
    assert ics.dia_siguiente(date(2026, 12, 31)) == "20270101"


def test_instante_utc_respeta_un_datetime_que_ya_trae_zona() -> None:
    momento = datetime(2026, 9, 1, 12, 0, tzinfo=ics.TZ_ARGENTINA)
    assert ics.instante_utc(momento) == "20260901T150000Z"
