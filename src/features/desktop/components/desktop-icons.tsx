"use client";

import {
  FileSpreadsheet,
  FolderClosed,
  type LucideIcon,
  MonitorSmartphone,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Dataset, useDataStore } from "@/core/stores/data-store";
import {
  type CatalogFolder,
  useFoldersActions,
  useFoldersStore,
} from "@/core/stores/folders-store";
import {
  type ContextMenuState,
  IconContextMenu,
  type MenuItem,
} from "@/features/desktop/components/icon-context-menu";
import { useContextBusActions } from "@/features/desktop/core/context-bus";
import { buildDatasetMenu, buildFolderMenu } from "@/features/desktop/core/data-context-menus";
import { type DesktopDragPayload, readDrag, serializeDrag } from "@/features/desktop/core/dnd";
import { askMoudir as askMoudirBridge } from "@/features/desktop/core/moudir-bridge";
import {
  useDesktopActions,
  useIconPositions,
  useRecycleBin,
} from "@/features/desktop/store/desktop-store";

/**
 * Windows-style desktop icons: Recycle Bin, "Ce PC", live icons per
 * top-level catalog folder and root dataset. Icons are pointer-draggable
 * (positions persist), double-click to open, right-click for a context menu.
 * Dropping a folder or dataset onto the Recycle Bin soft-deletes it; dropping
 * a dataset onto a folder places it inside that folder.
 */

interface IconDescriptor {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  kind: "recycle" | "this-pc" | "folder" | "dataset";
  folder?: CatalogFolder;
  dataset?: Dataset;
}

const _GRID_X = 96;
const GRID_Y = 104;
const ORIGIN = { x: 16, y: 16 };

