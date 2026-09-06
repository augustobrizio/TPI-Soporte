"use client";

import { useState } from "react";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { NovedadOut } from "@/lib/types";
import { fechaCorta } from "./formato";
import { NovedadDetail } from "./NovedadDetail";

const CELESTE = "#1CA4DF";

export function NovedadCard({ novedad }: { novedad: NovedadOut }) {
  const [open, setOpen] = useState(false);
  const fecha = fechaCorta(novedad.fecha_publicacion ?? novedad.created_at);
  const primaria = novedad.fuentes[0];
  const centro = primaria?.centro;
  const otrasFuentes = novedad.fuentes.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full text-left"
      >
        <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 group-hover:border-[#1CA4DF]/40 group-hover:bg-[var(--shell-hover)]">
          <div className="relative aspect-[16/9] overflow-hidden border-b border-[var(--shell-border)]">
            {novedad.imagen_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={novedad.imagen_url}
                  alt={novedad.titulo ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#1CA4DF]/[0.05]">
                <span
                  className="material-symbols-outlined text-4xl text-[#1CA4DF]/50"
                  aria-hidden
                >
                  campaign
                </span>
              </div>
            )}
          </div>

          <CardContent className="flex flex-1 flex-col">
            <h3 className="font-headline text-base font-semibold leading-snug tracking-tight text-[var(--shell-fg)] line-clamp-2">
              {novedad.titulo ?? "Sin titulo"}
            </h3>

            {novedad.descripcion && (
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--shell-fg-muted)] line-clamp-2">
                {novedad.descripcion}
              </p>
            )}

            <CardFooter className="mt-4 border-t border-[var(--shell-border)]">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {centro?.logo_url ? (
                  <span className="flex h-4 w-4 shrink-0 overflow-hidden rounded-full bg-[var(--shell-hover)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={centro.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CELESTE }}
                  />
                )}
                <span className="truncate text-[11.5px] font-medium text-[var(--shell-fg-muted)]">
                  {centro?.nombre ?? "UTN"}
                </span>
                {otrasFuentes > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--shell-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--shell-fg-muted)]">
                    +{otrasFuentes}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {fecha && (
                  <span className="whitespace-nowrap text-[11.5px] tabular-nums text-[var(--shell-fg-dim)]">
                    {fecha}
                  </span>
                )}
                <span className="material-symbols-outlined shrink-0 text-[16px] text-[var(--shell-fg-dim)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--shell-accent-fg)]">
                  chevron_right
                </span>
              </div>
            </CardFooter>
          </CardContent>
        </Card>
      </button>

      <NovedadDetail novedad={novedad} open={open} onOpenChange={setOpen} />
    </>
  );
}
