/**
 * Marca de UTNHub.
 *
 * Se reconstruyo como SVG en vez de usar el archivo generado por la IA. Ese
 * archivo era un JPG: la transparencia era falsa (el damero venia pintado
 * como cuadraditos grises), pesaba 1,78 MB a 2048px, el isotipo estaba
 * recortado en vez de blanco, y el wordmark casi negro desaparecia en tema
 * oscuro. En vector pesa unos pocos KB, es nitido desde 16px hasta el hero, y
 * el texto toma el color del tema.
 *
 * Dos variantes a proposito:
 * - Sin lineas (default) para lugares chicos: abajo de ~64px los trazos que
 *   convergen quedan en menos de un pixel y solo ensucian.
 * - Con lineas para el logo grande, donde se lee la metafora de las fuentes
 *   que confluyen — la misma que cuenta la animacion de la portada.
 */

import {
  CELESTE,
  CUADRADO,
  LINEAS,
  VIEWBOX_CON_LINEAS,
  VIEWBOX_SOLO_MARCA,
} from "@/lib/marca";

export function LogoUTNHub({
  /** Lado del cuadrado en px. El SVG crece solo si lleva lineas. */
  size = 36,
  conLineas = false,
  className,
}: {
  size?: number;
  conLineas?: boolean;
  className?: string;
}) {
  // Sin lineas el viewBox es solo el cuadrado; con lineas se estira a la
  // izquierda para darles lugar sin deformar la marca.
  const viewBox = conLineas ? VIEWBOX_CON_LINEAS : VIEWBOX_SOLO_MARCA;
  const ancho = conLineas ? (size * 128) / 64 : size;
  const alto = conLineas ? (size * 96) / 64 : size;

  return (
    <svg
      viewBox={viewBox}
      width={ancho}
      height={alto}
      className={className}
      role="img"
      aria-label="UTNHub"
    >
      {conLineas &&
        LINEAS.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={CELESTE}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

      <rect
        x={CUADRADO.x}
        y={CUADRADO.y}
        width={CUADRADO.lado}
        height={CUADRADO.lado}
        rx={CUADRADO.radio}
        fill={CELESTE}
      />

      {/* El isotipo va como imagen: es la marca real de la universidad, no una
          version dibujada a mano que se le parezca. */}
      <image
        href="/utn-simbolo-white.png"
        x={64 + 12}
        y={16 + 12}
        width={40}
        height={40}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}

/** Marca + wordmark. El texto toma el color del tema, por eso no es imagen. */
export function LogoUTNHubCompleto({
  size = 40,
  conLineas = false,
  className,
}: {
  size?: number;
  conLineas?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <LogoUTNHub size={size} conLineas={conLineas} />
      <div className="leading-none">
        <p
          className="font-headline font-extrabold tracking-tight text-[var(--shell-fg)]"
          style={{ fontSize: size * 0.42 }}
        >
          UTNHub
        </p>
        <p
          className="mt-1 font-label uppercase tracking-[0.14em] text-[var(--shell-fg-dim)]"
          style={{ fontSize: size * 0.24 }}
        >
          ISI · UTN FRRO
        </p>
      </div>
    </div>
  );
}
