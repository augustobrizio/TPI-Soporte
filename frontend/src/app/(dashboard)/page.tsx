import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";

import { FondoPortada } from "@/components/frontpage/FondoPortada";
import { SeccionesIndex } from "@/components/frontpage/SeccionesIndex";
import { InicioPortada } from "@/features/portada/InicioPortada";
import { NovedadCard } from "@/features/novedades/NovedadCard";
import { getSemanaCursada, listarPortada } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import { SITIO_URL } from "@/lib/site";
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

/** Cookie de "ya vi la bienvenida". No es httpOnly: es preferencia de vista. */
const COOKIE_BIENVENIDA = "utnhub_bienvenida";

/** Sólo `YYYY-MM-DD`: lo que llega por la URL no se reenvía sin mirar. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/** El `?semana=` del link compartido, si es una fecha de verdad. */
function semanaPedida(sp: Record<string, string | string[] | undefined>): string | null {
  const v = Array.isArray(sp.semana) ? sp.semana[0] : sp.semana;
  return v && FECHA.test(v) ? v : null;
}

function rotuloSemana(lunes: string): string {
  const ini = new Date(`${lunes}T00:00:00`);
  const fin = new Date(ini);
  fin.setDate(fin.getDate() + 4);
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "long" });
  return ini.getMonth() === fin.getMonth()
    ? `${ini.getDate()} al ${fin.getDate()} de ${mes(fin)}`
    : `${ini.getDate()} de ${mes(ini)} al ${fin.getDate()} de ${mes(fin)}`;
}

/** Los días sin cursada, que es lo único que se lee en la tarjeta del link. */
function resumenSemana(semana: SemanaCursada): string {
  const sin = semana.dias
    .map((d, i) => ({ d, nombre: DIAS[i] }))
    .filter(({ d }) => !d.se_cursa);
  if (sin.length === 0) return "Se cursa normal los cinco días.";
  return sin
    .map(({ d, nombre }) => `${nombre}: sin cursada${d.motivo ? ` (${d.motivo})` : ""}`)
    .join(" · ");
}

/**
 * Metadata de la portada, con una salvedad: cuando llega con `?semana=`.
 *
 * Compartir el panel manda acá y no a una página aparte, así el que recibe el
 * link cae en la portada entera —panel, novedades, secciones— en vez de en una
 * pantalla suelta. Pero la preview tiene que seguir contando de qué semana se
 * trata, y para eso el título, el resumen y la tarjeta salen de esa semana.
 *
 * Sin el parámetro no se devuelve nada y valen las meta genéricas del layout.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const lunes = semanaPedida(await searchParams);
  if (lunes === null) return {};

  const semana = await semanaDeCursada(lunes);
  if (semana === null) return {};

  const titulo = `Semana del ${rotuloSemana(semana.lunes)}`;
  const url = `${SITIO_URL}/?semana=${semana.lunes}`;
  // Explícita, y no por la convención `opengraph-image`: esa responde en
  // chunks, sin `Content-Length`, y el WhatsApp de escritorio cae al thumbnail.
  const imagen = `${SITIO_URL}/api/og/semana/${semana.lunes}`;

  return {
    title: titulo,
    description: resumenSemana(semana),
    openGraph: {
      title: `${titulo} · UTNHub`,
      description: resumenSemana(semana),
      url,
      type: "article",
      images: [{ url: imagen, width: 1080, height: 1080, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", images: [imagen] },
    alternates: { canonical: url },
  };
}

async function ultimasNovedades(): Promise<NovedadOut[]> {
  try {
    // El orden lo fija el admin (`/novedades/portada`), no la fecha: una
    // novedad nueva entra al frente y desplaza a la tercera.
    return await listarPortada();
  } catch {
    // La portada no se cae por las novedades: si el backend no responde, la
    // seccion simplemente no se muestra.
    return [];
  }
}

async function semanaDeCursada(lunes?: string): Promise<SemanaCursada | null> {
  try {
    return await getSemanaCursada(lunes);
  } catch {
    // La portada no se cae por el calendario: el panel muestra su propio
    // aviso y el resto de la pagina sigue en pie.
    return null;
  }
}

export default async function Portada({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lunes = semanaPedida(await searchParams);
  const [novedades, usuario, semana, galletas] = await Promise.all([
    ultimasNovedades(),
    getUsuarioActual(),
    semanaDeCursada(lunes ?? undefined),
    cookies(),
  ]);
  // Con `?semana=` la portada llega por un link compartido: la bienvenida
  // taparía justo lo que el otro vino a ver.
  const yaVioBienvenida =
    lunes !== null || galletas.get(COOKIE_BIENVENIDA)?.value === "1";

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
        esAdmin={(usuario?.rol ?? "").toLowerCase() === "admin"}
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
