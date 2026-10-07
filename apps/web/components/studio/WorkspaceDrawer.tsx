"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A single placeable media thumbnail resolved to a blob/data URL `src`.
export interface MediaTile {
  key: string;
  label: string;
  src: string;
  /** Stable catalog/asset id carried onto the canvas node (entry-<id> / asset-<id>). */
  catalogItemId: string;
  /** Stable storage object key, persisted on the node so its src survives a reload. */
  objectKey?: string;
  /** Media kind — a video tile previews with a <video> and places as a poster. Defaults to image. */
  kind?: "image" | "video";
  /** Natural placement size on the canvas (keeps the card's aspect). Defaults to a square. */
  width?: number;
  height?: number;
}

export interface MediaGroup {
  id: string;
  title: string;
  kind: "collection" | "uploads" | "generated";
  tiles: MediaTile[];
}

// The MIME key used to carry a media tile from the drawer onto the canvas via native drag-drop.
export const MEDIA_DND_TYPE = "application/x-walsh-media";

interface Props {
  open: boolean;
  onToggle: () => void;
  groups: MediaGroup[];
  /** Click-to-place a tile on the active scene. */
  onPlace: (tile: MediaTile) => void;
  /** The + menu actions. */
  onAddCollection: () => void;
  onUpload: () => void;
  onGenerate: () => void;
  loading?: boolean;
  /** False when the studio has no project open yet (nothing to add media to). */
  hasProject?: boolean;
}

const KIND_ICON: Record<MediaGroup["kind"], ReactNode> = {
  collection: (
    <>
      <path d="M3 7h6l2 2h10v9a2 2 0 01-2 2H3z" />
    </>
  ),
  uploads: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  generated: (
    <>
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" />
    </>
  ),
};

/**
 * The Design Studio's left media drawer — the UI representation of the workspace's
 * `reference_content` (collections + uploads + generated). A professional gallery: each group is
 * collapsible; every tile can be clicked to place it on the active scene, or dragged onto the
 * canvas. The `+` menu adds a collection, uploads a file, or generates media with AI.
 */
export default function WorkspaceDrawer({
  open,
  onToggle,
  groups,
  onPlace,
  onAddCollection,
  onUpload,
  onGenerate,
  loading = false,
  hasProject = true,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  return (
    // The whole rig is anchored to the left boundary of the workspace and slides left→right. When
    // closed it shifts a panel-width left so only the semicircle handle pokes out at the edge.
    <div
      className={`pointer-events-none absolute bottom-4 left-0 top-20 z-30 flex items-stretch transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "-translate-x-72"
      }`}
    >
      <aside className="pointer-events-auto flex w-72 flex-col overflow-hidden rounded-r-xl border border-l-0 border-walshe-line/70 bg-chrome-bg/95 shadow-xl backdrop-blur-md">
      {/* Header: title + add menu. */}
      <header className="flex flex-none items-center gap-2 border-b border-walshe-line/70 px-3 py-2.5">
        <h2 className="text-small font-bold text-walshe-ink">Media library</h2>
        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            aria-label="Add media"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="grid h-7 w-7 place-items-center rounded-lg bg-walshe-teal text-white transition-colors hover:bg-walshe-teal/90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-10 w-48 overflow-hidden rounded-lg border border-walshe-line bg-walshe-base py-1 shadow-lift">
              {[
                { label: "Add a collection", fn: onAddCollection, icon: <path d="M3 7h6l2 2h10v9a2 2 0 01-2 2H3z" /> },
                { label: "Upload an image", fn: onUpload, icon: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></> },
                { label: "Generate with AI", fn: onGenerate, icon: <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" /> },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => { setMenuOpen(false); a.fn(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-small text-walshe-ink transition-colors hover:bg-walshe-ink/5"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-walshe-grey">
                    {a.icon}
                  </svg>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Body: grouped gallery. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 py-6 text-center text-small text-walshe-grey">Loading media…</p>
        ) : !hasProject ? (
          <div className="px-3 py-8 text-center">
            <p className="text-small font-medium text-walshe-ink">No project open</p>
            <p className="mt-1 text-[12px] text-walshe-grey">
              Start a project from a collection to load its media here, then add uploads or AI media.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-small font-medium text-walshe-ink">No media yet</p>
            <p className="mt-1 text-[12px] text-walshe-grey">
              Use the + to add a collection, upload an image, or generate one with AI.
            </p>
          </div>
        ) : (
          groups.map((g) => {
            const isCollapsed = collapsed[g.id];
            return (
              <section key={g.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-walshe-ink/5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-walshe-grey">
                    {KIND_ICON[g.kind]}
                  </svg>
                  <span className="truncate text-[12px] font-bold uppercase tracking-wide text-walshe-grey">
                    {g.title}
                  </span>
                  <span className="text-[11px] text-walshe-grey">{g.tiles.length}</span>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    className={`ml-auto text-walshe-grey transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {!isCollapsed && (
                  g.tiles.length === 0 ? (
                    <p className="px-2 pb-2 pt-0.5 text-[11px] text-walshe-grey">Empty.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 px-1 pb-2 pt-1">
                      {g.tiles.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              MEDIA_DND_TYPE,
                              JSON.stringify({
                                src: t.src,
                                catalogItemId: t.catalogItemId,
                                objectKey: t.objectKey,
                                kind: t.kind,
                                width: t.width,
                                height: t.height,
                              }),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => onPlace(t)}
                          title={`${t.label} — click or drag onto the canvas`}
                          className="group relative aspect-square overflow-hidden rounded-md border border-walshe-line bg-walshe-stone/40 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-walshe-teal"
                        >
                          {t.kind === "video" ? (
                            <>
                              <video src={t.src} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                                <span className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                                </span>
                              </span>
                            </>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.src}
                              alt={t.label}
                              draggable={false}
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-walshe-deep/80 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                            {t.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                )}
              </section>
            );
          })
        )}
      </div>

      <footer className="flex-none border-t border-walshe-line/70 px-3 py-2 text-[11px] text-walshe-grey">
        Click a tile to place it · or drag onto the canvas
      </footer>
      </aside>

      {/* Semicircle handle on the left boundary: pokes out when closed, becomes the close grip when
          open. Clicking slides the panel left↔right. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Close media drawer" : "Open media drawer"}
        title={open ? "Hide media" : "Show media"}
        className="pointer-events-auto relative -ml-px self-center flex h-16 w-7 items-center justify-center rounded-r-full border border-l-0 border-walshe-line/70 bg-chrome-bg/95 text-walshe-ink shadow-xl backdrop-blur-md transition-colors hover:bg-walshe-ink/5"
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
