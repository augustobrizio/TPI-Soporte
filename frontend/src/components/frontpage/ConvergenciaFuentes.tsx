/**
 * La metáfora de UTNHub en una imagen: la información está desparramada en
 * cuentas de Instagram y en el sitio de la facultad, y acá converge en un
 * lugar.
 *
 * Técnica: las líneas son `<path>` con `stroke-dasharray` (marching ants) y
 * los puntos que viajan usan `offset-path` con el MISMO string de path, así
 * la trayectoria del punto y la línea dibujada no se pueden desincronizar.
 * Por eso los paths viven en `FUENTES` y no hardcodeados en el CSS.
 *
 * Todo el movimiento se apaga con `prefers-reduced-motion`: queda la misma
 * composición, quieta.
 */

const CELESTE = "#1CA4DF";

/** Nodo central del grafo, en coordenadas del viewBox. */
const DESTINO = { x: 500, y: 240 };

interface Fuente {
  id: string;
  nombre: string;
  /** Logo en `public/`. El del sitio de la facultad es el isotipo UTN. */
  logo: string;
  /**
   * Relleno del círculo detrás del logo. El isotipo UTN es blanco y sin esto
   * desaparece en tema claro; el de Drive es transparente y necesita piso.
   */
  fondo?: string;
  /**
   * `true` = el logo entra completo y centrado (marcas con aire propio, como
   * Drive). Por defecto las fotos de perfil llenan el círculo recortadas.
   */
  contain?: boolean;
  x: number;
  y: number;
  /** Curva hasta el nodo central. Sirve de línea y de riel del punto. */
  d: string;
  /** Desfase para que los puntos no salgan todos juntos. */
  delay: string;
}

/** Radio de los nodos de origen. */
const R = 26;

/**
 * Las fuentes van alineadas en una sola columna, con separacion de 80 sobre
 * nodos de r=26: quedan 28px de aire entre circulo y circulo. La primera
 * version las tenia a 60 y se leian apiladas; desparramarlas en constelacion
 * arreglaba el aire pero se veian desordenadas, una encima de la otra. Una
 * sola vertical prolija y bien espaciada es lo que deja que se lea la
 * convergencia sin ruido.
 *
 * El nombre va a la izquierda del logo, alineado a derecha contra el: es el
 * lado libre, porque las curvas salen todas hacia la derecha.
 */
const FUENTES: readonly Fuente[] = [
  {
    id: "gradienteutn",
    nombre: "Gradiente UTN",
    logo: "/novedades/fuentes/gradienteutn.jpg",
    x: 190,
    y: 40,
    d: "M 216 40 C 320 40, 380 140, 456 232",
    delay: "0s",
  },
  {
    id: "puebloyreforma",
    nombre: "Pueblo y Reforma",
    logo: "/novedades/fuentes/puebloyreforma.jpg",
    x: 190,
    y: 120,
    d: "M 216 120 C 320 120, 390 180, 456 236",
    delay: "0.57s",
  },
  {
    id: "utnfrro",
    nombre: "Sitio UTN FRRO",
    logo: "/utn-isotipo-white.png",
    fondo: CELESTE,
    x: 190,
    y: 200,
    d: "M 216 200 C 330 200, 390 220, 456 239",
    delay: "1.13s",
  },
  {
    id: "sauutnrosario",
    nombre: "SAU UTN Rosario",
    logo: "/novedades/fuentes/sauutnrosario.jpg",
    x: 190,
    y: 280,
    d: "M 216 280 C 330 280, 390 260, 456 241",
    delay: "1.7s",
  },
  {
    id: "utnalumnosfrro",
    nombre: "UTN Alumnos FRRO",
    logo: "/novedades/fuentes/utnalumnosfrro.jpg",
    x: 190,
    y: 360,
    d: "M 216 360 C 320 360, 390 300, 456 244",
    delay: "2.27s",
  },
  {
    // El material de estudio se sirve desde una carpeta de Drive: es una
    // fuente mas del hub, aunque no publique novedades.
    id: "drive",
    nombre: "Material en Drive",
    logo: "/novedades/fuentes/google-drive.svg",
    fondo: "#ffffff",
    contain: true,
    x: 190,
    y: 440,
    d: "M 216 440 C 320 440, 380 340, 456 248",
    delay: "2.83s",
  },
] as const;

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

export function ConvergenciaFuentes({ className }: { className?: string }) {
  return (
    <div className={className}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg
        viewBox="0 0 640 480"
        className="h-auto w-full"
        role="img"
        aria-label="Las publicaciones de los centros de estudiantes y del sitio de la facultad convergen en UTNHub"
      >
        <defs>
          {FUENTES.map((f) => (
            <clipPath key={f.id} id={`cv-clip-${f.id}`}>
              <circle cx={f.x} cy={f.y} r={R} />
            </clipPath>
          ))}
        </defs>

        {/* Líneas primero: quedan por debajo de los nodos */}
        {FUENTES.map((f) => (
          <path
            key={f.id}
            d={f.d}
            fill="none"
            stroke="var(--shell-border)"
            strokeWidth={1.5}
            className="cv-linea"
          />
        ))}

        {FUENTES.map((f) => (
          <circle
            key={f.id}
            r={3.5}
            fill={CELESTE}
            className="cv-punto"
            style={{ offsetPath: `path("${f.d}")`, animationDelay: f.delay }}
          />
        ))}

        {FUENTES.map((f) => (
          <g key={f.id}>
            {/* Nombre a la izquierda, alineado a derecha contra el logo: sin
                esto son seis circulitos que no se sabe que son. */}
            <text
              x={f.x - R - 14}
              y={f.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="cv-label font-body"
              fontSize={15}
              fill="var(--shell-fg-muted)"
            >
              {f.nombre}
            </text>

            {f.fondo && <circle cx={f.x} cy={f.y} r={R} fill={f.fondo} />}
            {f.contain ? (
              // Sin recorte: la marca entra completa, con aire alrededor.
              <image
                href={f.logo}
                x={f.x - R * 0.55}
                y={f.y - R * 0.55}
                width={R * 1.1}
                height={R * 1.1}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : (
              <image
                href={f.logo}
                x={f.x - R}
                y={f.y - R}
                width={R * 2}
                height={R * 2}
                clipPath={`url(#cv-clip-${f.id})`}
                preserveAspectRatio="xMidYMid slice"
                opacity={f.fondo ? 0.95 : 1}
              />
            )}
            <circle
              cx={f.x}
              cy={f.y}
              r={R}
              fill="none"
              stroke="var(--shell-border)"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* Nodo de llegada */}
        <text
          x={DESTINO.x}
          y={DESTINO.y - 62}
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
            x={DESTINO.x - 44}
            y={DESTINO.y - 44}
            width={88}
            height={88}
            rx={22}
            fill={CELESTE}
          />
          <image
            href="/utn-simbolo-white.png"
            x={DESTINO.x - 24}
            y={DESTINO.y - 24}
            width={48}
            height={48}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  );
}
