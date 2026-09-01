"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  eliminarConversacion,
  renombrarConversacion,
  type ConversacionOut,
} from "@/lib/api";

/** Agrupa las conversaciones por antigüedad (Hoy / Ayer / Últimos 7 días / Anteriores). */
function agrupar(conversaciones: ConversacionOut[]) {
  const ahora = new Date();
  const inicioHoy = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
  ).getTime();
  const dia = 86_400_000;

  const grupos: { label: string; items: ConversacionOut[] }[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Últimos 7 días", items: [] },
    { label: "Anteriores", items: [] },
  ];

  for (const c of conversaciones) {
    const t = new Date(c.updated_at ?? c.created_at ?? "").getTime();
    if (Number.isNaN(t) || t >= inicioHoy) grupos[0].items.push(c);
    else if (t >= inicioHoy - dia) grupos[1].items.push(c);
    else if (t >= inicioHoy - 7 * dia) grupos[2].items.push(c);
    else grupos[3].items.push(c);
  }
  return grupos.filter((g) => g.items.length > 0);
}

export function ChatSidebar({
  conversaciones,
}: {
  conversaciones: ConversacionOut[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [colapsado, setColapsado] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editValor, setEditValor] = useState("");
  const [confirmarId, setConfirmarId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enNuevo = pathname === "/chat";
  const grupos = agrupar(conversaciones);

  const cerrarAcciones = () => {
    setMenuId(null);
    setConfirmarId(null);
  };

  const guardarNombre = async (id: number) => {
    const titulo = editValor.trim();
    setEditId(null);
    if (!titulo || ocupado) return;
    setOcupado(true);
    try {
      await renombrarConversacion(id, titulo);
      router.refresh();
    } catch {
      /* si falla, el refresh mostrará el nombre viejo */
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (id: number) => {
    if (ocupado) return;
    setOcupado(true);
    cerrarAcciones();
    try {
      await eliminarConversacion(id);
      if (pathname === `/chat/${id}`) router.push("/chat");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  };

  // --- Colapsado: rail angosto con solo iconos ---
  if (colapsado) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-outline-variant/10 bg-surface-container/40 py-3">
        <button
          type="button"
          onClick={() => setColapsado(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface"
          aria-label="Expandir historial"
          title="Expandir historial"
        >
          <span className="material-symbols-outlined text-[20px]">left_panel_open</span>
        </button>
        <Link
          href="/chat"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface transition hover:border-primary/40"
          aria-label="Nuevo chat"
          title="Nuevo chat"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </Link>
      </aside>
    );
  }

  // --- Expandido ---
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-outline-variant/10 bg-surface-container/40">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="font-label text-[10px] uppercase tracking-widest text-outline">
          Conversaciones
        </span>
        <button
          type="button"
          onClick={() => setColapsado(true)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-outline transition hover:bg-surface-container hover:text-on-surface"
          aria-label="Colapsar historial"
          title="Colapsar historial"
        >
          <span className="material-symbols-outlined text-[18px]">left_panel_close</span>
        </button>
      </div>

      <div className="px-3 pt-2">
        <Link
          href="/chat"
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            enNuevo
              ? "bg-on-surface text-surface"
              : "border border-outline-variant/20 text-on-surface hover:border-primary/40"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nuevo chat
        </Link>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {grupos.length === 0 ? (
          <p className="px-3 py-4 text-xs text-outline/60">
            Todavía no tenés conversaciones.
          </p>
        ) : (
          grupos.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-3 pb-1 pt-2 font-label text-[9px] uppercase tracking-widest text-outline/70">
                {g.label}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((c) => {
                  const activa = pathname === `/chat/${c.id}`;
                  const editando = editId === c.id;
                  const menuAbierto = menuId === c.id;
                  return (
                    <li key={c.id} className="group relative">
                      {editando ? (
                        <input
                          autoFocus
                          value={editValor}
                          onChange={(e) => setEditValor(e.target.value)}
                          onBlur={() => guardarNombre(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              guardarNombre(c.id);
                            } else if (e.key === "Escape") {
                              setEditId(null);
                            }
                          }}
                          className="w-full rounded-lg border border-primary/40 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none"
                        />
                      ) : (
                        <div
                          className={`flex items-center rounded-lg transition ${
                            activa
                              ? "bg-surface-container text-on-surface"
                              : "text-on-surface-variant hover:bg-surface-container/60"
                          }`}
                        >
                          <Link
                            href={`/chat/${c.id}`}
                            className="block min-w-0 flex-1 truncate px-3 py-2 text-sm"
                            title={c.titulo ?? "Conversación"}
                          >
                            {c.titulo ?? "Conversación sin título"}
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              setMenuId(menuAbierto ? null : c.id)
                            }
                            className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-outline transition hover:bg-surface-container-high hover:text-on-surface ${
                              menuAbierto
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                            }`}
                            aria-label="Opciones de la conversación"
                            aria-haspopup="menu"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              more_horiz
                            </span>
                          </button>
                        </div>
                      )}

                      {menuAbierto && !editando && (
                        <div className="card-3d mt-0.5 rounded-lg border border-outline-variant/15 bg-surface-container-high p-1">
                          {confirmarId === c.id ? (
                            <div className="flex items-center gap-1 px-1">
                              <span className="flex-1 px-1 text-xs text-on-surface-variant">
                                ¿Eliminar?
                              </span>
                              <button
                                type="button"
                                onClick={() => borrar(c.id)}
                                className="rounded px-2 py-1 text-xs font-medium text-error hover:bg-error/10"
                              >
                                Eliminar
                              </button>
                              <button
                                type="button"
                                onClick={cerrarAcciones}
                                className="rounded px-2 py-1 text-xs text-outline hover:bg-surface-container"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditId(c.id);
                                  setEditValor(c.titulo ?? "");
                                  cerrarAcciones();
                                }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  edit
                                </span>
                                Renombrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmarId(c.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-error/90 transition hover:bg-error/10"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  delete
                                </span>
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
