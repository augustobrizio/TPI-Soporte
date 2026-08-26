import { RequiereCuenta } from "@/components/RequiereCuenta";
import { MisCatedrasCalificar } from "@/components/resenas/MisCatedrasCalificar";
import { PanelPersonal } from "@/features/panel/PanelPersonal";
import { getUsuarioActual, iniciales, nombreVisible } from "@/lib/auth";

/**
 * Perfil del usuario logueado. Muestra la data que ya existe en la sesion
 * (nombre, email, legajo) mientras el resto de la pantalla se implementa.
 */
export default async function PerfilPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return (
      <RequiereCuenta
        titulo="Perfil"
        icono="person"
        motivo="Tus datos de cuenta: email, legajo y año de ingreso."
        next="/perfil"
      />
    );
  }

  const nombre = nombreVisible(usuario);
  const datos: { icono: string; label: string; valor: string; ac: string }[] = [
    { icono: "mail", label: "Email", valor: usuario.email, ac: "chip-primary" },
    {
      icono: "badge",
      label: "Legajo",
      valor: usuario.legajo ?? "Sin cargar",
      ac: "chip-secondary",
    },
    {
      icono: "tag",
      label: "ID de usuario",
      valor: `#${usuario.id}`,
      ac: "chip-tertiary",
    },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8 space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
          Perfil
        </h1>
        <p className="text-on-surface-variant text-sm">
          Tu informacion de cuenta en UTNHub.
        </p>
      </header>

      {/* Card principal con avatar */}
      <section className="card-3d glow-card glow-primary relative overflow-hidden bg-surface-container border border-outline-variant/10 rounded-3xl p-8 md:p-10 mb-6">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="icon-chip chip-primary flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl font-headline text-2xl font-black text-primary">
            {iniciales(usuario)}
          </div>
          <div className="min-w-0">
            <h2 className="font-headline text-2xl font-extrabold text-on-surface truncate">
              {nombre}
            </h2>
            <p className="text-on-surface-variant text-sm mt-1 truncate">
              {usuario.email}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary/10 border border-secondary/20 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
              <span className="material-symbols-outlined text-[13px]">school</span>
              ISI · UTN FRRO
            </span>
          </div>
        </div>
      </section>

      {/* Tiles de datos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {datos.map((d) => (
          <div
            key={d.label}
            className="card-3d bg-surface-container/60 border border-outline-variant/10 rounded-2xl p-5"
          >
            <div className={`icon-chip ${d.ac} w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-on-surface`}>
              <span className="material-symbols-outlined text-[20px]">{d.icono}</span>
            </div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-outline font-label">
              {d.label}
            </p>
            <p className="text-sm font-semibold text-on-surface mt-1 truncate">
              {d.valor}
            </p>
          </div>
        ))}
      </div>

      {/* Calificá a tus profesores (historial → reseñas, feature 004) */}
      <div className="mb-6">
        <MisCatedrasCalificar />
      </div>

      {/* Nota de proximamente */}
      <div className="card-3d bg-surface-container/40 border border-dashed border-outline-variant/20 rounded-2xl px-6 py-5 flex items-center gap-4">
        <span className="material-symbols-outlined text-[24px] text-outline shrink-0">
          construction
        </span>
        <p className="text-sm text-on-surface-variant">
          Editar perfil, cambiar contrasena y preferencias llegan pronto. La
          logica del backend ya esta lista.
        </p>
      </div>

      {/* Panel personal: progreso, agenda del dia y atajos. Antes era la
          portada; ahora la portada es publica y esto es lo tuyo. */}
      <div className="mt-10 border-t border-[var(--shell-border)] pt-2">
        <PanelPersonal />
      </div>
    </div>
  );
}
