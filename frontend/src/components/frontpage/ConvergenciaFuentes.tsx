"use client";

import { useEffect, useRef, useState } from "react";

import {
  CELESTE,
  DESTINO,
  FUENTES,
  NODO_X,
  R,
  VB_ALTO,
  VB_ANCHO,
  curvaDe,
  yDe,
  type Punto,
} from "@/lib/convergencia";

/**
 * La metáfora de UTNHub en una imagen: la información está desparramada en
 * cuentas de Instagram, en el sitio de la facultad y en Drive, y acá converge
 * en un lugar.
 *
 * Los trazos se pueden empujar con el cursor: cada curva dobla hacia el mouse
 * con una caída por distancia. Los extremos NO se mueven — quedan clavados al
 * nodo de origen y al de llegada — así que se puede jugar sin que el grafo se
 * desarme.
 *
 * Detalles que no son obvios:
 *
 * - Las posiciones salen de un cálculo por índice, no escritas a mano. Sumar
 *   una fuente es agregar una línea a `FUENTES`: el alto del viewBox, el
 *   centro del grafo y todas las curvas se reacomodan solos.
 * - Los puntos que viajan usan `offset-path` con el MISMO string que dibuja la
 *   línea, así la trayectoria y el trazo no se pueden desincronizar ni
 *   mientras se dobla con el cursor.
 * - Sin cursor fino (celulares) o con `prefers-reduced-motion` no se engancha
 *   el listener: queda la composición quieta.
 */

const CSS = `
.cv-linea {
  stroke-dasharray: 5 7;
  animation: cv-ants 1.6s linear infinite;
}
@keyframes cv-ants { to { stroke-dashoffset: -12; } }

.cv-punto {
  offset-rotate: 0deg;
  animation: cv-viaje 3.4s cubic-bezier(.4, 0, .5, 1) infinite;
}
@keyframes cv-viaje {
  0%   { offset-distance: 0%;   opacity: 0; }
  12%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

/* El nodo central late apenas, para que se lea como el punto de llegada. */
.cv-destino { transform-box: fill-box; transform-origin: center; animation: cv-latido 3.4s ease-in-out infinite; }
@keyframes cv-latido { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }

/* Los nombres se ocultan en pantallas chicas: el SVG escala completo, asi que
   a 340px de ancho quedarian en ~8px, ilegibles y sucios. */
.cv-label { display: none; }
@media (min-width: 640px) { .cv-label { display: block; } }

@media (prefers-reduced-motion: reduce) {
  .cv-linea, .cv-punto, .cv-destino { animation: none; }
  .cv-punto { opacity: .85; }
}
`;

/**
 * Cursor en coordenadas del viewBox, o `null` si no corresponde reaccionar.
 *
 * Escucha en `window` y no en el SVG: la gracia es poder empujar los trazos
 * moviendo el mouse por la página, no solo por arriba del dibujo.
 */
function useCursorEnSvg(ref: React.RefObject<SVGSVGElement | null>) {
  const [cursor, setCursor] = useState<Punto | null>(null);

  useEffect(() => {
    const corresponde =
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!corresponde) return;

    let pendiente: { x: number; y: number } | null = null;
    let frame = 0;

    const procesar = () => {
      frame = 0;
      const svg = ref.current;
      if (!svg || !pendiente) return;
      const caja = svg.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) return;
      setCursor({
        x: ((pendiente.x - caja.left) / caja.width) * VB_ANCHO,
        y: ((pendiente.y - caja.top) / caja.height) * VB_ALTO,
      });
    };

    // rAF como throttle: mousemove dispara muchas veces por frame y no tiene
    // sentido recalcular todas las curvas para cada evento.
    const alMover = (e: MouseEvent) => {
      pendiente = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(procesar);
    };
    const alSalir = () => setCursor(null);

    window.addEventListener("mousemove", alMover, { passive: true });
    document.addEventListener("mouseleave", alSalir);
    return () => {
      window.removeEventListener("mousemove", alMover);
      document.removeEventListener("mouseleave", alSalir);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);

  return cursor;
}

export function ConvergenciaFuentes({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cursor = useCursorEnSvg(svgRef);

  const curvas = FUENTES.map((_, i) => curvaDe(i, cursor));
  const N = FUENTES.length;

  return (
    <div className={className}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_ANCHO} ${VB_ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label="Las publicaciones de los centros de estudiantes, el sitio de la facultad y el material en Drive convergen en UTNHub"
      >
        <defs>
          {FUENTES.map((f, i) => (
            <clipPath key={f.id} id={`cv-clip-${f.id}`}>
              <circle cx={NODO_X} cy={yDe(i)} r={R} />
            </clipPath>
          ))}
        </defs>

        {/* Líneas primero: quedan por debajo de los nodos */}
        {FUENTES.map((f, i) => (
          <path
            key={f.id}
            d={curvas[i]}
            fill="none"
            stroke="var(--shell-border)"
            strokeWidth={1.5}
            className="cv-linea"
          />
        ))}

        {FUENTES.map((f, i) => (
          <circle
            key={f.id}
            r={3.5}
            fill={CELESTE}
            className="cv-punto"
            style={{
              offsetPath: `path("${curvas[i]}")`,
              animationDelay: `${((i * 3.4) / N).toFixed(2)}s`,
            }}
          />
        ))}

        {FUENTES.map((f, i) => {
          const y = yDe(i);
          return (
            <g key={f.id}>
              {/* Nombre a la izquierda, alineado a derecha contra el logo: sin
                  esto son circulitos que no se sabe que son. */}
              <text
                x={NODO_X - R - 14}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="cv-label font-body"
                fontSize={15}
                fill="var(--shell-fg-muted)"
              >
                {f.nombre}
              </text>

              {f.fondo && <circle cx={NODO_X} cy={y} r={R} fill={f.fondo} />}
              {f.contain ? (
                // Sin recorte: la marca entra completa, con aire alrededor.
                <image
                  href={f.logo}
                  x={NODO_X - R * 0.55}
                  y={y - R * 0.55}
                  width={R * 1.1}
                  height={R * 1.1}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                <image
                  href={f.logo}
                  x={NODO_X - R}
                  y={y - R}
                  width={R * 2}
                  height={R * 2}
                  clipPath={`url(#cv-clip-${f.id})`}
                  preserveAspectRatio="xMidYMid slice"
                  opacity={f.fondo ? 0.95 : 1}
                />
              )}
              <circle
                cx={NODO_X}
                cy={y}
                r={R}
                fill="none"
                stroke="var(--shell-border)"
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* Nodo de llegada */}
        <text
          x={DESTINO.x}
          y={DESTINO.y - DESTINO.lado / 2 - 18}
          textAnchor="middle"
          className="cv-label font-headline"
          fontSize={18}
          fontWeight={700}
          fill="var(--shell-fg)"
        >
          UTNHub
        </text>
        <g className="cv-destino">
          <rect
            x={DESTINO.x - DESTINO.lado / 2}
            y={DESTINO.y - DESTINO.lado / 2}
            width={DESTINO.lado}
            height={DESTINO.lado}
            rx={22}
            fill={CELESTE}
          />
          <image
            href="/utn-simbolo-white.png"
            x={DESTINO.x - 21}
            y={DESTINO.y - 24}
            width={42}
            height={48}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  );
}
