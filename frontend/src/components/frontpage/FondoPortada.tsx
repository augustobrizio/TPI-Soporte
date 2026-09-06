import Image from "next/image";

/**
 * La foto de la facultad, de fondo de TODA la portada.
 *
 * Antes cada bloque traía la suya (el panel de la semana, el índice de
 * secciones, el cierre). El problema no era la foto sino el recorte: como el
 * contenido vive en un contenedor centrado con ancho máximo, cada fondo
 * terminaba siendo un rectángulo con bordes duros a mitad de pantalla, y la
 * portada se leía como bloques pegados en vez de como una página.
 *
 * Acá la foto es una sola, `fixed`, detrás de todo. Al no moverse con el
 * scroll, los bloques pasan por delante de un mismo plano de fondo: eso es lo
 * que los ata entre sí. Y al cubrir el viewport entero no hay borde que
 * delate dónde empieza y dónde termina.
 *
 * Tres capas encima para que el texto se lea sobre cualquier zona de la foto,
 * en los dos temas: la foto ya atenuada, un velo plano del color del canvas y
 * un degradado vertical que la apaga hacia abajo, donde están las tarjetas.
 */
export function FondoPortada({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    // Dos detalles de apilado y encuadre, los dos aprendidos a los golpes:
    //
    // `z-0` y no `-z-10`: el <main> del dashboard pinta su propio fondo
    // (`bg-blueprint`), y un hijo con z-index negativo queda detrás de ese
    // fondo — o sea, invisible. Con z-0 se pinta encima del fondo del padre, y
    // el contenido de la portada va en `z-10`, por delante.
    //
    // `top-16` y `lg:left-[var(--sb-w)]` recortan el fondo al área de
    // contenido: con `inset-0` a secas tapaba la topbar y la sidebar. La
    // variable la define `DashboardMain` en el <main>, así que se hereda, y
    // la transición acompaña a la barra cuando se colapsa.
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 top-16 z-0 lg:left-[var(--sb-w)] lg:transition-[left] lg:duration-200 lg:ease-out"
    >
      <div className="relative h-full w-full opacity-[0.30]">
        <Image src={src} alt="" fill sizes="100vw" priority className="object-cover" />
      </div>

      <div className="absolute inset-0 bg-[var(--shell-canvas)]/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--shell-canvas)]/55 to-[var(--shell-canvas)]" />

      {/* La descripción va acá y no en el `alt`: la imagen es decorativa
          (alt vacío), pero el dato de qué se ve no se pierde para quien use
          lector de pantalla. */}
      <span className="sr-only">{alt}</span>
    </div>
  );
}
