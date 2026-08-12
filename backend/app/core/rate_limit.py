"""Limitador de intentos en memoria, para frenar fuerza bruta en el login.

**Alcance:** el estado vive en el proceso. Con varias réplicas de Cloud Run
cada una lleva su propia cuenta, así que el límite efectivo se multiplica por
la cantidad de instancias. Alcanza para frenar un script casero contra la
demo; para algo serio va un store compartido (Redis) o el rate limiting del
borde (Cloud Armor). Se deja acá explícito para que nadie lo confunda con
una defensa robusta.
"""
from __future__ import annotations

import time
from collections import defaultdict


class LimitadorIntentos:
    """Ventana deslizante: N intentos cada ``ventana_seg`` por clave."""

    def __init__(self, *, max_intentos: int, ventana_seg: int) -> None:
        self.max_intentos = max_intentos
        self.ventana_seg = ventana_seg
        self._intentos: dict[str, list[float]] = defaultdict(list)

    def _vigentes(self, clave: str, ahora: float) -> list[float]:
        corte = ahora - self.ventana_seg
        vigentes = [t for t in self._intentos[clave] if t > corte]
        self._intentos[clave] = vigentes
        return vigentes

    def permitido(self, clave: str) -> bool:
        """¿Se puede intentar? No registra el intento."""
        return len(self._vigentes(clave, time.monotonic())) < self.max_intentos

    def registrar_fallo(self, clave: str) -> None:
        """Suma un intento fallido. Los exitosos no cuentan."""
        self._intentos[clave].append(time.monotonic())

    def limpiar(self, clave: str) -> None:
        """Borra el historial (se llama tras un login exitoso)."""
        self._intentos.pop(clave, None)


# 10 fallos cada 5 minutos por (IP, email). Deja lugar a que alguien se
# equivoque varias veces sin quedar afuera, pero corta un diccionario.
limitador_login = LimitadorIntentos(max_intentos=10, ventana_seg=300)
