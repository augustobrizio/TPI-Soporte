"""Chunker: parte un texto largo en fragmentos listos para embeber.

¿Por qué cortar? Dos razones:

1. Precisión de búsqueda. Un PDF entero como un solo vector mezcla todos sus
   temas; ese "significado promedio" no matchea bien ninguna pregunta puntual.
   Fragmentos chicos y enfocados = recuperación más precisa.
2. Contexto acotado. Al LLM le pegamos solo los fragmentos relevantes, no
   documentos enteros.

Estrategia: ventana deslizante por caracteres con SOLAPAMIENTO. El solape hace
que la última parte de un fragmento reaparezca al principio del siguiente, así
una idea no queda partida al medio justo en el borde entre dos fragmentos.
"""
from __future__ import annotations

# Tamaños en caracteres (no tokens: más simple y predecible para empezar).
# ~1000 chars ≈ 2-3 párrafos: suficiente contexto sin diluir el significado.
CHUNK_MAX_CHARS = 1000
CHUNK_OVERLAP_CHARS = 150


def _mejor_corte(texto: str, inicio: int, fin: int) -> int:
    """Punto de corte "lindo" cerca de `fin`, para no partir palabras/oraciones.

    Preferimos cortar al final de una oración; si no hay, en un espacio; si
    tampoco (texto sin espacios, raro), cortamos duro en `fin`.
    """
    ventana = texto[inicio:fin]
    minimo = len(ventana) // 2  # el corte no puede caer en la primera mitad

    corte_oracion = ventana.rfind(". ")
    if corte_oracion >= minimo:
        return inicio + corte_oracion + 1  # +1 para incluir el punto

    corte_espacio = ventana.rfind(" ")
    if corte_espacio >= minimo:
        return inicio + corte_espacio

    return fin


def chunk_text(
    texto: str,
    max_chars: int = CHUNK_MAX_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
) -> list[str]:
    """Parte `texto` en fragmentos de hasta `max_chars`, con `overlap` de solape."""
    texto = " ".join(texto.split())  # normaliza espacios y saltos de línea
    if not texto:
        return []
    if len(texto) <= max_chars:
        return [texto]

    fragmentos: list[str] = []
    inicio = 0
    n = len(texto)
    while inicio < n:
        fin = min(inicio + max_chars, n)
        if fin < n:
            fin = _mejor_corte(texto, inicio, fin)
        fragmento = texto[inicio:fin].strip()
        if fragmento:
            fragmentos.append(fragmento)
        if fin >= n:
            break
        # el próximo fragmento arranca `overlap` chars antes del corte.
        # el max(..., inicio + 1) garantiza que siempre avanzamos.
        inicio = max(fin - overlap, inicio + 1)
    return fragmentos
