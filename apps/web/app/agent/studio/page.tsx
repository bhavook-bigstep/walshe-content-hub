"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Canvas } from "fabric";
import type { StudioControls } from "../../../components/studio/StudioCanvas";
import type { BuilderCatalogItem } from "../../../components/studio/BuilderPanel";
import StudioBottomDock from "../../../components/studio/StudioBottomDock";
import StudioRightRail from "../../../components/studio/StudioRightRail";
import StudioMenuBar from "../../../components/studio/StudioMenuBar";
import SceneEdgeControls, { type SceneRect } from "../../../components/studio/SceneEdgeControls";
import type { CatalogImageOption } from "../../../components/studio/Toolbar";
import WorkspaceDrawer, {
  MEDIA_DND_TYPE,
  type MediaGroup,
  type MediaTile,
} from "../../../components/studio/WorkspaceDrawer";
import Dialog from "../../../components/ui/Dialog";
import Link from "next/link";
import {
  createProject,
  fetchAssetObjectUrl,
  generateLibraryMedia,
  getBrandKit,
  getProject,
  getWorkspace,
  listCollections,
  listDesignTemplates,
  renderVideoFrames,
  resolveCollection,
  saveWorkspace,
  updateProject,
  uploadLibraryMedia,
  type AssetRef,
  type BrandKit,
  type Collection,
  type Entry,
  type UserAsset,
  type WorkspaceIn,
  type WorkspaceResolved,
} from "../../../lib/api";
import { applyBrandKit } from "../../../lib/studio/branding";
import { composeEntryCard } from "../../../lib/studio/entry-card";
import { resolveDesignImageSrcs } from "../../../lib/studio/resolve-images";
import { resolveSprites } from "../../../lib/studio/graphics";
import { renderDesignFrames, EXPORT_FPS } from "../../../lib/studio/frames";
import { getFormatPreset, isFormatName, type FormatName } from "../../../lib/studio/formats";
import {
  DEFAULT_SCENE_DURATION_MS,
  addCatalogImage,
  deleteNode,
  duplicateNode,
  editText,
  fillImageNode,
  isPlaceholder,
  groupNodes,
  setGroupAnim,
  ungroupNodes,
  updateGroupStyle,
  type EnterType,
  migrateDesign,
  moveNode,
  newDesign,
  reorderNode,
  speakableCues,
  resizeNode,
  setNodeAnim,
  updateNode,
  type DesignDoc,
  type DesignNode,
  type LayerMove,
  type NodeAnimation,
  type NodeStyle,
} from "../../../lib/studio/ops";
import Inspector from "../../../components/studio/Inspector";
import GroupPanel from "../../../components/studio/GroupPanel";

// Fabric touches `window` at import time, so the canvas must never render on the server.
const StudioCanvas = dynamic(() => import("../../../components/studio/StudioCanvas"), { ssr: false });


// Map an approved catalog entry to the panel item shape; its cover (or first asset) becomes the
// image, resolved from the MinIO/S3 object key via the authed asset gate.
async function toPanelItem(e: Entry): Promise<BuilderCatalogItem> {
  const item: BuilderCatalogItem = { id: e.id, title: e.title, destination: e.destination, description: e.description };
  const key = e.cover_object_key || e.asset_keys[0];
  if (key) {
    try {
      item.imageSrc = await fetchAssetObjectUrl(key);
    } catch {
      // Image is optional; the item still submits its real id.
    }
  }
  return item;
}

// Collapse a resolved workspace back to the reference-only shape the PUT /workspace endpoint
// expects (AC75): entries → {entry_id,title,type}; assets pass through as refs; scenes = the
// current design's scenes. Metadata follows the live format the user is editing in.
function toWorkspaceIn(ws: WorkspaceResolved, design: DesignDoc): WorkspaceIn {
  const fmt = isFormatName(design.format) ? design.format : "social";
  const dims = getFormatPreset(fmt);
  return {
    metadata: { ...ws.metadata, format: fmt, width: dims.width, height: dims.height },
    reference_content: {
      collections: (ws.reference_content.collections ?? []).map((c) => ({
        collection_id: c.collection_id,
        name: c.name,
        // Carry the entry's media links (S3/MinIO keys). The server re-enriches on save, but sending
        // them keeps the reference_content self-consistent and satisfies the contract shape.
        entries: (c.entries ?? []).map((e) => ({
          entry_id: e.id,
          title: e.title,
          type: e.type,
          cover_object_key: e.cover_object_key ?? "",
          media_keys: e.asset_keys ?? [],
        })),
      })),
      uploads: ws.reference_content.uploads ?? [],
      generated: ws.reference_content.generated ?? [],
    },
    scenes: design.scenes as unknown as Record<string, unknown>[],
  };
}

// A library asset the agent just added becomes a workspace AssetRef (reference only).
function assetToRef(a: UserAsset): AssetRef {
  return {
    asset_id: a.id,
    object_key: a.object_key,
    kind: a.kind,
    content_type: a.content_type,
    title: a.title,
    source: a.source,
  };
}

