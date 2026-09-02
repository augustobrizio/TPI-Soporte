"""Servicio de chat del asistente UTNHub.

Orquesta una consulta completa: carga el historial de la conversación, corre el
agente (que decide qué herramientas usar), y persiste el turno.

El agente vive en ``app/agent/`` y es quien decide entre buscar en documentos
(RAG) o consultar datos estructurados (correlativas, horarios, profesores,
calendario, novedades). Este service es la frontera con la API: no sabe de
grafos ni de prompts, sólo de "una pregunta entra, una respuesta sale".
"""
from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.orm import Session

from app.agent.graph import construir_grafo
from app.db.models.rag import RagChunk
from app.repositories import conversacion_repo

logger = logging.getLogger(__name__)

# Cuántos mensajes previos se le mandan al modelo. Acota el costo por consulta
# y evita que conversaciones largas se coman la ventana de contexto.
MAX_HISTORIAL = 10

# Tope de vueltas del ciclo agente<->tools, por si el modelo se enrosca pidiendo
# herramientas sin llegar a una respuesta.
MAX_ITERACIONES = 8

_ERROR_LLM = (
    "El asistente está sobrecargado en este momento. Probá de nuevo en unos "
    "segundos."
)

# Etiqueta amable para cada tool, para mostrar los "pasos" del agente en vivo.
# La clave es el nombre con el que la tool queda registrada (su ``name``), que
# es el mismo que el LLM usa al pedirla. Si aparece una tool sin mapear, cae en
# un texto genérico (ver ``_PASO_GENERICO``).
_PASO_LABELS: dict[str, str] = {
    "rag_search": "Buscando en documentos oficiales…",
    "buscar_correlativas": "Revisando correlatividades…",
    "buscar_horario_comision": "Consultando horarios…",
    "buscar_profesor": "Buscando profesor…",
    "proximos_eventos": "Revisando el calendario…",
    "ultimas_novedades": "Mirando novedades…",
    "ficha_materia": "Armando la ficha de materia…",
}
_PASO_GENERICO = "Buscando información…"


def _sse(evento: str, payload: dict) -> str:
    """Serializa un evento como un frame SSE (``event:`` + ``data:`` en JSON).

    El doble salto de línea final es el separador que exige el protocolo: marca
    el fin de un evento para el ``EventSource``/lector del otro lado.
    """
    return f"event: {evento}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@dataclass
class Fuente:
    """Metadato de un fragmento usado para responder (para citar)."""

    titulo: str | None
    fuente: str
    url: str | None
    fecha: str | None = None  # fecha de actualización (ISO YYYY-MM-DD), si se conoce


@dataclass
class RespuestaChat:
    respuesta: str
    fuentes: list[Fuente] = field(default_factory=list)
    conversacion_id: int | None = None
    mensaje_id: int | None = None  # id del mensaje del asistente (para feedback)
    fichas: list[dict] = field(default_factory=list)  # fichas de materia (§19)


