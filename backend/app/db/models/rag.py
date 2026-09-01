"""Modelo del corpus RAG: fragmentos de texto con su embedding.

El chatbot no busca en los PDFs/web crudos: busca en esta tabla, donde cada
fila es un *fragmento* (chunk) de una fuente junto a su vector. La búsqueda
por significado es un "traeme los vectores más cercanos a la pregunta", que
Postgres resuelve con la extensión ``pgvector`` (operador ``<=>``).

Tabla: ``rag_chunk``.
"""
from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Dimensión del vector. Está atada al modelo de embeddings:
# Gemini text-embedding-004 produce vectores de 768 números. Si se cambia de
# modelo, cambia este número Y hay que re-embeber todo el corpus, porque
# vectores de otro modelo viven en "otro mapa" y las distancias dejan de tener
# sentido. Por eso es una constante explícita y no un número suelto en la columna.
EMBEDDING_DIM = 768


class RagChunk(Base):
    """Un fragmento de una fuente, listo para búsqueda por significado."""

    __tablename__ = "rag_chunk"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # El texto del fragmento. Es lo que el retriever devuelve y lo que se le
    # pega al prompt del LLM como contexto (RNF-12: respuestas fundamentadas).
    contenido: Mapped[str] = mapped_column(Text, nullable=False)

    # El embedding del contenido. Se calcula ANTES de insertar (por eso no es
    # nullable): sin vector, la fila no serviría para buscar.
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)

    # --- Metadatos para poder citar la fuente ---
    # De dónde salió el fragmento (ej. "utn_web", "pdf", "instagram"). Indexado
    # para poder filtrar/depurar por fuente.
    fuente: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    # URL o identificador de la fuente original, para que el chatbot pueda
    # linkear "según X...". Nullable: no toda fuente tiene URL.
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Título legible de la fuente (ej. el nombre del PDF o de la página).
    titulo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Fecha de la última actualización de la fuente original. La completa la
    # ingesta; sirve para avisar si la info puede estar desactualizada (RNF).
    fecha_actualizacion: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    # Posición del fragmento dentro de su documento original (0, 1, 2, ...).
    # Sirve para reconstruir orden y para depurar el chunking.
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        preview = (self.contenido or "")[:40]
        return f"<RagChunk id={self.id} fuente={self.fuente} {preview!r}...>"
