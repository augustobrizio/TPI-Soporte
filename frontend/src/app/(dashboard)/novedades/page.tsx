import { FiltroFuentes } from "@/features/novedades/FiltroFuentes";
import { NovedadCard } from "@/features/novedades/NovedadCard";
import { NovedadDeepLink } from "@/features/novedades/NovedadDeepLink";
import { getNovedad, listarCentros, listarNovedades } from "@/lib/api";
import type { CentroOut, NovedadOut } from "@/lib/types";

// Cuantas novedades entran en la portada (numero generico por ahora). Tambien
// define la ventana de dedup de placeholders en el backend.
const PORTADA_LIMITE = 12;

export default async function NovedadesPage({
  searchParams,
}: {
  // `?novedad=<id>` es el deep link del buscador global y de la campana:
  // abre esa novedad con el detalle desplegado.
  searchParams: Promise<{ centro?: string; novedad?: string }>;
}) {
  const { centro, novedad: novedadParam } = await searchParams;
  let novedades: NovedadOut[] = [];
  let centros: CentroOut[] = [];
  let error = false;
  try {
    [novedades, centros] = await Promise.all([
      listarNovedades({ limite: PORTADA_LIMITE, centro }),
      listarCentros(),
    ]);
  } catch {
    error = true;
  }

  // La portada trae sólo las últimas doce: la novedad del link puede ser más
  // vieja y no estar ahí, así que se pide aparte en vez de buscarla en la
  // lista. Si el id no existe o el backend no responde, la página se muestra
  // igual sin el modal — un link roto no puede tumbar la portada.
  const id = Number(novedadParam);
  let novedadDelLink: NovedadOut | null = null;
  if (novedadParam && Number.isInteger(id)) {
    try {
      novedadDelLink = await getNovedad(id);
    } catch {
      novedadDelLink = null;
    }
  }
  const hrefPortada = centro
    ? `/novedades?centro=${encodeURIComponent(centro)}`
    : "/novedades";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[var(--shell-canvas)]">
      {novedadDelLink && (
        <NovedadDeepLink novedad={novedadDelLink} hrefAlCerrar={hrefPortada} />
      )}
      {/* Hero con identidad UTN: wash celeste + isotipo difuminado + membrete */}
      <header className="relative overflow-hidden border-b border-[var(--shell-border)]">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_88%_-10%,rgba(28,164,223,0.16),transparent_55%)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/utn-isotipo-white.png"
            alt=""
            className="absolute -right-4 top-8 w-[280px] select-none opacity-[0.05] blur-[1px]"
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-8 pb-11 pt-11">
          {/* Membrete institucional */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/utn-frro-white.png"
            alt="UTN — Facultad Regional Rosario"
            className="mb-7 h-[18px] w-auto opacity-40"
          />

          <div className="mb-3 flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1CA4DF] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1CA4DF]" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--shell-fg-dim)]">
              Actualizado automaticamente
            </span>
          </div>

          <h1 className="font-headline text-4xl font-bold tracking-tight text-[var(--shell-fg)] md:text-[52px] md:leading-[1.05]">
            Novedades
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--shell-fg-muted)]">
            Avisos, fechas y anuncios de la facultad, reunidos automaticamente
            en un solo lugar.
          </p>
        </div>
      </header>

      {/* Contenido */}
      <div className="mx-auto max-w-6xl px-8 py-9">
        {!error && <FiltroFuentes centros={centros} activo={centro} />}

        {error ? (
          <EstadoVacio
            icono="cloud_off"
            titulo="No pudimos cargar las novedades"
            detalle="El servidor no respondio. Proba de nuevo en un momento."
          />
        ) : novedades.length === 0 ? (
          <EstadoVacio
            icono="inbox"
            titulo="Todavia no hay novedades"
            detalle="Cuando la facultad publique algo nuevo, va a aparecer aca."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {novedades.map((n) => (
              <NovedadCard key={n.id} novedad={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoVacio({
  icono,
  titulo,
  detalle,
}: {
  icono: string;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-6 py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1CA4DF]/10">
        <span className="material-symbols-outlined text-3xl text-[var(--shell-accent-fg)]">
          {icono}
        </span>
      </div>
      <h2 className="font-headline text-lg font-semibold tracking-tight text-[var(--shell-fg)]">
        {titulo}
      </h2>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--shell-fg-dim)]">
        {detalle}
      </p>
    </div>
  );
}
