"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CorrelativaEdge, EstadoMateria, MateriaNodo } from "@/lib/types";
import { materiaIcon } from "@/lib/materiaIcon";
import { layoutGrafo, NODE_W, NODE_H, LABEL_Y } from "./layout";

interface Props {
  nodos: MateriaNodo[];
  edges: CorrelativaEdge[];
  atenuados: Set<string>;
  seleccionado: string | null;
  onSelect: (codigo: string | null) => void;
  onToggleEstado: (codigo: string, estadoActual: EstadoMateria) => void;
  onLongPress: (codigo: string) => void;
}

const ORDINAL: Record<number, string> = { 0: "Sin Año", 1: "1ro", 2: "2do", 3: "3er", 4: "4to", 5: "5to" };

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;

export function GrafoCanvas({
  nodos,
  edges,
  atenuados,
  seleccionado,
  onSelect,
  onToggleEstado,
  onLongPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitZoomRef = useRef(0.7);
  const fitPanRef  = useRef({ x: 0, y: 0 });

  // "Ver notas" vive dentro del canvas — no necesita subir al padre
  const [verNotas, setVerNotas] = useState(false);

  const layout = useMemo(() => layoutGrafo(nodos), [nodos]);

  const nodeEstados = useMemo(
    () => new Map(nodos.map((n) => [n.codigo, n.estado])),
    [nodos],
  );

  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || layout.width === 0) return;
    const { width, height } = el.getBoundingClientRect();
    const zoomX = (width - 80) / layout.width;
    const fit = parseFloat(Math.min(zoomX, 0.8).toFixed(2));
    const clamped = Math.max(0.6, fit);

    // Calcular panY para que el top del SVG arranque con 20px de margen.
    // Con pan=0 el SVG se centra. Si el zoom es alto (0.8) los labels
    // quedan justo en el borde superior → los empujamos hacia abajo.
    // SVG top en canvas = height/2 - (svgHeight * zoom / 2) + panY
    // Queremos SVG top = 20px → panY = 20 - height/2 + (svgHeight * zoom / 2)
    const panY = parseFloat((20 - height / 2 + (layout.height * clamped) / 2).toFixed(1));

    fitZoomRef.current = clamped;
    fitPanRef.current  = { x: 0, y: panY };
    setZoom(clamped);
    setPan({ x: 0, y: panY });
  }, [layout.width, layout.height]);

  const handleZoomIn  = () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));
  const handleReset   = () => { setZoom(fitZoomRef.current); setPan(fitPanRef.current); };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-nodo]")) return;
    dragState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current) return;
    setPan({
      x: dragState.current.panX + (e.clientX - dragState.current.x),
      y: dragState.current.panY + (e.clientY - dragState.current.y),
    });
  };
  const handleMouseUp = () => { dragState.current = null; };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[920px] bg-surface-container-lowest rounded-3xl overflow-hidden bg-blueprint group select-none border border-outline-variant/10 shadow-[inset_0_0_60px_rgba(9,9,11,0.6)]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: dragState.current ? "grabbing" : "grab" }}
    >
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="absolute top-1/2 left-1/2 will-change-transform"
        style={{
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: dragState.current ? "none" : "transform 200ms ease-out",
        }}
      >
        <defs>
          <marker id="arrow-regular" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#adc6ff" />
          </marker>
          <marker id="arrow-aprobada" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#ffb950" />
          </marker>
        </defs>

        {/* Etiquetas de columna por año */}
        {layout.columnas.map((col) => (
          <text
            key={`col-${col.anio}`}
            x={col.x + NODE_W / 2}
            y={LABEL_Y}
            textAnchor="middle"
            fill="var(--color-on-surface-variant, #a3a3a3)"
            fontSize="12"
            fontWeight="800"
            fontFamily="inherit"
            letterSpacing="0.08em"
          >
            {ORDINAL[col.anio] ?? `${col.anio}ro`} {col.anio !== 0 ? "Año" : ""}
          </text>
        ))}

        {/* Edges */}
        <g>
          {edges.map((edge, i) => {
            const desde = layout.posiciones.get(edge.desde);
            const hacia = layout.posiciones.get(edge.hacia);
            if (!desde || !hacia) return null;

            const x1 = desde.x + NODE_W;
            const y1 = desde.y + NODE_H / 2;
            const x2 = hacia.x;
            const y2 = hacia.y + NODE_H / 2;
            const cx = Math.max(40, (x2 - x1) / 2);

            const srcEstado = nodeEstados.get(edge.desde);
            const isActive =
              edge.tipo === "aprobada"
                ? srcEstado === "aprobado"
                : srcEstado === "regular" || srcEstado === "cursando" || srcEstado === "aprobado";

            const stroke    = edge.tipo === "aprobada" ? "#ffb950" : "#adc6ff";
            const marker    = edge.tipo === "aprobada" ? "url(#arrow-aprobada)" : "url(#arrow-regular)";
            const isAtenuado = atenuados.has(edge.desde) || atenuados.has(edge.hacia);
            const fade      = isAtenuado ? 0.1 : isActive ? 1 : 0.25;
            const strokeW   = isActive && !isAtenuado ? 2.2 : 1.4;

            return (
              <path
                key={`edge-${i}`}
                d={`M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW}
                opacity={fade}
                markerEnd={marker}
              />
            );
          })}
        </g>

        {/* Nodos */}
        {nodos.map((nodo) => {
          const pos = layout.posiciones.get(nodo.codigo);
          if (!pos) return null;
          return (
            <foreignObject
              key={nodo.codigo}
              x={pos.x}
              y={pos.y}
              width={NODE_W}
              height={NODE_H}
              style={{ overflow: "visible" }}
            >
              <NodoCard
                nodo={nodo}
                selected={seleccionado === nodo.codigo}
                atenuado={atenuados.has(nodo.codigo)}
                verNotas={verNotas}
                onClick={() => {
                  if (verNotas) return;
                  onSelect(nodo.codigo);
                  onToggleEstado(nodo.codigo, nodo.estado);
                }}
                onLongPress={() => onLongPress(nodo.codigo)}
              />
            </foreignObject>
          );
        })}
      </svg>

      {/* ── Modo notas: hint minimalista (solo cuando está activo) ─── */}
      {verNotas && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-surface-container-lowest/70 backdrop-blur-md border border-outline-variant/10 text-[9px] text-outline/50 font-label tracking-widest uppercase pointer-events-none select-none whitespace-nowrap">
          Modo notas · tocá «Ocultar notas» para cambiar estados
        </div>
      )}

      {/* ── Toggle «Ver notas» flotante (top-right dentro del canvas) ──── */}
      <button
        type="button"
        onClick={() => setVerNotas((v) => !v)}
        className={[
          "absolute top-5 right-5 z-10",
          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold border transition-all duration-200 shadow-md",
          verNotas
            ? "bg-secondary/25 border-secondary/50 text-secondary backdrop-blur-md shadow-secondary/10"
            : "bg-surface-container-low/95 border-outline-variant/30 text-on-surface hover:border-primary/40 hover:text-primary backdrop-blur-md",
        ].join(" ")}
      >
        <span className={`material-symbols-outlined text-[18px] ${verNotas ? "" : "material-symbols-filled"}`}>
          {verNotas ? "visibility_off" : "grade"}
        </span>
        {verNotas ? "Ocultar notas" : "Ver notas"}
      </button>

      {/* ── Controles de zoom (bottom-right) ──────────────────────────── */}
      <div className="absolute bottom-5 right-5 flex flex-col gap-1 bg-surface-container-lowest/90 backdrop-blur-md p-1.5 rounded-xl border border-outline-variant/15 z-10 shadow-lg">
        <ZoomBtn icon="add" onClick={handleZoomIn} aria-label="Zoom in" />
        <ZoomBtn icon="remove" onClick={handleZoomOut} aria-label="Zoom out" />
        <div className="w-full h-px bg-outline-variant/20 my-0.5" />
        <ZoomBtn icon="fit_screen" onClick={handleReset} aria-label="Fit view" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function ZoomBtn({
  icon,
  onClick,
  ...rest
}: { icon: string; onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-10 h-10 flex items-center justify-center hover:bg-primary/20 rounded-lg text-on-surface transition-colors"
      {...rest}
    >
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}

const ESTADO_STYLES: Record<
  MateriaNodo["estado"],
  { glow: string; iconColor: string; icon: string; progress: string; backColor: string; backLabel: string }
> = {
  aprobado: {
    glow: "node-glow-approved",
    iconColor: "text-secondary",
    icon: "check_circle",
    progress: "bg-secondary w-full",
    backColor: "#7dffa2",
    backLabel: "Aprobada",
  },
  regular: {
    glow: "node-glow-regular",
    iconColor: "text-tertiary",
    icon: "schedule",
    progress: "bg-tertiary w-4/5",
    backColor: "#ffb950",
    backLabel: "Regular",
  },
  cursando: {
    glow: "node-glow-cursando",
    iconColor: "text-primary",
    icon: "play_circle",
    progress: "bg-primary w-1/2",
    backColor: "#adc6ff",
    backLabel: "Cursando",
  },
  cursable: {
    glow: "node-glow-cursable",
    iconColor: "text-primary",
    icon: "bolt",
    progress: "w-0",
    backColor: "#adc6ff",
    backLabel: "Cursable",
  },
  libre: {
    glow: "node-locked",
    iconColor: "text-outline",
    icon: "lock",
    progress: "w-0",
    backColor: "#737373",
    backLabel: "Bloqueada",
  },
};

const TOGGLEABLES: ReadonlySet<EstadoMateria> = new Set(["cursable", "cursando", "regular", "aprobado"]);

function NodoCard({
  nodo,
  selected,
  atenuado,
  verNotas,
  onClick,
  onLongPress,
}: {
  nodo: MateriaNodo;
  selected: boolean;
  atenuado: boolean;
  verNotas: boolean;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const style = ESTADO_STYLES[nodo.estado];
  const toggleable = TOGGLEABLES.has(nodo.estado) && !verNotas;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const startLongPress = () => {
    if (verNotas) return;
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 800);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleClick = () => {
    if (didLongPress.current || verNotas) return;
    onClick();
  };

  const frontCls = [
    "absolute inset-0 rounded-xl transition-all duration-200",
    "bg-surface-container-high p-3.5",
    style.glow,
    atenuado ? "opacity-25" : "opacity-100",
    toggleable ? "cursor-pointer hover:scale-[1.03]" : "cursor-default",
    selected && !verNotas ? "scale-[1.04] ring-2 ring-primary" : "",
  ].join(" ");

  return (
    <div
      data-nodo={nodo.codigo}
      className="w-full h-full"
      style={{ perspective: "600px" }}
      onClick={handleClick}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !verNotas) { e.preventDefault(); onClick(); }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Inner girador */}
      <div
        className="relative w-full h-full"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1)",
          transform: verNotas ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* ── FRENTE: ícono de materia + nombre + icono de estado ────── */}
        <div className={frontCls} style={{ backfaceVisibility: "hidden" }}>
          {/* Fila superior: ícono de materia (izq) + icono de estado (der) */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60">
              {materiaIcon(nodo.nombre)}
            </span>
            <span
              className={`material-symbols-outlined text-[16px] ${style.iconColor} ${
                nodo.estado === "aprobado" ? "material-symbols-filled" : ""
              }`}
            >
              {style.icon}
            </span>
          </div>

          {/* Nombre — protagonista */}
          <h3 className="text-[12.5px] font-bold leading-snug text-on-surface line-clamp-3 mb-2">
            {nodo.nombre}
          </h3>

          {/* Barra de progreso */}
          <div className="w-full bg-surface-dim h-[3px] rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${style.progress}`} />
          </div>
        </div>

        {/* ── REVERSO: estado + nota ─────────────────────────────────── */}
        <div
          className={[
            "absolute inset-0 rounded-xl px-3 py-2",
            "bg-surface-container-high",
            style.glow,
            atenuado ? "opacity-25" : "opacity-100",
            "flex flex-col items-center justify-center gap-1.5",
          ].join(" ")}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {/* Nombre — protagonista también en el reverso */}
          <p className="text-[12.5px] font-bold text-on-surface text-center leading-snug line-clamp-2 w-full">
            {nodo.nombre}
          </p>

          {/* Badge de estado */}
          <span
            className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
            style={{ color: style.backColor, backgroundColor: `${style.backColor}22` }}
          >
            {style.backLabel}
          </span>

          {/* Nota — solo aprobadas */}
          {nodo.estado === "aprobado" && nodo.nota != null && (
            <p className="text-[22px] font-black leading-none" style={{ color: style.backColor }}>
              {nodo.nota}
            </p>
          )}
          {nodo.estado === "aprobado" && nodo.nota == null && (
            <p className="text-[9px] text-outline italic">sin nota</p>
          )}
        </div>
      </div>
    </div>
  );
}
