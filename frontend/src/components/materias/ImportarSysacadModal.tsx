"use client";

/**
 * Modal de importacion masiva de materias desde SYSACAD.
 *
 * Flujo:
 *   1. "pegar"    — el alumno copia la tabla del browser y la pega en un textarea
 *   2. "preview"  — tabla con el matching propuesto, checkboxes editables
 *   3. "exito"    — resumen del resultado
 *
 * Sin APIs externas ni archivos — todo es texto plano.
 */

import { useEffect, useRef, useState } from "react";
import type { ItemImportMapeado, MateriaOut, PreviewImportSysacad, ResultadoImportSysacad } from "@/lib/types";
import {
  ApiError,
  confirmarImportarSysacad,
  listarMaterias,
  previewImportarSysacad,
  resetearTodosRegistros,
} from "@/lib/api";

interface Props {
  onClose: () => void;
  onImportado?: () => void;
}

type Paso = "pegar" | "analizando" | "preview" | "confirmando" | "exito";

// Mismo umbral que `CONFIANZA_MINIMA` en el backend
// (`services/sysacad_paste_service.py`). Debajo de esto la fila arranca con el
// selector abierto: el match propuesto no es confiable y conviene revisarlo.
const CONFIANZA_MINIMA = 0.72;

const CONDICION_LABEL: Record<string, string> = {
  aprobado: "Aprobada",
  regular: "Regular",
  cursando: "Cursando",
  libre: "Libre",
  none: "—",
};

const CONDICION_CLS: Record<string, string> = {
  aprobado: "text-secondary",
  regular: "text-tertiary",
  cursando: "text-primary",
  libre: "text-outline",
  none: "text-outline",
};

