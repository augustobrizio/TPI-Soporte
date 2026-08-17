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
const DESTINO = { x: 510, y: 210 };

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
const R = 28;

/**
 * Las fuentes van desparramadas a proposito: en columna se leian como una
 * lista ordenada, y lo que hay que contar es lo contrario — la informacion
 * hoy esta dispersa y recien acá converge. Por eso las `x` no se repiten y
 * las `y` estan desfasadas entre las dos agrupaciones.
 *
 * Las etiquetas van DEBAJO del logo (no al costado) justamente para poder
 * moverlos en horizontal sin que el texto de uno pise el nodo del otro.
 */
const FUENTES: readonly Fuente[] = [
  {
    id: "gradienteutn",
    nombre: "Gradiente UTN",
    logo: "/novedades/fuentes/gradienteutn.jpg",
    x: 70,
    y: 70,
    d: "M 98 70 C 240 70, 360 140, 468 205",
    delay: "0s",
  },
  {
    id: "puebloyreforma",
    nombre: "Pueblo y Reforma",
    logo: "/novedades/fuentes/puebloyreforma.jpg",
    x: 245,
    y: 45,
    d: "M 273 45 C 360 45, 400 130, 468 200",
    delay: "0.57s",
  },
  {
    id: "utnfrro",
    nombre: "Sitio UTN FRRO",
    logo: "/utn-isotipo-white.png",
    fondo: CELESTE,
    x: 60,
    y: 210,
    d: "M 88 210 C 220 210, 340 205, 468 210",
    delay: "1.13s",
  },
  {
    id: "sauutnrosario",
    nombre: "SAU UTN Rosario",
    logo: "/novedades/fuentes/sauutnrosario.jpg",
    x: 235,
    y: 190,
    d: "M 263 190 C 340 190, 400 200, 468 208",
    delay: "1.7s",
  },
  {
    id: "utnalumnosfrro",
    nombre: "UTN Alumnos FRRO",
    logo: "/novedades/fuentes/utnalumnosfrro.jpg",
    x: 70,
    y: 350,
    d: "M 98 350 C 240 350, 360 280, 468 215",
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
    x: 245,
    y: 335,
    d: "M 273 335 C 360 335, 400 260, 468 212",
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
        viewBox="0 0 640 420"
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
            {/* Nombre centrado debajo del logo: sin esto son seis circulitos
                que no se sabe que son. */}
            <text
              x={f.x}
              y={f.y + R + 20}
              textAnchor="middle"
              className="cv-label font-body"
              fontSize={16}
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
            href="/utn-isotipo-white.png"
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
