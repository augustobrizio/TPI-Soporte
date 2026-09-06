import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";

import { FondoPortada } from "@/components/frontpage/FondoPortada";
import { SeccionesIndex } from "@/components/frontpage/SeccionesIndex";
import { InicioPortada } from "@/features/portada/InicioPortada";
import { NovedadCard } from "@/features/novedades/NovedadCard";
import { getSemanaCursada, listarNovedades } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import type { NovedadOut, SemanaCursada } from "@/lib/types";

/**
 * Portada publica de UTNHub.
 *
 * Antes `/` era el dashboard personal y sin sesion rebotaba a /login; despues
 * redirigia a /novedades. Ahora es una portada propia: que es UTNHub, que
 * secciones tiene y las ultimas novedades reales. El dashboard se mudo a
 * /perfil, que es donde tiene sentido lo personal.
 *
 * Arriba de todo, lo que cambia segun quien entra: la bienvenida la primera
 * vez, y de ahi en mas la semana de cursada, que es a lo que el alumno vuelve
 * todos los dias. Ver `features/portada/InicioPortada.tsx`.
 */

const NOVEDADES_EN_PORTADA = 3;

/** Cookie de "ya vi la bienvenida". No es httpOnly: es preferencia de vista. */
const COOKIE_BIENVENIDA = "utnhub_bienvenida";

async function ultimasNovedades(): Promise<NovedadOut[]> {
  try {
    return await listarNovedades({ limite: NOVEDADES_EN_PORTADA });
  } catch {
    // La portada no se cae por las novedades: si el backend no responde, la
    // seccion simplemente no se muestra.
    return [];
  }
}

async function semanaDeCursada(): Promise<SemanaCursada | null> {
  try {
    return await getSemanaCursada();
  } catch {
    // La portada no se cae por el calendario: el panel muestra su propio
    // aviso y el resto de la pagina sigue en pie.
    return null;
  }
}

export default async function Portada() {
  const [novedades, usuario, semana, galletas] = await Promise.all([
    ultimasNovedades(),
    getUsuarioActual(),
    semanaDeCursada(),
    cookies(),
  ]);
  const yaVioBienvenida = galletas.get(COOKIE_BIENVENIDA)?.value === "1";

  return (
    <div className="relative mx-auto max-w-[1200px] px-6 py-14 md:px-10 md:py-20">
      <FondoPortada
        src="/novedades/placeholder/utn-frro-generica.jpg"
        alt="Frente de la Facultad Regional Rosario, con la fachada azul y el isotipo de la UTN"
      />

      {/* Todo el contenido por delante del fondo compartido. */}
      <div className="relative z-10">

      {/* ── Bienvenida (1a visita) o semana de cursada ───────────────── */}
      <InicioPortada
        semana={semana}
        autenticado={usuario !== null}
        yaVioBienvenida={yaVioBienvenida || usuario !== null}
      />

      {/* ── Novedades ────────────────────────────────────────────────── */}
      {novedades.length > 0 && (
        <section
          className="aparece mt-20 md:mt-24"
          aria-labelledby="novedades-titulo"
        >
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2
              id="novedades-titulo"
              className="font-headline text-2xl font-bold tracking-tight text-[var(--shell-fg)] sm:text-3xl"
            >
              Últimas novedades
            </h2>
            <Link
              href="/novedades"
              className="group inline-flex shrink-0 items-center gap-1 font-body text-sm font-medium text-[var(--shell-accent-fg)]"
            >
              Ver todas
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {novedades.map((n) => (
              <NovedadCard key={n.id} novedad={n} />
            ))}
          </div>
        </section>
      )}

      {/* ── Secciones ────────────────────────────────────────────────── */}
      <section className="aparece mt-20 md:mt-24">
        <SeccionesIndex />
      </section>

      {/* ── Cierre ───────────────────────────────────────────────────── */}
      {!usuario && (
        <section className="aparece mt-20 rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-8 md:mt-24 md:p-12">
          <h2 className="font-headline text-2xl font-bold tracking-tight text-[var(--shell-fg)]">
            Creá tu cuenta
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-[var(--shell-fg-muted)]">
            Cargás las materias que aprobaste una vez y UTNHub calcula solo qué
            te queda habilitado para cursar y para rendir, y te deja armar la
            cursada sin superposiciones.
          </p>
          <Link
            href="/register"
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#1CA4DF] px-5 py-2.5 font-body text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
          >
            Empezar
            <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
          </Link>
        </section>
      )}
      </div>
    </div>
  );
}
