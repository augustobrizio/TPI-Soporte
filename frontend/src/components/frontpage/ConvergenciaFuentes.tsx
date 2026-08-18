"use client";

import { useEffect, useRef, useState } from "react";

import {
  CELESTE,
  DESTINO,
  FUENTES,
  R,
  VB_ALTO,
  VB_ANCHO,
  centroDe,
  corrimientoTotal,
  curvaDe,
  derivaDe,
  type Corrimiento,
  type Punto,
} from "@/lib/convergencia";

/**
 * La metáfora de UTNHub en una imagen: la información está desparramada en
 * cuentas de Instagram, en el sitio de la facultad, en SysAcad y en Drive, y
 * acá converge en un lugar.
 *
 * Se puede jugar de dos maneras:
 *
 * - **Arrastrar las fuentes.** Cada nodo se agarra y se suelta donde sea; su
 *   curva lo sigue, porque nace del borde del círculo mirando al hub. El
 *   arrastre queda acotado al viewBox, así no se pierde un nodo afuera del
 *   dibujo.
 * - **Empujar los trazos.** Las curvas doblan hacia el mouse con una caída por
 *   distancia. Los extremos no se despegan de sus nodos.
 *
 * Detalles que no son obvios:
 *
 * - Los puntos que viajan usan `offset-path` con el MISMO string que dibuja la
 *   línea, así la trayectoria y el trazo no se pueden desincronizar ni
 *   mientras se arrastra.
 * - El delta del arrastre se convierte de píxeles a unidades del viewBox: sin
 *   eso el nodo se movería más lento o más rápido que el puntero según el
 *   tamaño en pantalla.
 * - `prefers-reduced-motion` apaga el seguimiento del cursor, pero NO el
 *   arrastre: mover algo a propósito no es movimiento no solicitado.
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

/* Agarrable: sin esto no hay ninguna pista de que el nodo se puede mover.
   touch-action none evita que el navegador se quede con el gesto y scrollee
   la pagina en vez de arrastrar. */
.cv-nodo { cursor: grab; touch-action: none; }
.cv-nodo:active { cursor: grabbing; }

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

/**
 * Reloj para la deriva.
 *
 * Se apaga cuando no corresponde animar: con `prefers-reduced-motion`, con la
 * pestaña en segundo plano, o con el dibujo fuera de la pantalla. Un rAF
 * eterno recalculando curvas mientras el usuario lee otra sección es gastar
 * batería a cambio de nada que nadie está viendo.
 */
function useRelojDeriva(ref: React.RefObject<SVGSVGElement | null>) {
  const [t, setT] = useState<number | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const svg = ref.current;
    if (!svg) return;

    let frame = 0;

    // La visibilidad se calcula en el momento y no se guarda en una bandera.
    // El IntersectionObserver, cuando la pagina carga en una pestana de fondo,
    // reporta "no visible" y esa bandera quedaba pegada: al volver a la
    // pestana el reloj no arrancaba nunca. El observer queda solo como
    // disparador para re-evaluar al scrollear.
    const enPantalla = () => {
      const svg = ref.current;
      if (!svg) return false;
      const caja = svg.getBoundingClientRect();
      return caja.bottom > 0 && caja.top < window.innerHeight;
    };

    const correspondeAnimar = () =>
      enPantalla() && document.visibilityState === "visible";

    const paso = (ahora: number) => {
      setT(ahora);
      frame = requestAnimationFrame(paso);
    };
    const arrancar = () => {
      if (!frame && correspondeAnimar()) frame = requestAnimationFrame(paso);
    };
    const parar = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const reevaluar = () => (correspondeAnimar() ? arrancar() : parar());

    const observador = new IntersectionObserver(reevaluar, { threshold: 0 });
    observador.observe(svg);
    document.addEventListener("visibilitychange", reevaluar);

    arrancar();
    return () => {
      parar();
      observador.disconnect();
      document.removeEventListener("visibilitychange", reevaluar);
    };
  }, [ref]);

  return t;
}

