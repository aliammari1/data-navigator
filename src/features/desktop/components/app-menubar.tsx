"use client";

import type { ReactNode } from "react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import type { MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";

/**
 * Renders {@link MenuGroup}[] as a Radix `Menubar`.
 *
 * Pure presentation: every behaviour comes from the data (`item.run`,
 * `onToggle`, `onSelect`). The bar is styled to dissolve into the glass menu bar
 * — no border/shadow of its own — while the dropdown content uses the standard
 * popover surface so it reads correctly in light and dark themes.
 */
export function AppMenubar({ groups }: { groups: MenuGroup[] }) {
  return (
    <Menubar className="h-auto gap-0 rounded-none border-0 bg-transparent p-0 shadow-none">
      {groups.map((group) => (
        <MenubarMenu key={group.id}>
          <MenubarTrigger
            className={`cursor-default rounded-md px-2 py-0.5 text-[13px] leading-none hover:bg-black/10 data-[state=open]:bg-black/10 dark:hover:bg-white/10 dark:data-[state=open]:bg-white/10 ${
              group.emphasized ? "font-semibold" : "font-normal opacity-90"
            }`}
          >
            {group.label}
          </MenubarTrigger>
          <MenubarContent className="min-w-52">{renderItems(group.items)}</MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  );
}

function renderItems(items: MenuItem[]): ReactNode {
  return items.map((item) => <MenuNode key={item.id} item={item} />);
}

function MenuNode({ item }: { item: MenuItem }) {
  switch (item.kind) {
    case "separator":
      return <MenubarSeparator />;

    case "label":
      return (
        <MenubarLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {item.label}
        </MenubarLabel>
      );

    case "checkbox":
      return (
        <MenubarCheckboxItem
          checked={item.checked}
          disabled={item.disabled}
          onCheckedChange={(next) => item.onToggle(next)}
        >
          {item.label}
          {item.shortcut ? <MenubarShortcut>{item.shortcut}</MenubarShortcut> : null}
        </MenubarCheckboxItem>
      );

    case "radio":
      return (
        <MenubarRadioGroup value={item.value} onValueChange={(value) => item.onSelect(value)}>
          {item.options.map((opt) => {
            const Icon = opt.icon;
            return (
              <MenubarRadioItem key={opt.value} value={opt.value}>
                {Icon ? <Icon className="size-4 opacity-70" /> : null}
                {opt.label}
              </MenubarRadioItem>
            );
          })}
        </MenubarRadioGroup>
      );

    case "submenu": {
      const Icon = item.icon;
      return (
        <MenubarSub>
          <MenubarSubTrigger>
            {Icon ? <Icon className="size-4 opacity-70" /> : null}
            {item.label}
          </MenubarSubTrigger>
          <MenubarSubContent className="min-w-44">{renderItems(item.items)}</MenubarSubContent>
        </MenubarSub>
      );
    }

    default: {
      // Action item (kind "action" or omitted).
      const Icon = item.icon;
      return (
        <MenubarItem
          disabled={item.disabled}
          variant={item.danger ? "destructive" : "default"}
          onSelect={() => item.run()}
        >
          {Icon ? <Icon className="size-4 opacity-70" /> : null}
          {item.label}
          {item.shortcut ? <MenubarShortcut>{item.shortcut}</MenubarShortcut> : null}
        </MenubarItem>
      );
    }
  }
}
