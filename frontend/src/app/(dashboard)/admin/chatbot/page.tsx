import { getReporteHuecos, type ReporteHuecos } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";

/**
 * Reporte de huecos del chatbot (sólo admin): las preguntas que el asistente
 * no pudo responder con datos reales (sin tool estructurada y sin fuentes) o
 * que se llevaron un 👎, agrupadas por frecuencia. Es el feedback loop: qué
 * tool o documento conviene sumar después, priorizado por lo que más se pide.
 *
 * El gate real es del backend (403 si no es admin); acá cortamos antes para no
 * mostrar el cascarón a quien no corresponde.
 */
export default async function HuecosChatbotPage() {
  const usuario = await getUsuarioActual();
  if (usuario?.rol !== "admin") {
    return <AccesoRestringido />;
  }

  let reporte: ReporteHuecos | null = null;
  try {
    reporte = await getReporteHuecos(7);
  } catch {
    reporte = null;
  }

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 py-6">
      <header className="mb-6 flex items-center gap-2.5">
        <div className="icon-chip chip-primary flex h-9 w-9 items-center justify-center rounded-xl text-primary">
          <span className="material-symbols-outlined text-[20px]">troubleshoot</span>
        </div>
        <div className="leading-tight">
          <h1 className="font-headline text-lg font-bold text-on-surface">
            Huecos del chatbot
          </h1>
          <p className="font-label text-[10px] uppercase tracking-widest text-outline">
            Feedback loop · últimos {reporte?.dias ?? 7} días
          </p>
        </div>
      </header>

      {reporte === null ? (
        <p className="rounded-2xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-on-surface">
          No pudimos cargar el reporte. Probá recargar en unos segundos.
        </p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Preguntas" valor={reporte.kpis.preguntas} />
            <Kpi
              label="Respondidas con datos"
              valor={`${reporte.kpis.con_datos_pct}%`}
            />
            <Kpi label="Huecos" valor={reporte.kpis.huecos} acento="tertiary" />
            <Kpi
              label="Con voto negativo"
              valor={reporte.kpis.voto_negativo}
              acento="error"
            />
          </div>

          <p className="mb-2 px-1 font-label text-[10px] uppercase tracking-widest text-outline">
            Más frecuentes primero
          </p>

          {reporte.huecos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant/10 bg-surface-container px-4 py-10 text-center">
              <span className="material-symbols-outlined mb-2 text-[32px] text-secondary">
                task_alt
              </span>
              <p className="text-sm text-on-surface">
                No hay huecos en este período.
              </p>
              <p className="mt-1 text-xs text-outline">
                Cada respuesta se apoyó en datos y nadie votó 👎.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container">
              {reporte.huecos.map((h, i) => (
                <div
                  key={`${h.pregunta}-${i}`}
                  className="flex items-center gap-3 border-b border-outline-variant/10 px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                    {h.pregunta}
                  </span>
                  <span className="shrink-0 text-xs text-outline">
                    ×{h.cantidad}
                  </span>
                  {h.sin_datos && (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg border border-tertiary/25 bg-tertiary/10 px-2 py-1 text-[11px] text-tertiary">
                      <span className="material-symbols-outlined text-[13px]">
                        search_off
                      </span>
                      sin datos
                    </span>
                  )}
                  {h.voto_negativo && (
                    <span className="flex shrink-0 items-center gap-1 rounded-lg border border-error/25 bg-error/10 px-2 py-1 text-[11px] text-error">
                      <span className="material-symbols-outlined text-[13px]">
                        thumb_down
                      </span>
                      no útil
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Acento = "primary" | "tertiary" | "error";

function Kpi({
  label,
  valor,
  acento,
}: {
  label: string;
  valor: string | number;
  acento?: Acento;
}) {
  const color =
    acento === "tertiary"
      ? "text-tertiary"
      : acento === "error"
        ? "text-error"
        : "text-on-surface";
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-4">
      <p className="font-label text-[10px] uppercase tracking-widest text-outline">
        {label}
      </p>
      <p className={`mt-1 font-headline text-2xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}

function AccesoRestringido() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-outline-variant/20 text-outline">
        <span className="material-symbols-outlined text-[26px]">lock</span>
      </div>
      <h1 className="font-headline text-lg font-bold text-on-surface">
        Acceso restringido
      </h1>
      <p className="mt-1 text-sm text-outline">
        Esta sección es sólo para administradores.
      </p>
    </div>
  );
}