def _extraer_texto(content: object) -> str:
    """Devuelve el texto plano de la respuesta del LLM.

    LangChain entrega ``content`` como string simple o, con los modelos Gemini
    nuevos, como lista de bloques (``{"type": "text", "text": ...}`` + una
    "firma" interna que no nos interesa). Unificamos ambos casos a un string.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        partes = [
            bloque["text"]
            for bloque in content
            if isinstance(bloque, dict) and bloque.get("type") == "text"
        ]
        return "".join(partes)
    return str(content)


def _historial_langchain(db: Session, conversacion_id: int) -> list:
    """Últimos mensajes de la conversación, como mensajes de LangChain."""
    mensajes = conversacion_repo.listar_mensajes(db, conversacion_id)
    recientes = mensajes[-MAX_HISTORIAL:]
    convertidos = []
    for m in recientes:
        if not m.contenido:
            continue
        if m.role == "user":
            convertidos.append(HumanMessage(content=m.contenido))
        elif m.role == "assistant":
            convertidos.append(AIMessage(content=m.contenido))
    return convertidos


def _titulo_desde(pregunta: str, limite: int = 60) -> str:
    """Título corto de la conversación, a partir de la primera pregunta."""
    limpio = " ".join(pregunta.split())
    return limpio if len(limpio) <= limite else f"{limpio[:limite - 1]}…"


def _construir_fuentes(recolector: list[RagChunk]) -> list[Fuente]:
    """Fuentes citadas a partir de los fragmentos recuperados.

    Dedup por ``(titulo, url)``: un documento puede aportar varios fragmentos y
    no tiene sentido listarlo repetido (RNF-12).
    """
    vistas: set[tuple[str | None, str | None]] = set()
    fuentes: list[Fuente] = []
    for chunk in recolector:
        clave = (chunk.titulo, chunk.url)
        if clave in vistas:
            continue
        vistas.add(clave)
        fecha = (
            chunk.fecha_actualizacion.date().isoformat()
            if chunk.fecha_actualizacion
            else None
        )
        fuentes.append(
            Fuente(
                titulo=chunk.titulo,
                fuente=chunk.fuente,
                url=chunk.url,
                fecha=fecha,
            )
        )
    return fuentes


def _dedup_fichas(recolector_fichas: list[dict]) -> list[dict]:
    """Fichas de materia sin repetidos (dedup por código). No se persisten."""
    fichas: list[dict] = []
    codigos_vistos: set[str] = set()
    for f in recolector_fichas:
        if f["codigo"] in codigos_vistos:
            continue
        codigos_vistos.add(f["codigo"])
        fichas.append(f)
    return fichas


def responder(
    db: Session,
    pregunta: str,
    *,
    usuario_id: int,
    conversacion_id: int | None = None,
) -> RespuestaChat:
    """Responde una pregunta dentro de una conversación (la crea si no existe).

    No hace commit: lo controla el endpoint, para que un fallo no deje la
    conversación a medio guardar.
    """
    # 1. Conversación: la existente (validando dueño) o una nueva.
    conversacion = None
    if conversacion_id is not None:
        conversacion = conversacion_repo.get_conversacion(
            db, conversacion_id, usuario_id
        )
    if conversacion is None:
        conversacion = conversacion_repo.crear_conversacion(
            db, usuario_id, titulo=_titulo_desde(pregunta)
        )

    historial = _historial_langchain(db, conversacion.id)

    # 2. Correr el agente. El recolector junta los fragmentos que la tool de RAG
    #    haya recuperado, para poder mostrar las fuentes (RNF-12).
    recolector: list[RagChunk] = []
    recolector_fichas: list[dict] = []
    grafo = construir_grafo(db, usuario_id, recolector, recolector_fichas)
    try:
        resultado = grafo.invoke(
            {"messages": [*historial, HumanMessage(content=pregunta)]},
            {"recursion_limit": MAX_ITERACIONES * 2},
        )
        texto = _extraer_texto(resultado["messages"][-1].content)
    except Exception:
        # Errores transitorios del proveedor (503 por sobrecarga, timeouts):
        # devolvemos un mensaje amable en vez de tirar un 500 al frontend.
        logger.exception("Fallo al generar la respuesta del chat")
        return RespuestaChat(
            respuesta=_ERROR_LLM, conversacion_id=conversacion.id
        )

    # Tools que el agente usó (para el feedback loop): salen de los tool_calls
    # que quedaron en los mensajes del grafo.
    tools_usadas = [
        tc["name"]
        for m in resultado["messages"]
        for tc in (getattr(m, "tool_calls", None) or [])
    ]

    # 3. Fuentes citadas (dedup por documento).
    fuentes = _construir_fuentes(recolector)
    fuentes_json = (
        json.dumps([asdict(f) for f in fuentes], ensure_ascii=False)
        if fuentes
        else None
    )

    # 4. Persistir el turno (pregunta + respuesta con sus fuentes).
    conversacion_repo.agregar_mensaje(
        db, conversacion.id, role="user", contenido=pregunta
    )
    asistente_msg = conversacion_repo.agregar_mensaje(
        db,
        conversacion.id,
        role="assistant",
        contenido=texto,
        fuentes_json=fuentes_json,
        tools_json=json.dumps(tools_usadas, ensure_ascii=False),
    )
    # updated_at no tiene onupdate; la lista del historial ordena por ese campo.
    conversacion.updated_at = datetime.now()
    # autoflush=False: sin flush estos mensajes no se ven en la próxima lectura.
    db.flush()

    return RespuestaChat(
        respuesta=texto,
        fuentes=fuentes,
        conversacion_id=conversacion.id,
        mensaje_id=asistente_msg.id,
        fichas=_dedup_fichas(recolector_fichas),
    )


def responder_stream(
    db: Session,
    pregunta: str,
    *,
    usuario_id: int,
    conversacion_id: int | None = None,
    regenerar: bool = False,
) -> Iterator[str]:
    """Igual que :func:`responder`, pero emite la respuesta en vivo como SSE.

    En vez de esperar a que el agente termine (``grafo.invoke``), consumimos
    ``grafo.stream`` con dos modos a la vez:

    * ``updates`` — un evento por nodo cuando termina. Nos sirve para detectar
      cuándo el agente pide una tool (y emitir un "paso") y para capturar el
      texto final de la respuesta.
    * ``messages`` — los tokens del LLM a medida que se generan. Es lo que hace
      que el texto aparezca de a poco.

    Eventos SSE que emite, en orden:

    * ``inicio`` — ``{conversacion_id}`` apenas se resuelve la conversación, para
      que el frontend actualice la URL sin esperar la respuesta.
    * ``paso``   — ``{tool, label}`` cada vez que el agente decide usar una tool.
    * ``token``  — ``{texto}`` cada fragmento de la respuesta final.
    * ``fin``    — payload completo (respuesta, fuentes, fichas, ids) una vez
      persistido el turno.
    * ``error``  — ``{mensaje, conversacion_id}`` si el proveedor falla.

    A diferencia de :func:`responder`, este generador **hace el commit** él mismo:
    con una ``StreamingResponse`` el endpoint retorna antes de que el cuerpo se
    consuma, así que no podría commitear después.
    """
    conversacion = None
    if conversacion_id is not None:
        conversacion = conversacion_repo.get_conversacion(
            db, conversacion_id, usuario_id
        )
    if conversacion is None:
        conversacion = conversacion_repo.crear_conversacion(
            db, usuario_id, titulo=_titulo_desde(pregunta)
        )
    elif regenerar:
        # Rehacer la última respuesta: descartamos el turno previo antes de
        # reconstruir el historial, así no queda duplicado.
        conversacion_repo.eliminar_ultimo_turno(db, conversacion.id)
    yield _sse("inicio", {"conversacion_id": conversacion.id})

    historial = _historial_langchain(db, conversacion.id)

    recolector: list[RagChunk] = []
    recolector_fichas: list[dict] = []
    grafo = construir_grafo(db, usuario_id, recolector, recolector_fichas)

    # El texto que persistimos sale del modo ``updates`` (el mensaje final del
    # agente, completo y limpio), no de acumular tokens: así evitamos guardar
    # cualquier preámbulo que el modelo escriba antes de pedir una tool.
    texto_final = ""
    # Tools que el agente fue usando (para el feedback loop): lista vacía = no
    # usó ninguna, señal de que no pudo apoyar la respuesta en datos reales.
    tools_usadas: list[str] = []
    try:
        for modo, data in grafo.stream(
            {"messages": [*historial, HumanMessage(content=pregunta)]},
            {"recursion_limit": MAX_ITERACIONES * 2},
            stream_mode=["updates", "messages"],
        ):
            if modo == "messages":
                chunk, meta = data
                # Sólo tokens del nodo del LLM; el nodo de tools no "habla".
                if meta.get("langgraph_node") != "agente":
                    continue
                delta = _extraer_texto(chunk.content)
                if delta:
                    yield _sse("token", {"texto": delta})
            elif modo == "updates":
                payload = data.get("agente")
                if not payload:
                    continue
                msg = payload["messages"][-1]
                tool_calls = getattr(msg, "tool_calls", None)
                if tool_calls:
                    for tc in tool_calls:
                        nombre = tc.get("name", "")
                        tools_usadas.append(nombre)
                        yield _sse(
                            "paso",
                            {
                                "tool": nombre,
                                "label": _PASO_LABELS.get(nombre, _PASO_GENERICO),
                            },
                        )
                else:
                    # Turno del agente sin tools = la respuesta final.
                    texto_final = _extraer_texto(msg.content)
    except Exception:
        logger.exception("Fallo al generar la respuesta del chat (stream)")
        yield _sse(
            "error",
            {"mensaje": _ERROR_LLM, "conversacion_id": conversacion.id},
        )
        return

    fuentes = _construir_fuentes(recolector)
    fuentes_json = (
        json.dumps([asdict(f) for f in fuentes], ensure_ascii=False)
        if fuentes
        else None
    )

    conversacion_repo.agregar_mensaje(
        db, conversacion.id, role="user", contenido=pregunta
    )
    asistente_msg = conversacion_repo.agregar_mensaje(
        db,
        conversacion.id,
        role="assistant",
        contenido=texto_final,
        fuentes_json=fuentes_json,
        tools_json=json.dumps(tools_usadas, ensure_ascii=False),
    )
    conversacion.updated_at = datetime.now()
    # Flush para poblar los ids ANTES del commit: tras el commit las instancias
    # quedan expiradas y leerlas dispararía otra query.
    db.flush()
    conversacion_id_final = conversacion.id
    mensaje_id_final = asistente_msg.id
    db.commit()

    yield _sse(
        "fin",
        {
            "respuesta": texto_final,
            "fuentes": [asdict(f) for f in fuentes],
            "fichas": _dedup_fichas(recolector_fichas),
            "conversacion_id": conversacion_id_final,
            "mensaje_id": mensaje_id_final,
        },
    )


def listar_conversaciones(db: Session, usuario_id: int):
    """Conversaciones del usuario, para el historial de la UI."""
    return conversacion_repo.listar_conversaciones(db, usuario_id)


def get_conversacion(db: Session, conversacion_id: int, usuario_id: int):
    """Una conversación con sus mensajes, si pertenece al usuario."""
    return conversacion_repo.get_conversacion(db, conversacion_id, usuario_id)


def renombrar_conversacion(
    db: Session, conversacion_id: int, usuario_id: int, titulo: str
):
    """Renombra una conversación del usuario. None si no existe/no es suya."""
    return conversacion_repo.renombrar(db, conversacion_id, usuario_id, titulo.strip())


def eliminar_conversacion(db: Session, conversacion_id: int, usuario_id: int) -> bool:
    """Elimina una conversación del usuario. False si no existe/no es suya."""
    return conversacion_repo.eliminar(db, conversacion_id, usuario_id)


def registrar_feedback(
    db: Session,
    *,
    mensaje_id: int,
    usuario_id: int,
    util: bool,
    motivo: str | None = None,
) -> bool:
    """Registra feedback sobre una respuesta. False si el mensaje no es del usuario."""
    fb = conversacion_repo.registrar_feedback(
        db,
        mensaje_id=mensaje_id,
        usuario_id=usuario_id,
        util=util,
        motivo=motivo,
    )
    return fb is not None
