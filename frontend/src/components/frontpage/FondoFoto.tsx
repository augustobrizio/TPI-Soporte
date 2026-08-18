import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Envuelve una sección y le pone una foto de la facultad DE FONDO.
 *
 * No es una galería: la foto no se mira, se habita. Va detrás del contenido,
 * a sangre completa (rompe el ancho del contenedor con márgenes negativos),
 * atenuada y con dos velos encima para que el texto se siga leyendo sobre
 * cualquier zona de la imagen:
 *
 * - Un velo plano del color del canvas, que baja el contraste general.
 * - Un degradado vertical que funde los bordes de arriba y de abajo con la
 *   página, así la foto no aparece como un recuadro pegado sino como algo que
 *   asoma por detrás.
 *
 * La foto entra con el scroll y hace paralaje (ver `.fondo-paralaje` en
 * globals.css). Todo el movimiento está detrás de `prefers-reduced-motion` y
 * de `@supports`.
 */
export function FondoFoto({
  src,
  alt,
  children,
  /** 0 a 1. Cuánto se deja ver la foto detrás del contenido. */
  intensidad = 0.28,
  /**
   * `true` = la foto rompe el ancho del contenedor y llega a los bordes de la
   * pantalla. `false` = queda contenida, para bloques que son una tarjeta con
   * borde redondeado: a sangre se le escaparía por fuera de las esquinas.
   */
  aSangre = true,
  className,
}: {
  src: string;
  alt: string;
  children: ReactNode;
  intensidad?: number;
  aSangre?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`relative isolate ${aSangre ? "" : "overflow-hidden"} ${className ?? ""}`}
    >
      {/* A sangre: los márgenes negativos compensan el padding del contenedor
          de la portada, para que la foto llegue a los bordes de la pantalla. */}
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-y-0 -z-10 overflow-hidden",
          aSangre ? "-left-6 -right-6 md:-left-10 md:-right-10" : "inset-x-0",
        ].join(" ")}
      >
        <div className="relative h-full w-full" style={{ opacity: intensidad }}>
          <Image
            src={src}
            alt=""
            fill
            sizes="100vw"
            className="fondo-paralaje object-cover"
          />
        </div>

        {/* Velo plano + fundido de bordes contra el canvas de la página. */}
        <div className="absolute inset-0 bg-[var(--shell-canvas)]/45" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--shell-canvas)] via-transparent to-[var(--shell-canvas)]" />
      </div>

      {/* La descripción de la foto va acá y no en el `alt` de la imagen: la
          imagen es decorativa (alt vacío), pero el dato de qué se ve no se
          pierde para quien use lector de pantalla. */}
      <span className="sr-only">{alt}</span>

      {children}
    </section>
  );
}
