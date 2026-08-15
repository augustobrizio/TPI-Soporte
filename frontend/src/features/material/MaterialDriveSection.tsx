"use client";

import { useEffect, useMemo, useState } from "react";

const ROOT_FOLDER_ID = "1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ";

const MATERIAL_HIGHLIGHTS = [
  { label: "1 a 5 año", icon: "school" },
  { label: "Materias", icon: "menu_book" },
  { label: "Resúmenes", icon: "description" },
  { label: "Parciales y finales", icon: "quiz" },
] as const;

interface DriveItem {
  id: string;
  name: string;
  type: "folder" | "file";
  mimeType: string;
  openUrl: string;
  previewUrl: string | null;
}

interface DriveFolderResponse {
  folderId: string;
  openUrl: string;
  items: DriveItem[];
  fetchedAt: string;
}

interface FolderCrumb {
  id: string;
  name: string;
}

function getFileIcon(item: DriveItem) {
  if (item.type === "folder") return "folder";
  if (item.mimeType.includes("pdf")) return "picture_as_pdf";
  if (item.mimeType.includes("spreadsheet")) return "table";
  if (item.mimeType.includes("presentation")) return "co_present";
  if (item.mimeType.includes("wordprocessing")) return "article";
  if (item.mimeType.startsWith("image")) return "image";
  return "description";
}

function getFileBadge(item: DriveItem) {
  if (item.type === "folder") return "Carpeta";
  if (item.mimeType.includes("pdf")) return "PDF";
  if (item.mimeType.includes("spreadsheet")) return "Planilla";
  if (item.mimeType.includes("presentation")) return "Presentación";
  if (item.mimeType.includes("wordprocessing")) return "Documento";
  if (item.mimeType.startsWith("image")) return "Imagen";
  return "Archivo";
}

