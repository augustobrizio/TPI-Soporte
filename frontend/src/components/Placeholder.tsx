/**
 * Placeholder visual para las pestanas que todavia no estan implementadas.
 * Mantiene la estetica Kinetic Blueprint asi la nav no se siente rota: panel
 * con relieve + glow ambiental, icono con halo pulsante y membrete.
 */
export function Placeholder({
  titulo,
  icono,
  descripcion,
}: {
  titulo: string;
  icono: string;
  descripcion?: string;
}) {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-10 space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          <span className="material-symbols-outlined text-[13px]">construction</span>
          En construccion
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
          {titulo}
        </h1>
        <p className="text-on-surface-variant">
          {descripcion ?? "Esta pestana todavia no esta implementada."}
        </p>
      </header>

      <div className="card-3d glow-card glow-primary bg-surface-container/50 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[420px] overflow-hidden">
        {/* Icono con halo pulsante */}
        <div className="relative mb-7">
          <span className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl animate-pulse" />
          <div className="icon-chip chip-primary relative w-24 h-24 rounded-3xl text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[52px]">{icono}</span>
          </div>
        </div>

        <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
          Proximamente
        </h2>
        <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">
          Esta pantalla esta en construccion. La logica del backend ya esta
          lista — falta cablear el frontend.
        </p>

        {/* Barra de progreso decorativa */}
        <div className="mt-8 h-1.5 w-56 overflow-hidden rounded-full bg-surface-container-highest">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
