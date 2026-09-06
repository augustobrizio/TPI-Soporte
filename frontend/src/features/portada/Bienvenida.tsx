"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ConvergenciaFuentes } from "@/components/frontpage/ConvergenciaFuentes";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * La presentación de UTNHub, para quien llega por primera vez.
 *
 * Es un **popup** y no una sección de la portada. Antes ocupaba el lugar del
 * panel de la semana y se leía como si fuera otra página: al cerrarla, el
 * contenido de abajo saltaba hacia arriba. Como diálogo queda claro que es una
 * capa por encima de la portada —que se sigue viendo detrás— y cerrarla no
 * mueve nada.
 *
 * Radix se encarga del foco atrapado, del Escape y del scroll-lock.
 */
export function Bienvenida({
  abierta,
  onCerrar,
  autenticado,
}: {
  abierta: boolean;
  onCerrar: () => void;
  autenticado: boolean;
}) {
  return (
    <Dialog open={abierta} onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-4xl p-0">
        <div className="grid grid-cols-1 gap-6 p-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:p-9">
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
              ISI · UTN FRRO
            </p>

            <DialogTitle className="mt-3 font-headline text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] md:text-[38px]">
              Bienvenido a UTNHub
            </DialogTitle>

            <DialogDescription className="mt-4 leading-relaxed">
              La información de la UTN FRRO vive desparramada entre el sitio de
              la facultad y las cuentas de los centros de estudiantes. UTNHub la
              reúne y la ordena: novedades, profesores, comisiones, calendario y
              material.
            </DialogDescription>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={onCerrar}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1CA4DF] px-5 py-2.5 font-body text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              >
                Entendido
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>

              {!autenticado && (
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--shell-border)] px-5 py-2.5 font-body text-sm font-semibold text-[var(--shell-fg)] transition-colors duration-150 hover:bg-[var(--shell-hover)]"
                >
                  Crear cuenta
                </Link>
              )}
            </div>
          </div>

          {/* El gráfico entero, que es lo que cuenta de qué se trata: siete
              fuentes desparramadas convergiendo en una. */}
          <ConvergenciaFuentes />
        </div>
      </DialogContent>
    </Dialog>
  );
}