export function MaterialDriveSection() {
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([
    { id: ROOT_FOLDER_ID, name: "UTN" },
  ]);
  const [foldersCache, setFoldersCache] = useState<Record<string, DriveFolderResponse>>({});
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = folderStack[folderStack.length - 1];
  const currentData = foldersCache[currentFolder.id];
  const driveUrl = currentData?.openUrl ?? `https://drive.google.com/drive/folders/${currentFolder.id}`;

  useEffect(() => {
    let cancelled = false;

    async function loadFolder() {
      if (foldersCache[currentFolder.id]) {
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/material/drive?folderId=${currentFolder.id}`);
        const data = (await response.json()) as DriveFolderResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in data && data.error ? data.error : "No se pudo leer Drive");
        }

        if (!cancelled) {
          setFoldersCache((prev) => ({
            ...prev,
            [currentFolder.id]: data as DriveFolderResponse,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el material");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFolder();

    return () => {
      cancelled = true;
    };
  }, [currentFolder.id, foldersCache]);

  const filteredItems = useMemo(() => {
    const items = currentData?.items ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
  }, [currentData?.items, query]);

  function openFolder(item: DriveItem) {
    setSelectedFile(null);
    setQuery("");
    setFolderStack((prev) => [...prev, { id: item.id, name: item.name }]);
  }

  function goToCrumb(index: number) {
    setSelectedFile(null);
    setQuery("");
    setFolderStack((prev) => prev.slice(0, index + 1));
  }

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-blueprint px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="card-3d relative overflow-hidden rounded-2xl bg-surface-container-low/80 px-5 py-6 ring-1 ring-outline-variant/10 sm:px-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgb(var(--glow-primary)/0.14),transparent_55%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
                <span className="icon-chip chip-primary flex h-8 w-8 items-center justify-center rounded-xl text-primary">
                  <span className="material-symbols-outlined text-[17px]">sync</span>
                </span>
                Fuente viva desde Google Drive
              </div>
              <h1 className="font-headline text-4xl font-black tracking-tight text-on-surface sm:text-5xl">
                Material de estudio
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-on-surface-variant">
                Navegá el Drive compartido desde UTNHub, sin salir a otra pestaña
                al abrir carpetas. Los archivos siguen viviendo en Drive y se
                actualizan automáticamente.
              </p>
            </div>

            <a
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-on-secondary transition-opacity hover:opacity-90"
            >
              Abrir carpeta en Drive
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            </a>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MATERIAL_HIGHLIGHTS.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl bg-surface-container/80 px-4 py-3 ring-1 ring-outline-variant/10"
            >
              <span className="material-symbols-outlined text-[20px] text-tertiary">
                {item.icon}
              </span>
              <span className="text-sm font-semibold text-on-surface-variant">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="overflow-hidden rounded-2xl bg-surface-container-low ring-1 ring-outline-variant/10">
            <div className="flex flex-col gap-4 border-b border-outline-variant/10 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-on-surface">Biblioteca compartida</h2>
                  <p className="text-xs text-outline">
                    Entrá a carpetas, buscá material y previsualizá archivos desde acá.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                  <span className="material-symbols-outlined text-[15px]">update</span>
                  Actualización automática
                </span>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <nav className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-outline">
                  {folderStack.map((crumb, index) => (
                    <div key={crumb.id} className="flex min-w-0 items-center gap-1">
                      {index > 0 && (
                        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                      )}
                      <button
                        type="button"
                        onClick={() => goToCrumb(index)}
                        className={[
                          "max-w-[180px] truncate rounded-lg px-2 py-1 transition-colors",
                          index === folderStack.length - 1
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-surface-container-high hover:text-on-surface",
                        ].join(" ")}
                      >
                        {crumb.name}
                      </button>
                    </div>
                  ))}
                </nav>

                <div className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 ring-1 ring-outline-variant/10 lg:w-72">
                  <span className="material-symbols-outlined text-[17px] text-outline">search</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-on-surface-variant outline-none placeholder:text-outline/60"
                    placeholder="Buscar en esta carpeta"
                    type="search"
                  />
                </div>
              </div>
            </div>

            <div className="min-h-[520px] p-4">
              {loading && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-28 rounded-xl bg-surface-container cal-skel"
                    />
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl bg-surface-container/70 px-6 text-center">
                  <span className="material-symbols-outlined text-[36px] text-error">cloud_off</span>
                  <h3 className="mt-3 text-base font-bold text-on-surface">
                    No se pudo cargar esta carpeta
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-outline">{error}</p>
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-on-surface px-4 py-2 text-sm font-bold text-surface"
                  >
                    Abrir en Drive
                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  </a>
                </div>
              )}

              {!loading && !error && filteredItems.length === 0 && (
                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl bg-surface-container/70 px-6 text-center">
                  <span className="material-symbols-outlined text-[36px] text-outline">folder_off</span>
                  <h3 className="mt-3 text-base font-bold text-on-surface">
                    No hay resultados
                  </h3>
                  <p className="mt-1 text-sm text-outline">
                    Probá con otra búsqueda o volvé a una carpeta anterior.
                  </p>
                </div>
              )}

              {!loading && !error && filteredItems.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (item.type === "folder" ? openFolder(item) : setSelectedFile(item))}
                      className={[
                        "group flex min-h-28 flex-col justify-between rounded-xl bg-surface-container p-4 text-left ring-1 transition-all",
                        selectedFile?.id === item.id
                          ? "ring-primary/50"
                          : "ring-outline-variant/10 hover:bg-surface-container-high hover:ring-primary/25",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={[
                            "material-symbols-outlined text-[28px]",
                            item.type === "folder" ? "text-tertiary" : "text-primary",
                          ].join(" ")}
                          style={item.type === "folder" ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        >
                          {getFileIcon(item)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-sm font-bold text-on-surface">
                            {item.name}
                          </h3>
                          <p className="mt-1 text-xs text-outline">{getFileBadge(item)}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-outline">
                        <span>{item.type === "folder" ? "Entrar" : "Previsualizar"}</span>
                        <span className="material-symbols-outlined text-[17px] transition-transform group-hover:translate-x-0.5">
                          {item.type === "folder" ? "arrow_forward" : "visibility"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="overflow-hidden rounded-2xl bg-surface-container-low ring-1 ring-outline-variant/10">
            <div className="border-b border-outline-variant/10 px-4 py-3">
              <h2 className="text-sm font-bold text-on-surface">Vista previa</h2>
              <p className="text-xs text-outline">
                Seleccioná un archivo para verlo sin perder la navegación.
              </p>
            </div>

            {selectedFile?.previewUrl ? (
              <div className="flex h-[640px] flex-col">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-on-surface">
                    {selectedFile.name}
                  </p>
                  <a
                    href={selectedFile.openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"
                  >
                    Drive
                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                  </a>
                </div>
                <iframe
                  src={selectedFile.previewUrl}
                  title={`Vista previa de ${selectedFile.name}`}
                  className="min-h-0 flex-1 bg-surface"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="flex h-[360px] flex-col items-center justify-center px-6 text-center xl:h-[640px]">
                <span className="material-symbols-outlined text-[42px] text-outline">
                  preview
                </span>
                <h3 className="mt-3 text-base font-bold text-on-surface">
                  Sin archivo seleccionado
                </h3>
                <p className="mt-1 max-w-xs text-sm text-outline">
                  Las carpetas se abren en la lista. Los archivos se muestran acá
                  cuando Drive permite previsualizarlos.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
