import Image from "next/image";

/**
 * Tira de fotos de la facultad, que aparecen a medida que se baja.
 *
 * Usa **animaciones de scroll nativas de CSS** (`animation-timeline: view()`):
 * el progreso lo maneja el navegador contra la posición del elemento en el
 * scrollport, sin JavaScript y sobre el hilo del compositor, así que va tan
 * suave como el scroll. Reemplaza al clásico IntersectionObserver + clase.
 *
 * Dos cuidados que hacen la diferencia:
 *
 * - El estado inicial (invisible, corrido) vive DENTRO de
 *   `@supports (animation-timeline: view())`. Si se declarara afuera, un
 *   navegador sin soporte se quedaría con las fotos en `opacity: 0` para
 *   siempre. Así, sin soporte simplemente se ven fijas.
 * - Todo el bloque está además detrás de `prefers-reduced-motion:
 *   no-preference`.
 *
 * Solo se animan `opacity` y `transform`, que no disparan layout.
 */

interface Foto {
  src: string;
  alto: number;
  ancho: number;
  /** Lo que se ve, para el alt. */
  alt: string;
  epigrafe: string;
}

const FOTOS: readonly Foto[] = [
  {
    src: "/novedades/placeholder/utn-frro-generica.jpg",
    ancho: 713,
    alto: 430,
    alt: "Frente de la Facultad Regional Rosario sobre la calle, con la fachada azul y el isotipo de la UTN",
    epigrafe: "El frente, sobre Zeballos",
  },
  {
    src: "/novedades/placeholder/utrnfrro.jpg",
    ancho: 760,
    alto: 469,
    alt: "Entrada de la Facultad Regional Rosario en Zeballos 1341",
    epigrafe: "La entrada de todos los días",
  },
  {
    src: "/novedades/placeholder/frro-alumnos-2.jpg",
    ancho: 739,
    alto: 415,
    alt: "Estudiantes en un aula de la Facultad Regional Rosario durante una charla",
    epigrafe: "Adentro",
  },
];

const CSS = `
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .ff-foto {
      opacity: 0;
      animation: ff-entra linear both;
      animation-timeline: view();
      /* Arranca apenas asoma y termina bastante antes del centro: si la
         animacion cerrara recien en el medio, la foto pasaria casi toda la
         pantalla todavia entrando. */
      animation-range: entry 5% cover 30%;
    }

    @keyframes ff-entra {
      from { opacity: 0; transform: translateY(32px) scale(0.985); }
      to   { opacity: 1; transform: none; }
    }

    /* Paralaje adentro del marco: la imagen se corre mas lento que la pagina.
       El scale de mas evita que el corrimiento descubra los bordes. */
    .ff-foto img {
      animation: ff-paralaje linear both;
      animation-timeline: view();
      animation-range: cover;
    }

    @keyframes ff-paralaje {
      from { transform: translateY(-7%) scale(1.14); }
      to   { transform: translateY(7%) scale(1.14); }
    }
  }
}
`;

export function FotosFacultad() {
  return (
    <section aria-labelledby="fotos-titulo">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="mb-8">
        <h2
          id="fotos-titulo"
          className="font-headline text-2xl font-bold tracking-tight text-[var(--shell-fg)] sm:text-3xl"
        >
          Regional Rosario
        </h2>
        <p className="mt-2 max-w-xl text-[var(--shell-fg-muted)]">
          Detrás de las novedades, las comisiones y el calendario hay un
          edificio en el que pasás media carrera.
        </p>
      </div>

      {/* Alturas distintas y desfasadas: una grilla pareja se lee como catálogo
          de stock; el escalonado le da ritmo al scroll. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12">
        {FOTOS.map((foto, i) => (
          <figure
            key={foto.src}
            className={[
              "ff-foto group relative overflow-hidden rounded-xl border border-[var(--shell-border)]",
              i === 0 ? "lg:col-span-7" : "",
              i === 1 ? "lg:col-span-5 lg:mt-10" : "",
              i === 2 ? "sm:col-span-2 lg:col-span-12" : "",
            ].join(" ")}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div
              className="relative w-full"
              style={{ aspectRatio: i === 2 ? "21 / 7" : "16 / 10" }}
            >
              <Image
                src={foto.src}
                alt={foto.alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 60vw"
                className="object-cover"
              />
            </div>

            {/* Degradado para que el epígrafe se lea sobre cualquier foto, sin
                oscurecerla entera. */}
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 font-body text-sm font-medium text-white">
              {foto.epigrafe}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
