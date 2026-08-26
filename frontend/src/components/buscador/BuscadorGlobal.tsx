"use client";

/**
 * Buscador global de la barra superior (command palette).
 *
 * Tres piezas que se usan juntas: `BuscadorProvider` guarda el estado y
 * monta el diálogo y el atajo de teclado, `BuscadorBarra` es el disparador
 * ancho de escritorio y `BuscadorBoton` el de ícono para pantallas chicas.
 * Están separadas porque los dos disparadores viven en extremos distintos de
 * la barra y un solo componente no puede renderizarse en dos lugares.
 *
 * No usa el `DialogContent` compartido: ese centra el panel en la pantalla y
 * le pone una ✕ en la esquina, que acá caería justo sobre el campo de texto.
 * Un command palette se ancla arriba (el ojo ya está ahí cuando lo abrís) y
 * se cierra con Escape, así que se arma sobre las primitivas de Radix con los
 * mismos tokens `--shell-*` que el resto del shell.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Contact,
  CornerDownLeft,
  Megaphone,
  Network,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ItemBusqueda, RespuestaBusqueda, TipoResultado } from "@/lib/types";

/** Espejo de `busqueda_service.LARGO_MINIMO`: abajo de esto no se consulta. */
const LARGO_MINIMO = 2;

/**
 * Retardo del debounce. 180 ms es el punto donde deja de dispararse una
 * request por tecla sin que la lista se sienta lenta al tipear.
 */
const RETARDO_MS = 180;

interface Grupo {
  clave: "materias" | "profesores" | "comisiones" | "novedades";
  label: string;
  icono: LucideIcon;
}

/**
 * Orden de los grupos en la lista. Es el mismo criterio que la sidebar:
 * primero lo académico, después la gente, después lo circunstancial.
 */
const GRUPOS: readonly Grupo[] = [
  { clave: "materias", label: "Materias", icono: Network },
  { clave: "profesores", label: "Profesores", icono: Contact },
  { clave: "comisiones", label: "Comisiones", icono: Users },
  { clave: "novedades", label: "Novedades", icono: Megaphone },
] as const;

/**
 * A dónde lleva cada resultado.
 *
 * Vive en el frontend y no en el backend porque es conocimiento de ruteo: el
 * backend devuelve `tipo` + `id` y no tiene por qué enterarse de que un
 * profesor se mira en `/profesores/{id}`.
 */
function hrefDeResultado(item: ItemBusqueda): string {
  switch (item.tipo) {
    case "materia":
      // El `tipo` va explícito: el grafo se arma por tipo y una electiva no
      // existe en el de troncales. Si el backend no lo sabe, troncal es el
      // que la página abre por defecto.
      return `/materias?tipo=${item.tipo_materia ?? "troncal"}&codigo=${encodeURIComponent(item.id)}`;
    case "profesor":
      return `/profesores/${encodeURIComponent(item.id)}`;
    case "comision":
      return `/comisiones?comision=${encodeURIComponent(item.id)}`;
    case "novedad":
      return `/novedades?novedad=${encodeURIComponent(item.id)}`;
  }
}

// ---------------------------------------------------------------------------
// Estado compartido entre los disparadores y el diálogo
// ---------------------------------------------------------------------------
const Ctx = createContext<{ abrir: () => void }>({ abrir: () => {} });

const useBuscador = () => useContext(Ctx);

// ---------------------------------------------------------------------------
// Consulta al backend
// ---------------------------------------------------------------------------
interface EstadoBusqueda {
  datos: RespuestaBusqueda | null;
  cargando: boolean;
  error: boolean;
}

function useBusqueda(query: string, activo: boolean): EstadoBusqueda {
  const [estado, setEstado] = useState<EstadoBusqueda>({
    datos: null,
    cargando: false,
    error: false,
  });

  useEffect(() => {
    const q = query.trim();
    if (!activo || q.length < LARGO_MINIMO) {
      setEstado({ datos: null, cargando: false, error: false });
      return;
    }

    // El controller cancela la request en vuelo cuando se sigue tipeando: sin
    // esto, una respuesta lenta de hace tres teclas puede pisar a la actual.
    const controller = new AbortController();
    setEstado((prev) => ({ ...prev, cargando: true }));

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const datos = (await res.json()) as RespuestaBusqueda;
        setEstado({ datos, cargando: false, error: false });
      } catch {
        // Una request abortada no es un error que mostrar: es una búsqueda
        // que el usuario reemplazó por otra, y la nueva ya puso `cargando`.
        if (controller.signal.aborted) return;
        setEstado({ datos: null, cargando: false, error: true });
      }
    }, RETARDO_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activo]);

  return estado;
}

