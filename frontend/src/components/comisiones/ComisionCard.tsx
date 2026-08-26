"use client";

import { useState } from "react";

import type { ComisionConProfesores } from "@/lib/types";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ComisionScore } from "./Score";
import { ComisionModal } from "./ComisionModal";

/**
 * Tarjeta compacta de una comisión. Es el trigger de un modal (Dialog) que
 * muestra el detalle completo (materias + profesor + horario). El hover deja
 * claro que es clickeable (lift + borde primario + "Ver detalle →").
 *
 * El Dialog es controlado —y no el de Radix sin estado— porque el buscador
 * global llega con `/comisiones?comision=<id>` y tiene que poder abrir esta
 * tarjeta sin que nadie la clickee.
 */
export function ComisionCard({
  comision,
  abiertaInicial = false,
}: {
  comision: ComisionConProfesores;
  /** El deep link apuntaba a esta comisión: arranca con el detalle abierto. */
  abiertaInicial?: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const nMaterias = new Set(comision.cursadas.map((c) => c.materia_codigo)).size;
  const nProfes = new Set(
    comision.cursadas.filter((c) => c.profesor).map((c) => c.materia_codigo),
  ).size;

  return (
    <Dialog open={abierta} onOpenChange={setAbierta}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="card-3d group w-full cursor-pointer rounded-2xl border border-outline-variant/10 bg-surface-container/50 p-4 text-left transition-colors hover:border-primary/30 hover:bg-surface-container/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <div className="flex items-start gap-3">
            <div className="icon-chip chip-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
              <span className="material-symbols-outlined text-[22px]">groups</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-headline text-base font-extrabold leading-tight text-on-surface">
                {comision.nombre ?? "Comisión"}
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-outline">
                {nMaterias} {nMaterias === 1 ? "materia" : "materias"} · {nProfes} con profesor
              </p>
            </div>
          </div>

          <hr className="rule-fade mt-3 mb-2.5" />
          <div className="flex items-center justify-between">
            <ComisionScore
              score={comision.score}
              conReview={comision.score_con_review}
              total={comision.score_total}
            />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant transition-colors group-hover:text-primary">
              Ver detalle
              <span className="material-symbols-outlined text-[15px] transition-transform group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl overflow-hidden border-outline-variant/15 bg-surface-container p-0">
        <ComisionModal comision={comision} />
      </DialogContent>
    </Dialog>
  );
}