export function DesktopIcons() {
  const folders = useFoldersStore((s) => s.folders);
  const datasets = useDataStore((s) => s.datasets);
  const removeDataset = useDataStore((s) => s.removeDataset);
  const positions = useIconPositions();
  const recycleBin = useRecycleBin();
  const { setIconPosition, openApp, recycle } = useDesktopActions();
  const { removeFolder, renameFolder, moveFolder, moveDataset } = useFoldersActions();
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const { setSelection, clearSelection } = useContextBusActions();

  const [selected, setSelected] = useState<string | null>(null);
  // Marquee rubber-band multi-selection (icon ids covered by the drag box).
  const [multi, setMulti] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<(ContextMenuState & { items: MenuItem[] }) | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragInfo = useRef<{ id: string; offX: number; offY: number; moved: boolean } | null>(null);

  // Rubber-band marquee state (empty-canvas drag selects icons).
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null);

  // Spring-loaded folder: hovering a dataset/folder drag over a folder icon for
  // ~600ms opens the Folders app focused on that folder.
  const springTimer = useRef<number | null>(null);
  const springTarget = useRef<string | null>(null);
  const [springFolder, setSpringFolder] = useState<string | null>(null);

  const clearSpring = useCallback(() => {
    if (springTimer.current !== null) {
      window.clearTimeout(springTimer.current);
      springTimer.current = null;
    }
    springTarget.current = null;
    setSpringFolder(null);
  }, []);

  useEffect(() => () => clearSpring(), [clearSpring]);

  const desktopFolders = folders.filter((f) => f.parentId === null);
  const desktopDatasets = datasets.filter((ds) => !datasetFolderMap[ds.id]);

  const icons: IconDescriptor[] = [
    {
      id: "recycle-bin",
      label: recycleBin.length ? `Corbeille (${recycleBin.length})` : "Corbeille",
      icon: Trash2,
      color: "210 8% 50%",
      kind: "recycle",
    },
    {
      id: "this-pc",
      label: "Ce PC",
      icon: MonitorSmartphone,
      color: "210 60% 50%",
      kind: "this-pc",
    },
    ...desktopFolders.map((f) => ({
      id: `folder:${f.id}`,
      label: f.name || "Dossier",
      icon: FolderClosed,
      color: f.color ? hexToHsl(f.color) : "38 70% 52%",
      kind: "folder" as const,
      folder: f,
    })),
    ...desktopDatasets.map((ds) => ({
      id: `dataset:${ds.id}`,
      label: ds.name || "Jeu de données",
      icon: FileSpreadsheet,
      color: "142 65% 42%",
      kind: "dataset" as const,
      dataset: ds,
    })),
  ];

  const posFor = (id: string, index: number) =>
    positions[id] ?? { x: ORIGIN.x, y: ORIGIN.y + index * GRID_Y };

  const folderDatasetCount = useCallback(
    (folderId: string) => Object.values(datasetFolderMap).filter((fid) => fid === folderId).length,
    [datasetFolderMap],
  );

  const openIcon = useCallback(
    (d: IconDescriptor) => {
      if (d.kind === "recycle") openApp("recycle-bin");
      else if (d.kind === "this-pc") openApp("folders");
      else if (d.kind === "folder" && d.folder)
        openApp("folders", { props: { initialFolderId: d.folder.id }, forceNew: false });
      else if (d.kind === "dataset" && d.dataset) {
        setActiveDataset(d.dataset.id);
        openApp("telecom", { props: { datasetId: d.dataset.id }, forceNew: false });
      }
    },
    [openApp, setActiveDataset],
  );

  // Select an icon: track local highlight + publish to the context bus so the
  // Inspector / Quick Look (Space) follow the selection.
  const selectIcon = useCallback(
    (d: IconDescriptor) => {
      setSelected(d.id);
      setMulti(new Set());
      if (d.kind === "folder" && d.folder) {
        setSelection({ kind: "folder", id: d.folder.id, label: d.folder.name || "Dossier" });
      } else if (d.kind === "dataset" && d.dataset) {
        setSelection({ kind: "dataset", id: d.dataset.id, label: d.dataset.name });
      } else {
        clearSelection();
      }
    },
    [setSelection, clearSelection],
  );

  // Pointer drag to reposition + drop detection.
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const idx = icons.findIndex((i) => i.id === id);
    const start = posFor(id, idx);
    dragInfo.current = { id, offX: e.clientX - start.x, offY: e.clientY - start.y, moved: false };
    selectIcon(icons[idx]);
    setDrag({ id, x: start.x, y: start.y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    info.moved = true;
    setDrag({ id: info.id, x: e.clientX - info.offX, y: e.clientY - info.offY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const info = dragInfo.current;
    dragInfo.current = null;
    if (!info) return;
    const finalPos = {
      x: Math.max(0, e.clientX - info.offX),
      y: Math.max(0, e.clientY - info.offY),
    };
    setDrag(null);
    if (!info.moved) return;

    // Drop-target detection.
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const dropTarget = el?.closest<HTMLElement>("[data-drop]");
    const drop = dropTarget?.dataset.drop;
    if (drop === "recycle") {
      if (info.id.startsWith("folder:")) {
        const fid = info.id.slice("folder:".length);
        const folder = folders.find((f) => f.id === fid);
        if (folder) {
          recycle({ id: `rb-${fid}`, kind: "folder", name: folder.name, payload: { folder } });
          removeFolder(fid);
        }
        return;
      }
      if (info.id.startsWith("dataset:")) {
        const dsId = info.id.slice("dataset:".length);
        const ds = datasets.find((d) => d.id === dsId);
        if (ds) {
          recycle({
            id: `rb-ds-${dsId}`,
            kind: "dataset",
            name: ds.name,
            payload: { dataset: ds },
          });
          removeDataset(dsId);
        }
        return;
      }
    }
    if (drop?.startsWith("folder:")) {
      const targetId = drop.slice("folder:".length);
      if (info.id.startsWith("folder:")) {
        const srcId = info.id.slice("folder:".length);
        if (targetId !== srcId) moveFolder(srcId, targetId);
        return;
      }
      if (info.id.startsWith("dataset:")) {
        const dsId = info.id.slice("dataset:".length);
        moveDataset(dsId, targetId);
        return;
      }
    }
    setIconPosition(info.id, finalPos);
  };

  const openMenu = (e: React.MouseEvent, d: IconDescriptor) => {
    e.preventDefault();
    e.stopPropagation();
    selectIcon(d);
    let items: MenuItem[];
    if (d.kind === "folder" && d.folder) {
      const folder = d.folder;
      items = [
        ...buildFolderMenu(
          { id: folder.id, name: folder.name || "Dossier" },
          {
            openApp,
            setSelection,
            askMoudir: (prompt) => {
              askMoudirBridge(prompt, { openApp });
            },
          },
        ),
        { separator: true },
        {
          label: "Ouvrir le rapport (analytique figée)",
          onClick: () => {
            const first = Object.entries(datasetFolderMap).find(
              ([, fid]) => fid === folder.id,
            )?.[0];
            if (first) setActiveDataset(first);
            openApp("telecom");
          },
        },
        {
          label: "Renommer",
          onClick: () => {
            const name = window.prompt("Renommer le dossier", folder.name);
            if (name?.trim()) renameFolder(folder.id, name.trim());
          },
        },
        { separator: true },
        {
          label: "Supprimer",
          danger: true,
          onClick: () => {
            recycle({
              id: `rb-${folder.id}`,
              kind: "folder",
              name: folder.name,
              payload: { folder },
            });
            removeFolder(folder.id);
          },
        },
      ];
    } else if (d.kind === "dataset" && d.dataset) {
      const ds = d.dataset;
      items = [
        ...buildDatasetMenu(
          { id: ds.id, name: ds.name },
          {
            openApp,
            setActiveDataset,
            setSelection,
            askMoudir: (prompt) => {
              askMoudirBridge(prompt, { datasetId: ds.id, openApp });
            },
          },
        ),
        { separator: true },
        {
          label: "Supprimer",
          danger: true,
          onClick: () => {
            recycle({
              id: `rb-ds-${ds.id}`,
              kind: "dataset",
              name: ds.name,
              payload: { dataset: ds },
            });
            removeDataset(ds.id);
          },
        },
      ];
    } else if (d.kind === "recycle") {
      items = [
        { label: "Ouvrir", onClick: () => openIcon(d) },
        { separator: true },
        { label: "Ouvrir la corbeille", onClick: () => openApp("recycle-bin") },
      ];
    } else {
      items = [
        { label: "Ouvrir", onClick: () => openIcon(d) },
        { separator: true },
        { label: "Gérer les dossiers", onClick: () => openApp("folders") },
      ];
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ─── Marquee rubber-band multi-select (drag a box on empty canvas) ──────────
  // Icon hit-box is the ~80px (w-20) wide tile starting at its stored position.
  const ICON_W = 80;
  const ICON_H = 96;
  const iconsInRect = (r: { x: number; y: number; w: number; h: number }) => {
    const hit = new Set<string>();
    icons.forEach((d, i) => {
      const p = posFor(d.id, i);
      const overlap =
        p.x < r.x + r.w && p.x + ICON_W > r.x && p.y < r.y + r.h && p.y + ICON_H > r.y;
      if (overlap) hit.add(d.id);
    });
    return hit;
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    // Left button on the empty canvas only (icons stopPropagation on their own
    // pointerdown, so reaching here means an empty-area press).
    if (e.button !== 0) return;
    setSelected(null);
    clearSelection();
    marqueeRef.current = { startX: e.clientX, startY: e.clientY };
    setMarquee({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    setMulti(new Set());
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const m = marqueeRef.current;
    if (!m) return;
    const x = Math.min(m.startX, e.clientX);
    const y = Math.min(m.startY, e.clientY);
    const w = Math.abs(e.clientX - m.startX);
    const h = Math.abs(e.clientY - m.startY);
    const rect = { x, y, w, h };
    setMarquee(rect);
    setMulti(iconsInRect(rect));
  };
  const onCanvasPointerUp = () => {
    if (!marqueeRef.current) return;
    marqueeRef.current = null;
    setMarquee(null);
  };

  // ─── Spring-loaded folders (native HTML5 drag of a dataset/folder payload) ───
  const onFolderDragOver = (e: React.DragEvent, folderId: string) => {
    // Only react to our typed desktop drags; the MIME type is visible during
    // dragover even though payload data is not (per spec).
    if (!e.dataTransfer.types.includes("application/x-data-navigator")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (springTarget.current === folderId) return; // already arming this folder
    clearSpring();
    springTarget.current = folderId;
    setSpringFolder(folderId);
    springTimer.current = window.setTimeout(() => {
      openApp("folders", { props: { initialFolderId: folderId }, forceNew: false });
      clearSpring();
    }, 600);
  };
  const onFolderDragLeave = (e: React.DragEvent, folderId: string) => {
    if (springTarget.current !== folderId) return;
    // Ignore leave events bubbling from child elements still inside the tile.
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
    clearSpring();
  };
  const onFolderDrop = (e: React.DragEvent, folderId: string) => {
    const payload = readDrag(e);
    if (!payload) return;
    e.preventDefault();
    clearSpring();
    // Re-parent a folder dropped onto another folder (mirrors pointer-drop).
    if (payload.kind === "folder" && payload.id !== folderId) {
      moveFolder(payload.id, folderId);
      return;
    }
    // A dataset dropped on a folder moves it inside that folder.
    if (payload.kind === "dataset" && payload.id) {
      moveDataset(payload.id, folderId);
      return;
    }
    // Any other drop on a folder opens it focused there.
    openApp("folders", { props: { initialFolderId: folderId }, forceNew: false });
  };

  // Folder/dataset icons are draggable so other windows/dock can receive them.
  const onIconDragStart = (e: React.DragEvent, d: IconDescriptor) => {
    if (d.kind === "folder" && d.folder) {
      const payload: DesktopDragPayload = {
        kind: "folder",
        id: d.folder.id,
        label: d.folder.name || "Dossier",
      };
      serializeDrag(e, payload);
    } else if (d.kind === "dataset" && d.dataset) {
      const payload: DesktopDragPayload = {
        kind: "dataset",
        id: d.dataset.id,
        label: d.dataset.name || "Jeu de données",
      };
      serializeDrag(e, payload);
    } else {
      // Recycle / Ce PC are not draggable payloads.
      e.preventDefault();
    }
  };

  return (
    <>
      {icons.map((d, i) => {
        const base = posFor(d.id, i);
        const pos = drag?.id === d.id ? drag : base;
        const Icon = d.icon;
        const count = d.kind === "folder" && d.folder ? folderDatasetCount(d.folder.id) : undefined;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: desktop icon — double-click opens, right-click menu, pointer-drag moves; keyboard users use the Start menu / folders app.
          <div
            key={d.id}
            data-drop={
              d.kind === "recycle"
                ? "recycle"
                : d.kind === "folder" && d.folder
                  ? `folder:${d.folder.id}`
                  : undefined
            }
            draggable={d.kind === "folder" || d.kind === "dataset"}
            className={`absolute flex w-20 cursor-default select-none flex-col items-center gap-1 rounded-md p-2 text-center ${
              selected === d.id || multi.has(d.id)
                ? "bg-white/25 ring-1 ring-white/40"
                : "hover:bg-white/15"
            } ${springFolder === d.folder?.id ? "ring-2 ring-[hsl(var(--glass-accent))]" : ""} ${drag?.id === d.id ? "z-50 opacity-90" : ""}`}
            // While dragging, ignore hit-testing on the dragged icon so
            // elementFromPoint can see the drop target (folder / recycle) beneath.
            style={{
              left: pos.x,
              top: pos.y,
              pointerEvents: drag?.id === d.id ? "none" : undefined,
            }}
            onPointerDown={(e) => onPointerDown(e, d.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={() => openIcon(d)}
            onContextMenu={(e) => openMenu(e, d)}
            onDragStart={(e) => onIconDragStart(e, d)}
            onDragOver={
              d.kind === "folder" && d.folder
                ? (e) => onFolderDragOver(e, (d.folder as CatalogFolder).id)
                : undefined
            }
            onDragLeave={
              d.kind === "folder" && d.folder
                ? (e) => onFolderDragLeave(e, (d.folder as CatalogFolder).id)
                : undefined
            }
            onDrop={
              d.kind === "folder" && d.folder
                ? (e) => onFolderDrop(e, (d.folder as CatalogFolder).id)
                : undefined
            }
          >
            <span
              className="relative grid size-12 place-items-center rounded-lg border border-white/50 shadow-sm"
              style={{
                background: `linear-gradient(150deg, hsl(${d.color} / 0.22), hsl(${d.color} / 0.42))`,
              }}
            >
              <Icon className="size-7" style={{ color: `hsl(${d.color})` }} />
              {count !== undefined && count > 0 && (
                <span className="absolute -bottom-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-foreground px-1 font-mono text-xs font-bold tabular-nums text-background">
                  {count}
                </span>
              )}
              {d.kind === "dataset" && d.dataset?.format && (
                <span className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded bg-emerald-600 px-1 font-mono text-[9px] font-bold uppercase text-white shadow-xs">
                  {d.dataset.format}
                </span>
              )}
            </span>
            <span className="line-clamp-2 text-xs font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {d.label}
            </span>
          </div>
        );
      })}

      {/* Empty-canvas interaction surface: click-away clears selection, and a
          drag rubber-bands a multi-select marquee. Sits behind the icons (-z-10)
          so icons keep their own pointer handlers; icons stopPropagation on
          pointerdown so an empty-area press reaches this layer. */}
      <div
        className="absolute inset-0 -z-10"
        // Canonical "empty desktop" surface: this full-bleed layer — not the bare
        // canvas — is what right-clicks on empty space actually land on, so the
        // desktop context menu keys off this marker (see Desktop onContextMenu).
        data-desktop-surface
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
      />

      {/* Rubber-band marquee box */}
      {marquee && (
        <div
          className="pointer-events-none absolute z-40 rounded-sm border border-[hsl(var(--glass-accent))] bg-[hsl(var(--glass-accent)/0.15)]"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}

      <IconContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length < 6) return "38 70% 52%";
  const r = Number.parseInt(m.slice(0, 2), 16) / 255;
  const g = Number.parseInt(m.slice(2, 4), 16) / 255;
  const b = Number.parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
