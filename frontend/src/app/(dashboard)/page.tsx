import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ConvergenciaFuentes } from "@/components/frontpage/ConvergenciaFuentes";
import { FondoFoto } from "@/components/frontpage/FondoFoto";
import { SeccionesIndex } from "@/components/frontpage/SeccionesIndex";
import { NovedadCard } from "@/features/novedades/NovedadCard";
import { listarNovedades } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import type { NovedadOut } from "@/lib/types";

/**
 * Portada publica de UTNHub.
 *
 * Antes `/` era el dashboard personal y sin sesion rebotaba a /login; despues
 * redirigia a /novedades. Ahora es una portada propia: que es UTNHub, que
 * secciones tiene y las ultimas novedades reales. El dashboard se mudo a
 * /perfil, que es donde tiene sentido lo personal.
 */

const NOVEDADES_EN_PORTADA = 3;

async function ultimasNovedades(): Promise<NovedadOut[]> {
  try {
    return await listarNovedades({ limite: NOVEDADES_EN_PORTADA });
  } catch {
    // La portada no se cae por las novedades: si el backend no responde, la
    // seccion simplemente no se muestra.
    return [];
  }
}

export default async function Portada() {
  const [novedades, usuario] = await Promise.all([
    ultimasNovedades(),
    getUsuarioActual(),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-14 md:px-10 md:py-20">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* El visual pesa mas que el texto en la grilla: con los nombres de las
          fuentes adentro, una columna angosta los vuelve ilegibles. */}
      <section className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
            ISI · UTN FRRO
          </p>

          {/* clamp() en vez de breakpoints: el titular escala con el viewport
              en vez de saltar de un tamaño a otro. */}
          <h1
            className="mt-4 font-headline font-extrabold leading-[1.05] tracking-[-0.02em] text-[var(--shell-fg)]"
            style={{ fontSize: "clamp(2.25rem, 5vw, 3.75rem)" }}
          >
            Todo lo de la facultad,
            <br />
            en un solo lugar.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--shell-fg-muted)]">
            La información de la UTN FRRO vive desparramada entre el sitio de la
            facultad y las cuentas de los centros de estudiantes. UTNHub la
            reúne y la ordena: novedades, profesores, comisiones, calendario y
            material.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/novedades"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1CA4DF] px-5 py-2.5 font-body text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
            >
              Ver novedades
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
            </Link>

            {usuario ? (
              <Link
                href="/perfil"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--shell-border)] px-5 py-2.5 font-body text-sm font-semibold text-[var(--shell-fg)] transition-colors duration-150 hover:bg-[var(--shell-hover)]"
              >
                Ir a mi panel
              </Link>
            ) : (
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--shell-border)] px-5 py-2.5 font-body text-sm font-semibold text-[var(--shell-fg)] transition-colors duration-150 hover:bg-[var(--shell-hover)]"
              >
                Crear cuenta
              </Link>
            )}
          </div>

        </div>

        <ConvergenciaFuentes className="order-first lg:order-none" />
      </section>

      {/* ── Secciones, sobre el frente de la facultad ────────────────── */}
      <FondoFoto
        src="/novedades/placeholder/utn-frro-generica.jpg"
        alt="Frente de la Facultad Regional Rosario, con la fachada azul y el isotipo de la UTN"
        className="mt-24 py-16 md:mt-32 md:py-24"
      >
        <div className="aparece">
          <SeccionesIndex />
        </div>
      </FondoFoto>

      {/* ── Novedades ────────────────────────────────────────────────── */}
      {novedades.length > 0 && (
        <section
          className="aparece mt-24 md:mt-32"
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

      {/* ── Cierre ───────────────────────────────────────────────────── */}
      {!usuario && (
        <FondoFoto
          src="/novedades/placeholder/utrnfrro.jpg"
          alt="Entrada de la Facultad Regional Rosario en Zeballos 1341"
          intensidad={0.22}
          aSangre={false}
          className="aparece mt-24 rounded-xl border border-[var(--shell-border)] p-8 md:mt-32 md:p-12"
        >
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
        </FondoFoto>
      )}
    </div>
  );
}