export function ConvergenciaFuentes({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const cursor = useCursorEnSvg(svgRef);
  const t = useRelojDeriva(svgRef);

  const [corrimientos, setCorrimientos] = useState<Record<string, Corrimiento>>(
    {},
  );
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const arrastre = useRef<{
    id: string;
    x0: number;
    y0: number;
    base: Corrimiento;
  } | null>(null);

  // El nodo que se está arrastrando no deriva: tiene que ir pegado al puntero
  // y no temblar debajo del dedo.
  const corrimientoDe = (id: string, i: number) =>
    corrimientoTotal(
      corrimientos[id],
      t === null || id === arrastrandoId ? null : derivaDe(i, t),
    );

  const curvas = FUENTES.map((f, i) => curvaDe(i, cursor, corrimientoDe(f.id, i)));
  const N = FUENTES.length;

  const empezarArrastre =
    (id: string) => (e: React.PointerEvent<SVGGElement>) => {
      e.preventDefault();
      // La captura hace que los movimientos sigan llegando a este nodo aunque
      // el puntero se salga del círculo: sin esto el arrastre se corta apenas
      // el mouse va más rápido que el render.
      e.currentTarget.setPointerCapture(e.pointerId);
      setArrastrandoId(id);
      arrastre.current = {
        id,
        x0: e.clientX,
        y0: e.clientY,
        // Base sin deriva: si guardara la posición derivada, al soltar y
        // volver a agarrar el nodo pegaría un salto del tamaño del vaivén.
        base: corrimientos[id] ?? { dx: 0, dy: 0 },
      };
    };

  const moverArrastre = (e: React.PointerEvent<SVGGElement>) => {
    const a = arrastre.current;
    const svg = svgRef.current;
    if (!a || !svg) return;
    const caja = svg.getBoundingClientRect();
    if (caja.width === 0 || caja.height === 0) return;

    // Píxeles de pantalla → unidades del viewBox.
    const kx = VB_ANCHO / caja.width;
    const ky = VB_ALTO / caja.height;
    setCorrimientos((previo) => ({
      ...previo,
      [a.id]: {
        dx: a.base.dx + (e.clientX - a.x0) * kx,
        dy: a.base.dy + (e.clientY - a.y0) * ky,
      },
    }));
  };

  const terminarArrastre = (e: React.PointerEvent<SVGGElement>) => {
    if (arrastre.current) e.currentTarget.releasePointerCapture(e.pointerId);
    arrastre.current = null;
    setArrastrandoId(null);
  };

  return (
    <div className={className}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_ANCHO} ${VB_ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label="Las publicaciones de los centros de estudiantes, el sitio de la facultad, SysAcad y el material en Drive convergen en UTNHub"
      >
        <defs>
          {FUENTES.map((f, i) => {
            const c = centroDe(i, corrimientoDe(f.id, i));
            return (
              <clipPath key={f.id} id={`cv-clip-${f.id}`}>
                <circle cx={c.x} cy={c.y} r={R} />
              </clipPath>
            );
          })}
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
          const c = centroDe(i, corrimientoDe(f.id, i));
          return (
            <g
              key={f.id}
              className="cv-nodo"
              onPointerDown={empezarArrastre(f.id)}
              onPointerMove={moverArrastre}
              onPointerUp={terminarArrastre}
              onPointerCancel={terminarArrastre}
            >
              {/* Nombre a la izquierda, alineado a derecha contra el logo: sin
                  esto son circulitos que no se sabe que son. */}
              <text
                x={c.x - R - 14}
                y={c.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="cv-label font-body"
                fontSize={15}
                fill="var(--shell-fg-muted)"
              >
                {f.nombre}
              </text>

              {f.fondo && <circle cx={c.x} cy={c.y} r={R} fill={f.fondo} />}
              {f.contain ? (
                // Sin recorte: la marca entra completa, con aire alrededor.
                <image
                  href={f.logo}
                  x={c.x - R * 0.62}
                  y={c.y - R * 0.62}
                  width={R * 1.24}
                  height={R * 1.24}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                <image
                  href={f.logo}
                  x={c.x - R}
                  y={c.y - R}
                  width={R * 2}
                  height={R * 2}
                  clipPath={`url(#cv-clip-${f.id})`}
                  preserveAspectRatio="xMidYMid slice"
                  opacity={f.fondo ? 0.95 : 1}
                />
              )}
              <circle
                cx={c.x}
                cy={c.y}
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