// ---------------------------------------------------------------------------
// Provider + diálogo
// ---------------------------------------------------------------------------
export function BuscadorProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const abrir = useCallback(() => setAbierto(true), []);

  // ⌘K / Ctrl+K desde cualquier lado. `preventDefault` porque en Firefox
  // Ctrl+K enfoca la barra de búsqueda del navegador.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAbierto((a) => !a);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Ctx.Provider value={{ abrir }}>
      {children}
      <PaletteDialog abierto={abierto} onOpenChange={setAbierto} />
    </Ctx.Provider>
  );
}

function PaletteDialog({
  abierto,
  onOpenChange,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activo, setActivo] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const { datos, cargando, error } = useBusqueda(query, abierto);

  // Grupos no vacíos, en el orden declarado.
  const grupos = useMemo(() => {
    if (!datos) return [];
    return GRUPOS.map((g) => ({ ...g, items: datos[g.clave] })).filter(
      (g) => g.items.length > 0,
    );
  }, [datos]);

  // Lista plana: la navegación con flechas cruza los grupos como si fueran
  // una sola lista, que es lo que espera cualquiera que use un palette.
  const planos = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);

  // Al cambiar los resultados el índice viejo puede apuntar a otra cosa (o a
  // nada): se vuelve al primero.
  useEffect(() => setActivo(0), [planos]);

  // Cada apertura arranca limpia. Si no, el palette reabre con la búsqueda
  // anterior y hay que borrarla a mano antes de escribir.
  useEffect(() => {
    if (!abierto) {
      setQuery("");
      setActivo(0);
    }
  }, [abierto]);

  // Mantener el item activo a la vista cuando se navega con el teclado.
  useEffect(() => {
    const nodo = listaRef.current?.querySelector<HTMLElement>(
      `[data-indice="${activo}"]`,
    );
    nodo?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const ir = useCallback(
    (item: ItemBusqueda) => {
      onOpenChange(false);
      router.push(hrefDeResultado(item));
    },
    [onOpenChange, router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (planos.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (i + 1) % planos.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (i - 1 + planos.length) % planos.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = planos[activo];
      if (item) ir(item);
    }
  }

  const consultaCorta = query.trim().length < LARGO_MINIMO;
  let indice = -1;

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm transition-opacity duration-150 data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content
          className={[
            // Anclado arriba (no centrado): el palette se abre donde ya está
            // mirando el ojo después de apretar ⌘K.
            "fixed left-1/2 top-[12vh] z-[70] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] shadow-2xl",
            "transition-all duration-150",
            "data-[state=open]:scale-100 data-[state=open]:opacity-100",
            "data-[state=closed]:scale-95 data-[state=closed]:opacity-0",
          ].join(" ")}
          // El foco lo maneja el `autoFocus` del input; sin esto Radix enfoca
          // el contenedor y la primera tecla se pierde.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            Buscar en UTNHub
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Buscá materias, profesores, comisiones y novedades. Navegá con las
            flechas y abrí con Enter.
          </DialogPrimitive.Description>

          {/* Campo */}
          <div className="flex items-center gap-3 border-b border-[var(--shell-border)] px-4">
            <Search
              className="h-[18px] w-[18px] shrink-0 text-[var(--shell-fg-dim)]"
              strokeWidth={1.75}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar materias, profesores, comisiones..."
              className="min-w-0 flex-1 border-none bg-transparent py-3.5 text-sm text-[var(--shell-fg)] placeholder:text-[var(--shell-fg-dim)] focus:outline-none"
              role="combobox"
              aria-expanded={planos.length > 0}
              aria-controls="resultados-busqueda"
              aria-activedescendant={
                planos.length > 0 ? `resultado-${activo}` : undefined
              }
            />
            {cargando && (
              <span
                className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[var(--shell-border)] border-t-[#1CA4DF]"
                aria-hidden
              />
            )}
          </div>

          {/* Resultados */}
          <div
            ref={listaRef}
            id="resultados-busqueda"
            role="listbox"
            aria-label="Resultados"
            className="max-h-[min(60vh,26rem)] overflow-y-auto py-2"
          >
            {consultaCorta ? (
              <Mensaje texto="Escribí al menos dos letras para buscar." />
            ) : error ? (
              <Mensaje texto="No se pudo buscar. Probá de nuevo en un momento." />
            ) : planos.length === 0 ? (
              cargando ? (
                <Mensaje texto="Buscando..." />
              ) : (
                <Mensaje texto={`No encontramos nada para "${query.trim()}".`} />
              )
            ) : (
              grupos.map((grupo) => (
                <div key={grupo.clave} className="mb-1 last:mb-0">
                  <p className="px-4 py-1.5 font-label text-[10px] uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
                    {grupo.label}
                  </p>
                  {grupo.items.map((item) => {
                    indice += 1;
                    return (
                      <Resultado
                        key={`${item.tipo}-${item.id}`}
                        item={item}
                        icono={grupo.icono}
                        indice={indice}
                        activo={indice === activo}
                        onHover={setActivo}
                        onElegir={ir}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Pie con las teclas. No es decoración: es lo que le enseña al
              usuario que la lista se maneja sin sacar la mano del teclado. */}
          <div className="flex items-center gap-4 border-t border-[var(--shell-border)] px-4 py-2 text-[11px] text-[var(--shell-fg-dim)]">
            <span className="flex items-center gap-1.5">
              <Tecla>↑</Tecla>
              <Tecla>↓</Tecla>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <Tecla>
                <CornerDownLeft className="h-3 w-3" strokeWidth={2} />
              </Tecla>
              abrir
            </span>
            <span className="flex items-center gap-1.5">
              <Tecla>esc</Tecla>
              cerrar
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Resultado({
  item,
  icono: Icono,
  indice,
  activo,
  onHover,
  onElegir,
}: {
  item: ItemBusqueda;
  icono: LucideIcon;
  indice: number;
  activo: boolean;
  onHover: (i: number) => void;
  onElegir: (item: ItemBusqueda) => void;
}) {
  return (
    <button
      type="button"
      id={`resultado-${indice}`}
      data-indice={indice}
      role="option"
      aria-selected={activo}
      onMouseMove={() => onHover(indice)}
      onClick={() => onElegir(item)}
      className={[
        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
        activo ? "bg-[var(--shell-hover)]" : "bg-transparent",
      ].join(" ")}
    >
      <Icono
        className={[
          "h-[18px] w-[18px] shrink-0",
          activo ? "text-[var(--shell-accent-fg)]" : "text-[var(--shell-fg-dim)]",
        ].join(" ")}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--shell-fg)]">
          {item.titulo}
        </span>
        {item.detalle && (
          <span className="mt-0.5 block truncate text-[11px] text-[var(--shell-fg-dim)]">
            {item.detalle}
          </span>
        )}
      </span>
    </button>
  );
}

function Mensaje({ texto }: { texto: string }) {
  return (
    <p className="px-4 py-8 text-center text-[13px] text-[var(--shell-fg-dim)]">
      {texto}
    </p>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-[var(--shell-border)] px-1 font-label text-[9px] text-[var(--shell-fg-dim)]">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Disparadores
// ---------------------------------------------------------------------------

/**
 * Barra ancha de escritorio. Es un `<button>` y no un `<input>`: el campo de
 * verdad está en el diálogo, y un input que al enfocarse abre otro input
 * duplica el foco y confunde a los lectores de pantalla.
 */
export function BuscadorBarra({ className = "" }: { className?: string }) {
  const { abrir } = useBuscador();
  return (
    <button
      type="button"
      onClick={abrir}
      className={[
        "hidden w-72 items-center gap-2 rounded-lg border border-[var(--shell-border)] bg-[var(--shell-hover)] px-3 py-1.5 text-left transition-colors hover:border-[#1CA4DF]/40 md:flex",
        className,
      ].join(" ")}
    >
      <Search
        className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)]"
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--shell-fg-dim)]">
        Buscar materias, profesores...
      </span>
      <kbd className="hidden shrink-0 items-center rounded border border-[var(--shell-border)] px-1 py-0.5 font-label text-[9px] text-[var(--shell-fg-dim)] lg:inline-flex">
        ⌘K
      </kbd>
    </button>
  );
}

/** Disparador de ícono para pantallas donde la barra ancha no entra. */
export function BuscadorBoton() {
  const { abrir } = useBuscador();
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Buscar"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] md:hidden"
    >
      <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}