// A fresh design starts empty (a blank artboard) — the agent adds their own content, or opens a
// template/collection that brings its own.
function seeded(format: FormatName): DesignDoc {
  return newDesign(format);
}

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="text-small text-walshe-grey">Loading the studio…</p>}>
      <StudioEditor />
    </Suspense>
  );
}

function StudioEditor() {
  const [design, setDesign] = useState<DesignDoc>(() => seeded("social"));
  // The selected element (for the Inspector). Scene-scoped by index + node id.
  const [selected, setSelected] = useState<{ scene: number; nodeId: string } | null>(null);
  // The full selection (one id = single element; many = a group / multi-selection) + its scene.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  // A photo placeholder awaiting a pick from the media drawer (set when one is clicked).
  const [fillTarget, setFillTarget] = useState<{ scene: number; nodeId: string } | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [panelItems, setPanelItems] = useState<BuilderCatalogItem[] | null>(null);
  // AC63 — the studio's usable media = the project's collection items + local uploads + AI media,
  // never the whole catalog. `mediaReload` bumps to re-pull after an upload/generate.
  const [mediaReload, setMediaReload] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [addCollectionOpen, setAddCollectionOpen] = useState(false);
  // The left media drawer = the UI representation of reference_content (collections/uploads/generated).
  const [gallery, setGallery] = useState<MediaGroup[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // AC75 — the structured workspace (resolved): the single input the studio reads for grounding +
  // placeable media (collection entries + uploads + generated) and autosaves back.
  const [workspace, setWorkspace] = useState<WorkspaceResolved | null>(null);
  const [project, setProject] = useState<{ id: number; name: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [videoMsg, setVideoMsg] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  // The active scene's on-screen rect, so the per-scene edge controls can hug its edges.
  const [sceneRect, setSceneRect] = useState<SceneRect | null>(null);
  // Workspace tool (CorelDraw-style): "select" rubber-bands a marquee on empty-drag; "hand" pans.
  const [tool, setTool] = useState<"select" | "hand">("select");
  // The agent's brand kit, fetched lazily on first apply — powers one-click "Apply brand kit" (AC87).
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);
  // Whether a scene is selected (clicking the empty workspace deselects → hides the scene controls).
  const [sceneSelected, setSceneSelected] = useState(true);
  // Animation preview transport (active scene): playing + playhead (ms from the scene start).
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  // Add a voiceover (TTS) to the exported video, reading each scene's narration script.
  const [narrate, setNarrate] = useState(false);
  // Editable project name (rename).
  const [nameDraft, setNameDraft] = useState("");
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get("project");
  const hasProject = Boolean(projectId);
  const canvasRef = useRef<Canvas | null>(null);
  const controlsRef = useRef<StudioControls | null>(null);

  // Load the usable media from the project's structured workspace (AC75): collection entries
  // (builder grounding + placeable images) + the project's own uploads/generated assets. The whole
  // catalog is intentionally NOT loaded here (AC63); media is scoped to this workspace.
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const pid = params.get("project");
    async function load() {
      const imgs: CatalogImageOption[] = [];
      const items: BuilderCatalogItem[] = [];
      const groups: MediaGroup[] = [];
      if (pid) {
        try {
          const ws = await getWorkspace(Number(pid));
          if (!cancelled) setWorkspace(ws);
          // Each collection → a gallery group. Every entry's default item is a composed "card"
          // (the catalog entry-window visual rendered to an image) that drops onto the canvas; the
          // raw cover still grounds the builder.
          for (const c of ws.reference_content.collections ?? []) {
            const entries = c.entries ?? [];
            const cItems = await Promise.all(entries.map(toPanelItem));
            items.push(...cItems);
            const tiles: MediaTile[] = [];
            for (let i = 0; i < entries.length; i++) {
              const e = entries[i];
              const cover = cItems[i]?.imageSrc;
              if (cover) urls.push(cover);
              // The entry's "card" (window visual) — the default droppable item.
              const cardSrc = await composeEntryCard(e, cover);
              if (cardSrc) {
                const id = `entry-${e.id}`;
                imgs.push({ catalogItemId: id, label: e.title, src: cardSrc });
                tiles.push({ key: id, label: e.title, src: cardSrc, catalogItemId: id, width: 432, height: 540 });
              }
              // The entry's own image items (its contained media) — each individually droppable.
              for (const it of e.items ?? []) {
                if (it.kind !== "image" || !it.object_key) continue;
                try {
                  const src = await fetchAssetObjectUrl(it.object_key);
                  urls.push(src);
                  const id = `item-${it.id}`;
                  imgs.push({ catalogItemId: id, label: it.title || e.title, src });
                  tiles.push({ key: id, label: it.title || e.title, src, catalogItemId: id, objectKey: it.object_key });
                } catch {
                  /* item image optional */
                }
              }
            }
            groups.push({
              id: `collection-${c.collection_id}`,
              title: c.name || "Collection",
              kind: "collection",
              tiles,
            });
          }
          // Uploads + AI-generated assets → their own groups.
          const assetGroups: Array<[MediaGroup["kind"], typeof ws.reference_content.uploads, string]> = [
            ["uploads", ws.reference_content.uploads ?? [], "Uploads"],
            ["generated", ws.reference_content.generated ?? [], "AI generated"],
          ];
          for (const [kind, refs, title] of assetGroups) {
            const tiles: MediaTile[] = [];
            for (const a of refs ?? []) {
              if (!a.object_key || (a.kind !== "image" && a.kind !== "video")) continue;
              try {
                const src = await fetchAssetObjectUrl(a.object_key);
                urls.push(src);
                const id = `asset-${a.asset_id}`;
                if (a.kind === "image") imgs.push({ catalogItemId: id, label: a.title || a.source, src });
                tiles.push({ key: id, label: a.title || title, src, catalogItemId: id, objectKey: a.object_key, kind: a.kind });
              } catch {
                /* asset optional */
              }
            }
            groups.push({ id: kind, title, kind, tiles });
          }
        } catch {
          /* workspace optional (e.g. a template draft with no project yet) */
        }
      }
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setPanelItems(items);
      void imgs;
      setGallery(groups);
    }
    void load();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // Re-run when the media changes OR when the open project changes (client-side nav after
    // creating a project from a collection must repopulate the drawer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaReload, projectId]);
  const onReady = useCallback((c: Canvas | null) => {
    canvasRef.current = c;
  }, []);

  function pickFormat(format: FormatName) {
    getFormatPreset(format);
    setDesign(seeded(format));
    setSceneIndex(0);
  }

  // Open a saved project (?project=id) or start from a template (?template=id) (AC31). Re-runs when
  // the project id changes so creating a project in-place (client nav) loads it.
  useEffect(() => {
    const pid = projectId;
    const tid = params.get("template");
    if (pid) {
      let cancelled = false;
      getProject(Number(pid))
        .then(async (p) => {
          if (cancelled) return;
          setProject({ id: p.id, name: p.name });
          // Migrate the stored design into the canonical scenes[] shape (handles legacy pages[]),
          // then expand any template sprite references (sprite id → frames/fps) so video templates
          // animate on load.
          const base = migrateDesign(p.design);
          if (!base) return;
          const migrated = resolveSprites(base);
          setSceneIndex(0);
          setDesign(migrated);
          // Placed media stored an ephemeral blob: URL that is dead now; re-resolve each image from
          // its stable object key so the media reappears (AC75).
          const resolved = await resolveDesignImageSrcs(migrated, fetchAssetObjectUrl);
          if (!cancelled) setDesign(resolved);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    } else if (tid) {
      listDesignTemplates()
        .then((templates) => {
          const t = templates.find((x) => x.id === tid);
          if (!t) return;
          const fmt: FormatName = isFormatName(t.format) ? t.format : "social";
          pickFormat(fmt);
          setProject({ id: 0, name: `${t.name} (template)` });
        })
        .catch(() => {});
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep the rename field in sync when a different project opens.
  useEffect(() => {
    setNameDraft(project?.name ?? "");
  }, [project?.id]);

  // Debounced autosave: whenever the design changes, persist the whole workspace (scenes + name).
  // No manual "Save" button — the workspace engine stores it (AC75).
  useEffect(() => {
    if (!(project && project.id > 0 && workspace)) return;
    const timer = setTimeout(async () => {
      try {
        const saved = await saveWorkspace(project.id, toWorkspaceIn(workspace, design));
        setWorkspace(saved);
        setSaveMsg("Saved");
      } catch {
        /* a transient failure retries on the next edit */
      }
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design]);

  // Rename the current project (workspace). Persists immediately for a saved project.
  async function commitRename() {
    const name = nameDraft.trim();
    if (!project || !name || name === project.name) {
      setNameDraft(project?.name ?? "");
      return;
    }
    setProject({ ...project, name });
    // Also update the workspace metadata name: the autosave sends metadata.name, and the server
    // sets project.name from it — without this, the next autosave reverts the rename to the stale
    // workspace name (AC75).
    setWorkspace((w) => (w ? { ...w, metadata: { ...w.metadata, name } } : w));
    if (project.id > 0) {
      try {
        await updateProject(project.id, { name });
      } catch {
        /* keep the local name; next autosave carries it */
      }
    }
  }

  // AC75 — media added in the studio is stored on the workspace (uploads/generated), then the
  // workspace is autosaved so it stays a complete, structured record.
  async function onMediaAdded(assets: UserAsset[], kind: "uploads" | "generated") {
    const refs = assets.map(assetToRef);

    // No project yet → create a blank one, attach the media, and open it (so the drawer shows it).
    if (!(project && project.id > 0 && workspace)) {
      try {
        const created = await createProject({ name: "Untitled project", format: design.format });
        const ws = await getWorkspace(created.id);
        const next: WorkspaceResolved = {
          ...ws,
          reference_content: {
            ...ws.reference_content,
            [kind]: [...(ws.reference_content[kind] ?? []), ...refs],
          },
        };
        await saveWorkspace(created.id, toWorkspaceIn(next, design));
        router.push(`/agent/studio?project=${created.id}`);
      } catch {
        setMediaReload((n) => n + 1);
      }
      return;
    }

    const next: WorkspaceResolved = {
      ...workspace,
      reference_content: {
        ...workspace.reference_content,
        [kind]: [...(workspace.reference_content[kind] ?? []), ...refs],
      },
    };
    try {
      const saved = await saveWorkspace(project.id, toWorkspaceIn(next, design));
      setWorkspace(saved);
    } catch {
      /* keep the local view; the reload below still surfaces the asset */
    }
    setMediaReload((n) => n + 1);
  }

  // Place a media tile on the active scene. From a click it lands centred in the default spot; from
  // a drop it lands where the cursor released (mapped to scene-local coords by the canvas).
  function placeTile(tile: MediaTile, at?: { x: number; y: number }) {
    // If a media placeholder is awaiting a pick, FILL it in place rather than adding a new node.
    if (fillTarget && !at) {
      const target = fillTarget;
      setFillTarget(null);
      setDesign((d) =>
        fillImageNode(d, target.scene, target.nodeId, {
          src: tile.src,
          objectKey: tile.objectKey,
          catalogItemId: tile.catalogItemId,
          kind: tile.kind,
        }),
      );
      return;
    }
    const w = tile.width ?? 420;
    const h = tile.height ?? 420;
    setDesign((d) => {
      // Dropped → centre on the cursor. Clicked → cascade down-right off the existing node count so
      // repeated placements don't land exactly on top of each other.
      let placement: { x: number; y: number; width: number; height: number };
      if (at) {
        placement = { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h };
      } else {
        const n = d.scenes[sceneIndex]?.nodes.length ?? 0;
        const off = (n % 8) * 28;
        placement = { x: 80 + off, y: 80 + off, width: w, height: h };
      }
      return addCatalogImage(
        d,
        sceneIndex,
        { src: tile.src, catalogItemId: tile.catalogItemId, objectKey: tile.objectKey, videoKey: tile.kind === "video" ? tile.objectKey : undefined, kind: tile.kind },
        placement,
      );
    });
  }

  function onCanvasDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData(MEDIA_DND_TYPE);
    if (!raw) return;
    e.preventDefault();
    try {
      const t = JSON.parse(raw) as {
        src: string;
        catalogItemId: string;
        objectKey?: string;
        kind?: "image" | "video";
        width?: number;
        height?: number;
      };
      const pt = controlsRef.current?.clientToScenePoint(e.clientX, e.clientY) ?? undefined;
      placeTile(
        { key: t.catalogItemId, label: "", src: t.src, catalogItemId: t.catalogItemId, objectKey: t.objectKey, kind: t.kind, width: t.width, height: t.height },
        pt,
      );
    } catch {
      /* ignore a malformed payload */
    }
  }

  // Attach an existing collection to this workspace (append to reference_content.collections + save).
  // With no project open yet, create one from the chosen collection and open it.
  async function attachCollection(collectionId: number) {
    if (!(project && project.id > 0 && workspace)) {
      try {
        const resolved = await resolveCollection(collectionId);
        const created = await createProject({
          name: resolved.name || "Untitled project",
          format: design.format,
          collection_id: collectionId,
        });
        router.push(`/agent/studio?project=${created.id}`);
      } catch {
        /* noop */
      }
      return;
    }
    if ((workspace.reference_content.collections ?? []).some((c) => c.collection_id === collectionId)) return;
    try {
      const resolved = await resolveCollection(collectionId);
      const next: WorkspaceResolved = {
        ...workspace,
        reference_content: {
          ...workspace.reference_content,
          collections: [
            ...(workspace.reference_content.collections ?? []),
            { collection_id: resolved.id, name: resolved.name, entries: resolved.items },
          ],
        },
      };
      const saved = await saveWorkspace(project.id, toWorkspaceIn(next, design));
      setWorkspace(saved);
      setMediaReload((n) => n + 1);
    } catch {
      /* non-fatal; the drawer stays as-is */
    }
  }

  // AC78 — WYSIWYG video: rasterise each animated scene frame-by-frame with the shared engine
  // (so the MP4 matches the canvas preview), post the frames, and download the stitched video.
  async function generateVideo() {
    setVideoMsg(null);
    setRendering(true);
    try {
      // Stop any running preview so it doesn't fight the offscreen frame render.
      setPlaying(false);
      stopRaf();
      controlsRef.current?.previewAt(null);
      setPlayhead(0);

      const sceneFrames = await renderDesignFrames(design, EXPORT_FPS);
      const body = {
        fps: EXPORT_FPS,
        narrate,
        scenes: design.scenes.map((s, i) => ({
          title: s.name,
          caption: (s.nodes.find((n) => n.type === "text" && n.text?.trim())?.text ?? "").slice(0, 200),
          narration: speakableCues(s).map((c) => ({ at_ms: c.atMs, text: c.text.slice(0, 300) })),
          duration_ms: s.durationMs,
          transition: s.transition,
          frames: sceneFrames[i].frames,
        })),
      };
      const blob = await renderVideoFrames(body);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `walsh-${design.format}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setVideoMsg("Video ready.");
    } catch {
      setVideoMsg("Video rendering unavailable.");
    } finally {
      setRendering(false);
    }
  }

  function onNodeChange(
    scene: number,
    nodeId: string,
    box: { x: number; y: number; width: number; height: number },
  ) {
    setDesign((d) => {
      try {
        const moved = moveNode(d, scene, nodeId, box.x, box.y);
        return box.width > 0 && box.height > 0
          ? resizeNode(moved, scene, nodeId, box.width, box.height)
          : moved;
      } catch {
        return d; // ignore a drag the model can't apply (e.g. a removed node)
      }
    });
  }

  function onNodeDelete(scene: number, nodeId: string) {
    setDesign((d) => {
      try {
        return deleteNode(d, scene, nodeId);
      } catch {
        return d; // already gone
      }
    });
    setSelected((s) => (s && s.nodeId === nodeId ? null : s));
  }

  // The currently-selected node (resolved from the live design), for the Inspector.
  const selectedNode: DesignNode | null =
    (selected && design.scenes[selected.scene]?.nodes.find((n) => n.id === selected.nodeId)) || null;

  function patchSelected(patch: Partial<NodeStyle>) {
    if (!selected) return;
    setDesign((d) => {
      try {
        return updateNode(d, selected.scene, selected.nodeId, patch);
      } catch {
        return d;
      }
    });
  }

  function onTextEdit(scene: number, nodeId: string, text: string) {
    setDesign((d) => {
      try {
        return editText(d, scene, nodeId, text);
      } catch {
        return d;
      }
    });
  }

  function duplicateSelected() {
    if (!selected) return;
    setDesign((d) => {
      try {
        return duplicateNode(d, selected.scene, selected.nodeId);
      } catch {
        return d;
      }
    });
  }

  function layerSelected(move: LayerMove) {
    if (!selected) return;
    setDesign((d) => {
      try {
        return reorderNode(d, selected.scene, selected.nodeId, move);
      } catch {
        return d;
      }
    });
  }

  function animSelected(anim: NodeAnimation | undefined) {
    if (!selected) return;
    setDesign((d) => {
      try {
        return setNodeAnim(d, selected.scene, selected.nodeId, anim);
      } catch {
        return d;
      }
    });
  }

  // ── Grouping ──────────────────────────────────────────────────────────────────────────────────
  // The group id shared by the whole selection (null when the selection isn't a single group).
  const selectedGroupId: string | null = (() => {
    if (selectedScene === null || selectedIds.length < 2) return null;
    const nodes = design.scenes[selectedScene]?.nodes ?? [];
    const gids = selectedIds.map((id) => nodes.find((n) => n.id === id)?.groupId);
    return gids[0] && gids.every((g) => g === gids[0]) ? gids[0]! : null;
  })();

  function groupSelected() {
    if (selectedScene === null || selectedIds.length < 2) return;
    setDesign((d) => groupNodes(d, selectedScene, selectedIds));
  }
  function ungroupSelected() {
    if (selectedScene === null || !selectedGroupId) return;
    setDesign((d) => ungroupNodes(d, selectedScene, selectedGroupId));
  }
  function groupAnim(enter: EnterType | null, loop: NodeAnimation["loop"]) {
    if (selectedScene === null || !selectedGroupId) return;
    setDesign((d) => setGroupAnim(d, selectedScene, selectedGroupId, enter, loop));
  }
  function groupOpacity(opacity: number) {
    if (selectedScene === null || !selectedGroupId) return;
    setDesign((d) => updateGroupStyle(d, selectedScene, selectedGroupId, { opacity }));
  }

  // ── Animation preview transport (play/scrub the active scene's animation) ──────────────────────
  const sceneDurRef = useRef(DEFAULT_SCENE_DURATION_MS);
  sceneDurRef.current = design.scenes[sceneIndex]?.durationMs ?? DEFAULT_SCENE_DURATION_MS;
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<{ wall: number; base: number }>({ wall: 0, base: 0 });

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const playLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame((ts) => {
      const { wall, base } = playStartRef.current;
      const dur = sceneDurRef.current;
      let t = base + (ts - wall);
      // Loop the preview for the whole scene: when the playhead reaches the end, wrap back to the
      // start and keep running (so sprite animations keep cycling until the user pauses).
      if (t >= dur) {
        playStartRef.current = { wall: ts, base: 0 };
        t = 0;
      }
      setPlayhead(t);
      controlsRef.current?.previewAt(t, { playing: true });
      playLoop();
    });
  }, [stopRaf]);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      stopRaf();
      return;
    }
    const start = playhead >= sceneDurRef.current ? 0 : playhead;
    playStartRef.current = { wall: performance.now(), base: start };
    setPlayhead(start);
    setPlaying(true);
    playLoop();
  }

  function scrub(t: number) {
    if (playing) {
      setPlaying(false);
      stopRaf();
    }
    setPlayhead(t);
    controlsRef.current?.previewAt(t > 0 ? t : null);
  }

  // Reset the transport (back to the editable, static layout) when the active scene changes.
  useEffect(() => {
    setPlaying(false);
    stopRaf();
    setPlayhead(0);
    controlsRef.current?.previewAt(null);
  }, [sceneIndex, stopRaf]);

  // Cancel any running animation frame on unmount.
  useEffect(() => stopRaf, [stopRaf]);

  // One-click apply of the brand kit's aesthetics (palette · fonts · logo · contact). The kit is
  // fetched lazily on first click and cached, so no on-mount request races the canvas setup.
  const applyBrand = useCallback(async () => {
    setBrandBusy(true);
    try {
      let kit = brandKit;
      if (!kit) {
        kit = await getBrandKit();
        setBrandKit(kit);
      }
      // Resolve an owner-only /assets logo to a displayable blob now; keep the objectKey so the
      // node re-resolves on reload. An external URL is used as-is.
      let logo: { src: string; objectKey?: string } | undefined;
      if (kit!.logo_url) {
        const url = kit!.logo_url;
        if (url.startsWith("/assets/")) {
          const key = url.replace(/^\/assets\//, "");
          try {
            logo = { src: await fetchAssetObjectUrl(key), objectKey: key };
          } catch {
            logo = undefined;
          }
        } else {
          logo = { src: url };
        }
      }
      setDesign((d) =>
        applyBrandKit(d, {
          primary: kit!.primary_color,
          accent: kit!.accent_color,
          headingFont: kit!.heading_font,
          bodyFont: kit!.body_font,
          logo,
          contact: {
            name: kit!.contact_name ?? undefined,
            email: kit!.contact_email ?? undefined,
            website: kit!.website ?? undefined,
          },
        }),
      );
    } catch {
      /* brand kit unavailable — leave the design unchanged */
    } finally {
      setBrandBusy(false);
    }
  }, [brandKit]);

  // Tool shortcuts (CorelDraw/Figma-style): V = Select, H = Hand. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "h" || e.key === "H") setTool("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zoomBtn =
    "grid h-8 w-8 place-items-center rounded-sm text-walshe-ink transition-colors hover:bg-walshe-ink/10";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* The dot-matrix workspace spans the whole studio, edge to edge. Media dragged from the
          left drawer drops here and lands at the cursor on the active scene. */}
      <div
        className="absolute inset-0"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(MEDIA_DND_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onCanvasDrop}
      >
        <StudioCanvas
          design={design}
          activeScene={sceneIndex}
          onReady={onReady}
          onNodeChange={onNodeChange}
          onNodeDelete={onNodeDelete}
          onSelectScene={(i) => {
            setSceneIndex(i);
            setSceneSelected(true);
          }}
          onBackgroundClick={() => {
            setSceneSelected(false);
            setSelected(null);
            setSelectedIds([]);
            setSelectedScene(null);
            setFillTarget(null);
          }}
          onSelect={(scene, nodeIds) => {
            if (nodeIds.length) setSceneSelected(true); // working in a scene re-selects it
            setSelectedScene(scene);
            setSelectedIds(nodeIds);
            setSelected(scene !== null && nodeIds.length === 1 ? { scene, nodeId: nodeIds[0] } : null);
            // Clicking a photo placeholder opens the media drawer so the next pick fills it.
            const node = scene !== null && nodeIds.length === 1
              ? design.scenes[scene]?.nodes.find((n) => n.id === nodeIds[0])
              : undefined;
            if (node && isPlaceholder(node) && scene !== null) {
              setFillTarget({ scene, nodeId: node.id });
              setDrawerOpen(true);
            } else {
              setFillTarget(null);
            }
          }}
          onTextEdit={onTextEdit}
          onControls={(c) => (controlsRef.current = c)}
          selectedNodeId={selected?.nodeId ?? null}
          onActiveSceneRect={setSceneRect}
          highlightActive={sceneSelected}
          tool={tool}
        />

        {/* One-click brand kit: palette · fonts · logo · contact applied across the design (AC87).
            The kit is fetched lazily on click (caching afterwards) so it never races canvas init. */}
        <button
          type="button"
          onClick={applyBrand}
          title="Apply your brand kit's colours, fonts, logo and contact to this design"
          className="pointer-events-auto absolute bottom-20 left-5 z-30 flex items-center gap-2 rounded-xl border border-walshe-line/70 bg-chrome-bg/95 px-3.5 py-2.5 text-small font-semibold text-walshe-ink shadow-lift backdrop-blur-md transition-colors hover:bg-walshe-ink/5 disabled:opacity-60"
          disabled={brandBusy}
        >
          <span className="flex -space-x-1" aria-hidden>
            <span className="h-4 w-4 rounded-full border border-white" style={{ background: brandKit?.primary_color ?? "#0E6B5E" }} />
            <span className="h-4 w-4 rounded-full border border-white" style={{ background: brandKit?.accent_color ?? "#F3C96B" }} />
          </span>
          {brandBusy ? "Applying…" : "Apply brand kit"}
        </button>

        {/* Tool switch (CorelDraw-style): Select rubber-bands a marquee; Hand pans. Keys V / H. */}
        <div className="pointer-events-auto absolute bottom-5 left-5 z-30 flex overflow-hidden rounded-xl border border-walshe-line/70 bg-chrome-bg/95 shadow-lift backdrop-blur-md">
          <button
            type="button"
            aria-label="Select tool"
            aria-pressed={tool === "select"}
            title="Select — drag a box to select (V)"
            onClick={() => setTool("select")}
            className={`grid h-10 w-10 place-items-center transition-colors ${tool === "select" ? "bg-walshe-teal text-white" : "text-walshe-grey hover:bg-walshe-ink/10"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 3l15 9-6 1.5L17 20l-2.5 1-3-6.5L7 18z" /></svg>
          </button>
          <button
            type="button"
            aria-label="Hand tool"
            aria-pressed={tool === "hand"}
            title="Hand — drag to pan the workspace (H, or hold Space)"
            onClick={() => setTool("hand")}
            className={`grid h-10 w-10 place-items-center border-l border-walshe-line/70 transition-colors ${tool === "hand" ? "bg-walshe-teal text-white" : "text-walshe-grey hover:bg-walshe-ink/10"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 11V6a1.5 1.5 0 00-3 0M15 6V4.5a1.5 1.5 0 00-3 0V6m0 0V5a1.5 1.5 0 00-3 0v7M9 12V8a1.5 1.5 0 00-3 0v6a6 6 0 006 6h2a6 6 0 006-6v-3" /></svg>
          </button>
        </div>
      </div>

      {/* Floating sections over the workspace: clicks pass through to the canvas except on panels. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Left media drawer — the UI representation of reference_content. Always present (even with
            no project/collection) so its handle is reachable; it just shows empty groups. */}
        <WorkspaceDrawer
          open={drawerOpen}
          onToggle={() => setDrawerOpen((o) => !o)}
          groups={gallery}
          loading={hasProject && panelItems === null}
          hasProject={hasProject}
          onPlace={(t) => placeTile(t)}
          onAddCollection={() => setAddCollectionOpen(true)}
          onUpload={() => setMediaOpen(true)}
          onGenerate={() => setMediaOpen(true)}
        />

        {/* Desktop-style application menu bar: File · Edit · Insert · Size · View, the editable
            document name, and autosave status — the one always-showing bar at the top. */}
        <StudioMenuBar
          design={design}
          sceneIndex={sceneIndex}
          onChange={setDesign}
          name={nameDraft}
          onNameChange={setNameDraft}
          onNameCommit={() => void commitRename()}
          saveMsg={saveMsg}
          onPickFormat={pickFormat}
          hasSelection={Boolean(selected)}
          onDuplicate={duplicateSelected}
          onDelete={() => selected && onNodeDelete(selected.scene, selected.nodeId)}
          onLayer={layerSelected}
          onAddMedia={() => setMediaOpen(true)}
          onZoomIn={() => controlsRef.current?.zoomIn()}
          onZoomOut={() => controlsRef.current?.zoomOut()}
          onFit={() => controlsRef.current?.fit()}
          mediaOpen={drawerOpen}
          onToggleMedia={() => setDrawerOpen((o) => !o)}
          onGenerateVideo={() => void generateVideo()}
          rendering={rendering}
          videoMsg={videoMsg}
        />

        {/* Per-scene controls hugging the active scene's top + bottom edges (identity + timing on
            top; animation transport + narration on the bottom). Replaces the old timeline drawer. */}
        <SceneEdgeControls
          rect={sceneSelected ? sceneRect : null}
          design={design}
          sceneIndex={sceneIndex}
          onChange={setDesign}
          playing={playing}
          playhead={playhead}
          durationMs={design.scenes[sceneIndex]?.durationMs ?? DEFAULT_SCENE_DURATION_MS}
          onTogglePlay={togglePlay}
          onScrub={scrub}
          narrate={narrate}
          onToggleNarrate={() => setNarrate((n) => !n)}
        />

        {/* Right tool rail: creation tools only (icons + hover names). */}
        <StudioRightRail design={design} sceneIndex={sceneIndex} onChange={setDesign} />

        {/* Group panel: appears when 2+ elements are selected (group / ungroup + shared props). */}
        {selectedIds.length > 1 && selectedScene !== null && (
          <div className="pointer-events-auto absolute right-20 top-24 z-30 max-h-[calc(100vh-13rem)] w-72 overflow-y-auto rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-4 shadow-xl backdrop-blur-md">
            <GroupPanel
              count={selectedIds.length}
              isGroup={Boolean(selectedGroupId)}
              groupId={selectedGroupId}
              onGroup={groupSelected}
              onUngroup={ungroupSelected}
              onAnim={groupAnim}
              onOpacity={groupOpacity}
            />
          </div>
        )}

        {/* Inspector: appears when a single element is selected, styling controls for it. */}
        {selectedNode && selectedIds.length <= 1 && (
          <div className="pointer-events-auto absolute right-20 top-24 z-30 max-h-[calc(100vh-13rem)] w-72 overflow-y-auto rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-4 shadow-xl backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-small font-bold text-walshe-ink">Edit element</h2>
              <button
                type="button"
                aria-label="Deselect"
                onClick={() => setSelected(null)}
                className="grid h-7 w-7 place-items-center rounded-md text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <Inspector
              node={selectedNode}
              onChange={patchSelected}
              onDuplicate={duplicateSelected}
              onDelete={() => selected && onNodeDelete(selected.scene, selected.nodeId)}
              onLayer={layerSelected}
              onAnim={animSelected}
              sceneDurationMs={design.scenes[sceneIndex]?.durationMs ?? DEFAULT_SCENE_DURATION_MS}
              playheadMs={playhead}
            />
          </div>
        )}

        {/* Zoom / fit — bottom-right, shifted left to clear the Q/A assistant button. */}
        <div className="pointer-events-auto absolute bottom-4 right-24 flex items-center rounded-lg border border-walshe-line/70 bg-chrome-bg/90 px-0.5 shadow-xl backdrop-blur-md">
          <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => controlsRef.current?.zoomOut()}>−</button>
          <button type="button" className="px-2 text-small font-medium text-walshe-ink hover:text-walshe-mint" onClick={() => controlsRef.current?.fit()}>Fit</button>
          <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => controlsRef.current?.zoomIn()}>+</button>
        </div>

        {/* Bottom AI dock: AI Builder / Planner tabs. */}
        <StudioBottomDock
          design={design}
          sceneIndex={sceneIndex}
          onChange={setDesign}
          items={panelItems}
        />

        {/* AC63 — a new project starts from a collection; prompt when opened without one. */}
        {!hasProject && (
          <div className="pointer-events-auto absolute left-1/2 top-[5rem] -translate-x-1/2 rounded-lg border border-walshe-line/70 bg-chrome-bg/95 px-4 py-2 text-small text-walshe-ink shadow-xl backdrop-blur-md">
            Start a project from a{" "}
            <Link href="/agent/collections" className="font-semibold text-walshe-mint underline">
              collection
            </Link>{" "}
            to use its media.
          </div>
        )}
      </div>

      {mediaOpen && (
        <MediaDialog onClose={() => setMediaOpen(false)} onAdded={onMediaAdded} />
      )}

      {addCollectionOpen && (
        <AddCollectionDialog
          attachedIds={(workspace?.reference_content.collections ?? []).map((c) => c.collection_id)}
          onClose={() => setAddCollectionOpen(false)}
          onAttach={async (id) => {
            setAddCollectionOpen(false);
            await attachCollection(id);
          }}
        />
      )}
    </div>
  );
}

// The + → "Add a collection" picker: the agent's collections not already attached to this
// workspace. Attaching appends it to reference_content.collections and autosaves.
function AddCollectionDialog({
  attachedIds,
  onClose,
  onAttach,
}: {
  attachedIds: number[];
  onClose: () => void;
  onAttach: (id: number) => void | Promise<void>;
}) {
  const [collections, setCollections] = useState<Collection[] | null>(null);

  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, []);

  const available = (collections ?? []).filter((c) => !attachedIds.includes(c.id));

  return (
    <Dialog title="Add a collection" open onClose={onClose}>
      {collections === null ? (
        <p className="text-small text-walshe-grey">Loading your collections…</p>
      ) : available.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-small font-medium text-walshe-ink">Nothing to add</p>
          <p className="mt-1 text-[12px] text-walshe-grey">
            Every collection is already in this workspace. Save entries to a new collection from the{" "}
            <Link href="/agent/catalog" className="font-semibold text-walshe-mint underline">
              catalog
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {available.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void onAttach(c.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-walshe-line bg-walshe-stone/30 px-3.5 py-3 text-left transition-colors hover:border-walshe-teal hover:bg-walshe-ink/5"
              >
                <span className="text-small font-semibold text-walshe-ink">{c.name}</span>
                <span className="text-[12px] text-walshe-grey">{c.item_ids.length} item(s)</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

// AC63/AC75 — add Local (upload) or AI-generated media; the created assets are reported to the
// parent, which stores them on the workspace (uploads/generated) and autosaves.
function MediaDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (assets: UserAsset[], kind: "uploads" | "generated") => void | Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(
    fn: () => Promise<UserAsset | UserAsset[]>,
    done: string,
    kind: "uploads" | "generated",
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await fn();
      const assets = Array.isArray(result) ? result : [result];
      setMsg(done);
      await onAdded(assets, kind);
    } catch {
      setMsg("Could not add that media.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add media" size="md" open onClose={onClose}>
      <label className="block">
        <span className="label">Upload an image or video (local)</span>
        <input type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
          disabled={busy}
          aria-label="Upload media file"
          className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-medium file:text-white"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(() => uploadLibraryMedia(f), "Uploaded.", "uploads"); }} />
        <span className="mt-1 block text-small text-walshe-grey">MP4, WebM or MOV play live on the canvas and render into the exported video.</span>
      </label>
      <div className="mt-4 flex items-end gap-2 border-t border-walshe-line pt-4">
        <label className="block flex-1">
          <span className="label">Or generate one (AI)</span>
          <input className="field h-11" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. sunset over the cliffs" aria-label="Image prompt" />
        </label>
        <button type="button" className="btn-secondary h-11" disabled={busy || !prompt.trim()}
          onClick={() => void run(() => generateLibraryMedia(prompt.trim()), "Generated.", "generated")}>
          Generate
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-small text-walshe-green">{msg}</p>}
    </Dialog>
  );
}
