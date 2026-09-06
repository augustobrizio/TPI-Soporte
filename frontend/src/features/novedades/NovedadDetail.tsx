"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NovedadOut } from "@/lib/types";
import { CompartirNovedad } from "./CompartirNovedad";
import { FuentesNovedad } from "./FuentesNovedad";

interface NovedadDetailProps {
  novedad: NovedadOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovedadDetail({ novedad, open, onOpenChange }: NovedadDetailProps) {
  const cuerpo = novedad.contenido ?? novedad.descripcion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        {novedad.imagen_url && (
          <div className="aspect-[16/9] w-full overflow-hidden border-b border-[var(--shell-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={novedad.imagen_url}
              alt={novedad.titulo ?? ""}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="p-6">
          {novedad.categoria && (
            <Badge variant="celeste" className="mb-3">
              {novedad.categoria}
            </Badge>
          )}

          <DialogTitle className="text-lg leading-snug">
            {novedad.titulo ?? "Sin título"}
          </DialogTitle>

          <DialogDescription className="mt-2 leading-relaxed text-[var(--shell-fg-muted)]">
            {cuerpo ?? "Sin más información disponible."}
          </DialogDescription>

          {/* El modal no tiene URL propia: lo que comparte este botón es
              `/novedades/<id>`, la página de la novedad, que es la que un
              crawler puede leer para armar la preview. */}
          <CompartirNovedad id={novedad.id} titulo={novedad.titulo} />

          <FuentesNovedad fuentes={novedad.fuentes} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
