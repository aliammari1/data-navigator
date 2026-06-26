"use client";

import { Command } from "cmdk";
import Fuse from "fuse.js";
import { ArrowRight, Brain, Database, Folders, Palette, Search, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { ALL_ITEMS, type NavItem } from "@/features/dashboard-shell/nav/nav-config";
import { cn } from "@/shared/utils";

/**
 * One Fuse index over the static nav metadata, built once at module load.
 * `shouldFilter={false}` on the cmdk list lets Fuse own ranking instead of the
 * naive `includes()` substring matching the hand-rolled palette used.
 */
const navFuse = new Fuse(ALL_ITEMS, {
  keys: [
    { name: "title", weight: 0.6 },
    { name: "keywords", weight: 0.3 },
    { name: "description", weight: 0.1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
});

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggleAi?: () => void;
}

/**
 * Universal launcher built on `cmdk` (ARIA combobox/listbox + focus trap for
 * free) with `fuse.js` fuzzy ranking. Surfaces three groups — Pages, Datasets,
 * and Actions — folding the old separate `GlobalDataSearch` popover into one
 * accessible surface.
 */
export function CommandPalette({ open, onClose, onToggleAi }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useAppTheme();

  const datasets = useDataStore((s) => s.datasets);
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);
  const setAppContext = useAppContextStore((s) => s.setContext);
  const addEvent = useActivityStore((s) => s.addEvent);
  const folders = useFoldersStore((s) => s.folders);

  const navigate = (item: NavItem) => {
    router.push(item.href);
    onClose();
  };

  const openFolder = () => {
    router.push("/dashboard/folders");
    onClose();
  };

  const selectDataset = (id: string) => {
    const ds = datasets.find((d) => d.id === id);
    if (!ds) return;
    setActiveDataset(ds.id);
    setAppContext({
      activeDomain: "general",
      activeDatasetId: ds.id,
      activeTableName: ds.tableName,
    });
    addEvent({
      type: "dataset_selected",
      message: `Selected dataset ${ds.name}`,
      datasetId: ds.id,
      tableName: ds.tableName,
    });
    router.push("/dashboard");
    onClose();
  };

  const cycleTheme = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");
    onClose();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      label="Command palette"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
    >
      <CommandBody
        navigate={navigate}
        datasets={datasets}
        selectDataset={selectDataset}
        folders={folders}
        openFolder={openFolder}
        cycleTheme={cycleTheme}
        onToggleAi={
          onToggleAi
            ? () => {
                onToggleAi();
                onClose();
              }
            : undefined
        }
      />
    </Command.Dialog>
  );
}

function CommandBody({
  navigate,
  datasets,
  selectDataset,
  folders,
  openFolder,
  cycleTheme,
  onToggleAi,
}: {
  navigate: (item: NavItem) => void;
  datasets: ReturnType<typeof useDataStore.getState>["datasets"];
  selectDataset: (id: string) => void;
  folders: ReturnType<typeof useFoldersStore.getState>["folders"];
  openFolder: () => void;
  cycleTheme: () => void;
  onToggleAi?: () => void;
}) {
  const [query, setQuery] = useState("");

  const pages = useMemo<NavItem[]>(
    () => (query.trim() ? navFuse.search(query).map((r) => r.item) : ALL_ITEMS.slice(0, 8)),
    [query],
  );

  const datasetMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? datasets.filter(
          (d) => d.name.toLowerCase().includes(q) || d.format.toLowerCase().includes(q),
        )
      : datasets;
    return list.slice(0, 6);
  }, [query, datasets]);

  const folderMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, folders]);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Search className="h-4 w-4 flex-none text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search pages, datasets, actions…"
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border border-border bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
          ESC
        </kbd>
      </div>

      <Command.List className="max-h-80 overflow-y-auto py-1">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          No results for &ldquo;{query}&rdquo;
        </Command.Empty>

        {pages.length > 0 && (
          <Command.Group
            heading="Pages"
            className="px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/50"
          >
            {pages.map((item) => {
              const Icon = item.icon;
              return (
                <Command.Item
                  key={item.href}
                  value={`page:${item.href}`}
                  keywords={[item.title, item.description, ...(item.keywords ?? [])]}
                  onSelect={() => navigate(item)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    "data-[selected=true]:bg-accent",
                  )}
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent group-data-[selected=true]:bg-blue-500/20">
                    <Icon className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-blue-400" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {datasetMatches.length > 0 && (
          <Command.Group
            heading="Datasets"
            className="px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/50"
          >
            {datasetMatches.map((ds) => (
              <Command.Item
                key={ds.id}
                value={`dataset:${ds.id}`}
                keywords={[ds.name, ds.format]}
                onSelect={() => selectDataset(ds.id)}
                className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent group-data-[selected=true]:bg-blue-500/20">
                  <Table2 className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-blue-400" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {ds.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {ds.format} · {ds.rowCount.toLocaleString()} rows
                  </span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {folderMatches.length > 0 && (
          <Command.Group
            heading="Folders"
            className="px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/50"
          >
            {folderMatches.map((folder) => (
              <Command.Item
                key={folder.id}
                value={`folder:${folder.id}`}
                keywords={[folder.name]}
                onSelect={openFolder}
                className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent group-data-[selected=true]:bg-yellow-500/20">
                  <Folders className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-yellow-400" />
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                  {folder.name}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group
          heading="Actions"
          className="px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/50"
        >
          {onToggleAi && (
            <Command.Item
              value="action:toggle-ai"
              keywords={["ai", "copilot", "assistant", "toggle"]}
              onSelect={onToggleAi}
              className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent group-data-[selected=true]:bg-blue-500/20">
                <Brain className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-blue-400" />
              </span>
              <span className="text-sm font-medium text-foreground">Toggle AI Copilot</span>
            </Command.Item>
          )}
          <Command.Item
            value="action:cycle-theme"
            keywords={["theme", "dark", "light", "appearance"]}
            onSelect={cycleTheme}
            className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-accent"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-accent group-data-[selected=true]:bg-blue-500/20">
              <Palette className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-blue-400" />
            </span>
            <span className="text-sm font-medium text-foreground">Cycle theme</span>
          </Command.Item>
        </Command.Group>
      </Command.List>

      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Database className="h-3 w-3" /> Launcher
        </span>
        <span>↑↓ to move</span>
        <span>↵ to open</span>
        <span>ESC to close</span>
      </div>
    </>
  );
}