export function ImportarSysacadModal({ onClose, onImportado }: Props) {
  const [paso, setPaso] = useState<Paso>("pegar");
  const [texto, setTexto] = useState("");
  const [preview, setPreview] = useState<PreviewImportSysacad | null>(null);
  const [items, setItems] = useState<ItemImportMapeado[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportSysacad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reseteando, setReseteando] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  // Por defecto el pegado reemplaza el historial completo (es "tu estado académico actual").
  // Evita que se acumulen materias de importaciones previas (ej: electivas distintas).
  const [reemplazar, setReemplazar] = useState(true);
  // Plan completo para el selector manual: se pide una sola vez al abrir.
  const [materias, setMaterias] = useState<MateriaOut[]>([]);
  // Filas cuyo mapeo eligio el alumno a mano (para no mostrarles un % inventado).
  const [manuales, setManuales] = useState<Set<number>>(new Set());
  // Comision detectada por fila, para poder volver a activarla si la apagan.
  const [comisionesDetectadas, setComisionesDetectadas] = useState<(string | null)[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // El selector manual necesita el plan. Es publico y chico (~56 materias),
  // asi que se pide al montar y queda listo antes de llegar al preview.
  useEffect(() => {
    let vigente = true;
    listarMaterias()
      .then((lista) => { if (vigente) setMaterias(lista); })
      .catch(() => { /* sin plan el selector no aparece; el resto del flujo sigue */ });
    return () => { vigente = false; };
  }, []);

  // -------------------------------------------------------------------------
  // Paso 1 → 2: analizar texto
  // -------------------------------------------------------------------------
  const analizarTexto = async () => {
    if (!texto.trim()) return;
    setPaso("analizando");
    setError(null);
    try {
      const prev = await previewImportarSysacad(texto);
      setPreview(prev);
      setItems(prev.items);
      setComisionesDetectadas(prev.items.map((i) => i.comision_nombre));
      setManuales(new Set());
      setPaso("preview");
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: string })?.detail ?? err.message;
        setError(detail);
      } else {
        setError("Error inesperado al procesar el texto.");
      }
      setPaso("pegar");
    }
  };

  // -------------------------------------------------------------------------
  // Checkbox toggle
  // -------------------------------------------------------------------------
  const toggleImportar = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, importar: !item.importar } : item)),
    );
  };

  const toggleTodos = (valor: boolean) => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, importar: valor && item.materia_codigo !== null })),
    );
  };

  // -------------------------------------------------------------------------
  // Mapeo manual: el fuzzy matching no siempre acierta (nombres abreviados,
  // materias que cambiaron de nombre entre planes). Sin esto una fila mal
  // mapeada no tenia salida.
  // -------------------------------------------------------------------------
  const elegirMateria = (idx: number, codigo: string) => {
    const materia = materias.find((m) => m.codigo === codigo) ?? null;
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              materia_codigo: materia?.codigo ?? null,
              materia_nombre: materia?.nombre ?? null,
              // Elegida a mano: no hay score que mostrar. La UI lo dice.
              confianza: materia ? 1 : 0,
              importar: materia !== null,
            }
          : item,
      ),
    );
    setManuales((prev) => {
      const next = new Set(prev);
      if (materia) next.add(idx); else next.delete(idx);
      return next;
    });
  };

  // Apagar la comision detectada = importar la materia sin tocarle la grilla
  // de Horarios. El backend solo autoselecciona si `comision_nombre` viene.
  const toggleComision = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, comision_nombre: item.comision_nombre ? null : comisionesDetectadas[idx] }
          : item,
      ),
    );
  };

  // -------------------------------------------------------------------------
  // Paso 2 → 3: confirmar
  // -------------------------------------------------------------------------
  const confirmarImport = async () => {
    setPaso("confirmando");
    setError(null);
    try {
      const res = await confirmarImportarSysacad({ items, forzar: true, reemplazar });
      setResultado(res);
      setPaso("exito");
      onImportado?.();
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: string })?.detail ?? err.message;
        setError(detail);
      } else {
        setError("Error al guardar las materias.");
      }
      setPaso("preview");
    }
  };

  const itemsSeleccionados = items.filter((i) => i.importar).length;
  const totalConMatch = items.filter((i) => i.materia_codigo !== null).length;
  const sinMatch = items.filter((i) => !i.materia_codigo).length;
  const conComision = items.filter((i) => i.importar && i.comision_nombre).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface-container rounded-3xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-outline-variant/20 shrink-0">
          <div>
            <h2 id="modal-titulo" className="text-xl font-headline font-bold text-on-surface">
              Importar historial desde SYSACAD
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {paso === "pegar" || paso === "analizando"
                ? "Ctrl+A → Ctrl+C en Estado Académico, luego pegá acá"
                : paso === "exito"
                ? "Importación completada"
                : `${preview?.total_parseados ?? 0} materias detectadas · ${preview?.total_mapeados ?? 0} mapeadas`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="mt-0.5 w-9 h-9 rounded-xl bg-surface-container-highest/60 hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">

          {/* ── PASO 1: pegar texto ─────────────────────────────────────── */}
          {(paso === "pegar" || paso === "analizando") && (
            <>
              {/* Instrucciones */}
              <div className="rounded-2xl bg-primary/8 border border-primary/20 px-5 py-4 space-y-2">
                <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">info</span>
                  ¿Cómo copiar tu historial?
                </p>
                <ol className="text-xs text-on-surface-variant space-y-1 pl-6 list-decimal">
                  <li>Abrí SYSACAD e iniciá sesión</li>
                  <li>Andá a <strong className="text-on-surface">Estado Académico</strong></li>
                  <li>Presioná <kbd className="bg-surface-container-highest rounded px-1 text-on-surface font-mono">Ctrl+A</kbd> para seleccionar toda la página</li>
                  <li>Copiá con <kbd className="bg-surface-container-highest rounded px-1 text-on-surface font-mono">Ctrl+C</kbd></li>
                  <li>Pegá acá abajo con <kbd className="bg-surface-container-highest rounded px-1 text-on-surface font-mono">Ctrl+V</kbd></li>
                </ol>
              </div>

              {/* Borrar todas las notas */}
              <div className="flex items-center justify-between rounded-xl bg-error/6 border border-error/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-error/70">delete_sweep</span>
                  <span className="text-xs text-on-surface-variant">
                    ¿Querés empezar de cero antes de importar?
                  </span>
                </div>
                {!resetConfirm ? (
                  <button
                    type="button"
                    onClick={() => setResetConfirm(true)}
                    className="text-xs font-bold text-error hover:text-error/70 transition-colors shrink-0 ml-4"
                  >
                    Borrar todas las notas
                  </button>
                ) : (
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span className="text-xs text-error font-semibold">¿Seguro?</span>
                    <button
                      type="button"
                      disabled={reseteando}
                      onClick={async () => {
                        setReseteando(true);
                        try {
                          await resetearTodosRegistros();
                          onImportado?.(); // para que el grafo se refresque
                        } catch {
                          setError("No se pudo borrar. Intentá de nuevo.");
                        } finally {
                          setReseteando(false);
                          setResetConfirm(false);
                        }
                      }}
                      className="text-xs font-bold text-error border border-error/40 rounded-lg px-2.5 py-1 hover:bg-error/10 transition-colors disabled:opacity-50"
                    >
                      {reseteando ? "Borrando…" : "Sí, borrar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetConfirm(false)}
                      className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={(e) => { setTexto(e.target.value); setError(null); }}
                  placeholder={"Pegá acá el resultado del Ctrl+A → Ctrl+C sobre el Estado Académico de SYSACAD.\n\nNo importa si viene con encabezados o texto extra — lo filtramos automáticamente.\nSolo necesitamos las filas de materias, que tienen este formato:\n\n1\tMatemática\tAprobada con 9 (96 hs.) en 2022\n2\tAnálisis Matemático II\tAprobada con 7 en 2023\n3\tRedes de Datos\tCursa en 4K02 Aula 501\n4\tSistemas Operativos\tRegular"}
                  rows={10}
                  disabled={paso === "analizando"}
                  className="
                    w-full rounded-2xl bg-surface-container-low border border-outline-variant/30
                    focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30
                    px-4 py-3 text-xs text-on-surface font-mono resize-y
                    placeholder:text-outline/60 placeholder:font-sans
                    disabled:opacity-50 transition-colors
                  "
                />
                {texto && (
                  <button
                    type="button"
                    onClick={() => { setTexto(""); textareaRef.current?.focus(); }}
                    className="absolute top-3 right-3 text-outline hover:text-on-surface transition-colors"
                    title="Limpiar"
                  >
                    <span className="material-symbols-outlined text-[18px]">backspace</span>
                  </button>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-error/10 text-error px-4 py-3 text-sm">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {/* ── PASO 2: preview ─────────────────────────────────────────── */}
          {(paso === "preview" || paso === "confirmando") && preview && (
            <>
              {/* Chips de resumen */}
              <div className="flex flex-wrap gap-2">
                <StatChip icono="format_list_numbered" label={`${preview.total_parseados} detectadas`} />
                <StatChip icono="link" label={`${preview.total_mapeados} mapeadas`} cls="text-secondary" />
                {sinMatch > 0 && (
                  <StatChip icono="warning" label={`${sinMatch} sin match`} cls="text-tertiary" />
                )}
                {conComision > 0 && (
                  <StatChip
                    icono="event_available"
                    label={`${conComision} con comisión`}
                    cls="text-primary"
                  />
                )}
              </div>

              {/* Advertencias */}
              {preview.advertencias.length > 0 && (
                <div className="rounded-xl bg-tertiary/10 border border-tertiary/20 px-4 py-3 space-y-1">
                  {preview.advertencias.map((adv, i) => (
                    <p key={i} className="text-xs text-tertiary flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">warning</span>
                      {adv}
                    </p>
                  ))}
                </div>
              )}

              {/* Modo de importación: reemplazar vs. agregar */}
              <button
                type="button"
                onClick={() => setReemplazar((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  reemplazar
                    ? "bg-primary/8 border-primary/30"
                    : "bg-surface-container-low border-outline-variant/20 hover:border-outline-variant/40"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] shrink-0 ${
                    reemplazar ? "text-primary" : "text-outline"
                  }`}
                >
                  {reemplazar ? "toggle_on" : "toggle_off"}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-on-surface">
                    Reemplazar mi historial actual
                  </span>
                  <span className="block text-xs text-on-surface-variant mt-0.5">
                    {reemplazar
                      ? "Se borra lo que tengas cargado y queda solo lo de este pegado. Recomendado para no acumular materias viejas."
                      : "Se agrega/actualiza sobre lo que ya tenés. Puede dejar materias de importaciones anteriores (ej: electivas)."}
                  </span>
                </span>
              </button>

              {/* Tabla */}
              <div className="rounded-2xl border border-outline-variant/20 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-container-highest/50">
                      <th className="text-left px-4 py-3 text-on-surface-variant font-semibold w-[35%]">
                        Nombre en SYSACAD
                      </th>
                      <th className="text-left px-4 py-3 text-on-surface-variant font-semibold w-[30%]">
                        Materia en sistema
                      </th>
                      <th className="text-left px-4 py-3 text-on-surface-variant font-semibold">
                        Estado
                      </th>
                      <th className="text-left px-4 py-3 text-on-surface-variant font-semibold">
                        Nota
                      </th>
                      <th className="px-4 py-3 text-center">
                        {/* Checkbox global */}
                        <button
                          type="button"
                          onClick={() => toggleTodos(itemsSeleccionados < totalConMatch)}
                          className="text-primary hover:text-primary/70 transition-colors"
                          title="Marcar / desmarcar todas"
                        >
                          <span className="material-symbols-outlined text-[20px]">
                            {itemsSeleccionados === totalConMatch && totalConMatch > 0
                              ? "check_box"
                              : itemsSeleccionados > 0
                              ? "indeterminate_check_box"
                              : "check_box_outline_blank"}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {items.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          item.importar
                            ? "bg-surface-container-low hover:bg-surface-container"
                            : "opacity-50"
                        }`}
                      >
                        <td
                          className="px-4 py-2.5 text-on-surface-variant truncate max-w-0"
                          title={item.nombre_original}
                        >
                          {item.nombre_original}
                        </td>
                        <td className="px-4 py-2.5 max-w-0">
                          <MateriaCell
                            item={item}
                            materias={materias}
                            manual={manuales.has(idx)}
                            onElegir={(codigo) => elegirMateria(idx, codigo)}
                          />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`font-semibold ${CONDICION_CLS[item.condicion] ?? "text-outline"}`}>
                            {CONDICION_LABEL[item.condicion] ?? item.condicion}
                          </span>
                          {comisionesDetectadas[idx] && (
                            <ComisionChip
                              nombre={comisionesDetectadas[idx]!}
                              activa={item.comision_nombre !== null}
                              onToggle={() => toggleComision(idx)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {item.nota != null
                            ? <span className="font-semibold text-on-surface">{item.nota}</span>
                            : <span className="text-outline">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            disabled={!item.materia_codigo}
                            onClick={() => toggleImportar(idx)}
                            className="text-primary disabled:text-outline disabled:cursor-not-allowed transition-colors"
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {item.importar ? "check_box" : "check_box_outline_blank"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-error/10 text-error px-4 py-3 text-sm">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {/* ── PASO 3: éxito ───────────────────────────────────────────── */}
          {paso === "exito" && resultado && (
            <div className="flex flex-col items-center justify-center py-10 gap-5 text-center">
              <span className="material-symbols-outlined text-[72px] text-secondary material-symbols-filled">
                celebration
              </span>
              <div>
                <p className="text-2xl font-headline font-bold text-on-surface">
                  {resultado.importadas === 0
                    ? "Nada nuevo para importar"
                    : `¡${resultado.importadas} materia${resultado.importadas !== 1 ? "s" : ""} importada${resultado.importadas !== 1 ? "s" : ""}!`}
                </p>
                {resultado.omitidas > 0 && (
                  <p className="text-sm text-on-surface-variant mt-1">
                    {resultado.omitidas} omitida{resultado.omitidas !== 1 ? "s" : ""} (deseleccionadas o sin match)
                  </p>
                )}
                {resultado.comisiones_asignadas > 0 && (
                  <p className="text-sm text-primary mt-1 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">event_available</span>
                    {resultado.comisiones_asignadas} materia
                    {resultado.comisiones_asignadas !== 1 ? "s" : ""} ya
                    {resultado.comisiones_asignadas !== 1 ? " quedaron" : " quedó"} en tu grilla de Horarios.
                  </p>
                )}
                {resultado.eliminadas > 0 && (
                  <p className="text-sm text-on-surface-variant mt-1">
                    Se reemplazó tu historial anterior ({resultado.eliminadas} registro{resultado.eliminadas !== 1 ? "s" : ""} previo{resultado.eliminadas !== 1 ? "s" : ""}).
                  </p>
                )}
              </div>
              {resultado.errores.length > 0 && (
                <div className="w-full rounded-xl bg-error/10 text-error px-4 py-3 text-xs text-left">
                  <p className="font-semibold mb-1">Algunos errores al guardar:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-8 py-5 border-t border-outline-variant/20 bg-surface-container-low/40">
          <div>
            {paso === "preview" && (
              <button
                type="button"
                onClick={() => { setPaso("pegar"); setPreview(null); }}
                className="text-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Editar texto
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {paso === "exito" ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-primary text-on-primary px-6 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Cerrar
              </button>
            ) : paso === "preview" || paso === "confirmando" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarImport}
                  disabled={paso === "confirmando" || itemsSeleccionados === 0}
                  className="rounded-xl bg-primary text-on-primary px-6 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {paso === "confirmando" ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                      Guardando…
                    </span>
                  ) : (
                    `Importar ${itemsSeleccionados} materia${itemsSeleccionados !== 1 ? "s" : ""}`
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-5 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={analizarTexto}
                  disabled={!texto.trim() || paso === "analizando"}
                  className="rounded-xl bg-primary text-on-primary px-6 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {paso === "analizando" ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                      Analizando…
                    </span>
                  ) : (
                    "Analizar"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers de UI ──────────────────────────────────────────────────────────

function StatChip({
  icono,
  label,
  cls = "text-on-surface-variant",
}: {
  icono: string;
  label: string;
  cls?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container-highest/60 px-3 py-1 text-xs font-semibold ${cls}`}
    >
      <span className="material-symbols-outlined text-[14px]">{icono}</span>
      {label}
    </span>
  );
}

/**
 * Celda de mapeo. Muestra el match propuesto, o el selector del plan cuando no
 * hay match / la confianza es baja. Cualquier fila se puede corregir a mano.
 */
function MateriaCell({
  item,
  materias,
  manual,
  onElegir,
}: {
  item: ItemImportMapeado;
  materias: MateriaOut[];
  manual: boolean;
  onElegir: (codigo: string) => void;
}) {
  const dudoso = !item.materia_codigo || item.confianza < CONFIANZA_MINIMA;
  // Las dudosas arrancan con el selector a la vista; las buenas, sólo si el
  // alumno pide cambiarlas.
  const [abierto, setAbierto] = useState(false);
  const mostrarSelector = (abierto || dudoso) && materias.length > 0;

  if (mostrarSelector) {
    return (
      <div className="space-y-1">
        <select
          value={item.materia_codigo ?? ""}
          onChange={(e) => onElegir(e.target.value)}
          className="
            w-full rounded-lg bg-surface-container-low border border-outline-variant/40
            focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30
            px-2 py-1.5 text-xs text-on-surface transition-colors
          "
        >
          <option value="">— Elegir materia —</option>
          {materias.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.anio_carrera ? `${m.anio_carrera}° · ` : ""}{m.nombre}
            </option>
          ))}
        </select>
        {item.materia_codigo && !manual && (
          <span className="block text-[10px] text-tertiary">
            Sugerencia con {Math.round(item.confianza * 100)}% — revisala
          </span>
        )}
      </div>
    );
  }

  if (!item.materia_codigo) {
    return <span className="text-outline italic">Sin coincidencia</span>;
  }

  return (
    <div className="truncate" title={item.materia_nombre ?? ""}>
      <span className="text-on-surface">{item.materia_nombre}</span>
      <br />
      {manual ? (
        <span className="text-[10px] font-bold text-primary">elegida a mano</span>
      ) : (
        <ConfianzaBadge valor={item.confianza} />
      )}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="ml-2 text-[10px] font-semibold text-on-surface-variant hover:text-primary transition-colors"
      >
        cambiar
      </button>
    </div>
  );
}

/**
 * Comision que venia en el estado ("Cursa en 4K02"). Encendida, al importar se
 * deja elegida esa comision y la materia aparece en la grilla de Horarios.
 * Se puede apagar: la materia se importa igual, sin tocar la grilla.
 */
function ComisionChip({
  nombre,
  activa,
  onToggle,
}: {
  nombre: string;
  activa: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        activa
          ? `Se va a elegir la comisión ${nombre} en Horarios. Click para no hacerlo.`
          : `No se va a tocar tu horario. Click para elegir ${nombre}.`
      }
      className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border transition-colors ${
        activa
          ? "bg-primary/12 border-primary/30 text-primary hover:bg-primary/20"
          : "bg-transparent border-outline-variant/40 text-outline line-through hover:text-on-surface-variant"
      }`}
    >
      <span className="material-symbols-outlined text-[12px] no-underline">
        {activa ? "event_available" : "event_busy"}
      </span>
      {nombre}
    </button>
  );
}

function ConfianzaBadge({ valor }: { valor: number }) {
  const pct = Math.round(valor * 100);
  const cls =
    pct >= 90 ? "text-secondary" : pct >= 72 ? "text-tertiary" : "text-error";
  return <span className={`text-[10px] font-bold ${cls}`}>{pct}% match</span>;
}
