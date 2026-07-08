import { describe, expect, it } from "vitest";

import { APP_MENUS } from "@/features/desktop/core/menu/registry";
import type { MenuGroup, MenuItem } from "@/features/desktop/core/menu/types";

import { makeMenuContext } from "./menu-context";

/**
 * Cross-app structural invariants for every registered `buildMenu`.
 *
 * The per-app test files (telecom.test.ts, etc.) mostly pin each app's exact
 * declared item ids/order against the same literals already hardcoded in its
 * source `.tsx` — a legitimate but narrow regression pin, not independent
 * verification. This file instead checks properties that must hold for EVERY
 * app regardless of its specific content, and that a hardcoded per-app id list
 * can't catch: no duplicate ids, no dead/no-op handlers, and that every
 * actionable item's handler is actually callable without throwing when wired
 * to a real (mocked) MenuContext. A bug in any of the ~30 apps trips this file
 * without needing a bespoke assertion per app.
 */

function collectItems(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.kind === "submenu" ? [item, ...collectItems(item.items)] : [item]));
}

function assertNoDuplicateIds(ids: string[], where: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  expect(Array.from(duplicates), `duplicate ids in ${where}: ${Array.from(duplicates).join(", ")}`).toEqual(
    [],
  );
}

describe.each(Object.entries(APP_MENUS))("registered app menu: %s", (appId, buildMenu) => {
  it(`builds without throwing for a realistic MenuContext (${appId})`, () => {
    expect(() => buildMenu(makeMenuContext({ appId }))).not.toThrow();
  });

  it(`declares no duplicate top-level group ids (${appId})`, () => {
    const groups = buildMenu(makeMenuContext({ appId }));
    assertNoDuplicateIds(
      groups.map((g) => g.id),
      `${appId}'s top-level groups`,
    );
  });

  it(`declares no duplicate item ids within any single group, including nested submenus (${appId})`, () => {
    const groups = buildMenu(makeMenuContext({ appId }));
    for (const group of groups) {
      assertNoDuplicateIds(
        collectItems(group.items).map((i) => i.id),
        `${appId}'s "${group.id}" group`,
      );
    }
  });

  it(`gives every non-separator, non-label item a non-empty label (${appId})`, () => {
    const groups = buildMenu(makeMenuContext({ appId }));
    for (const group of groups) {
      for (const item of collectItems(group.items)) {
        if (item.kind === "separator") continue;
        expect(item.label?.length, `${appId} item "${item.id}" has an empty label`).toBeGreaterThan(0);
      }
    }
  });

  it(`wires a real, non-throwing handler to every actionable item (${appId})`, () => {
    const ctx = makeMenuContext({ appId });
    const groups = buildMenu(ctx);

    for (const group of groups) {
      for (const item of collectItems(group.items)) {
        if (item.kind === "action" || item.kind === undefined) {
          expect(typeof item.run, `${appId} item "${item.id}" has no callable run()`).toBe("function");
          expect(() => item.run(), `${appId} item "${item.id}".run() threw`).not.toThrow();
        } else if (item.kind === "checkbox") {
          expect(
            typeof item.onToggle,
            `${appId} item "${item.id}" has no callable onToggle()`,
          ).toBe("function");
          expect(() => item.onToggle(true), `${appId} item "${item.id}".onToggle() threw`).not.toThrow();
        } else if (item.kind === "radio") {
          expect(typeof item.onSelect, `${appId} radio "${item.id}" has no callable onSelect()`).toBe(
            "function",
          );
          expect(item.options.length, `${appId} radio "${item.id}" has no options`).toBeGreaterThan(0);
          expect(() => item.onSelect(item.options[0].value), `${appId} radio "${item.id}".onSelect() threw`).not.toThrow();
        }
      }
    }
  });
});

describe("APP_MENUS registry — completeness", () => {
  it("registers at least one app (the registry itself isn't empty)", () => {
    expect(Object.keys(APP_MENUS).length).toBeGreaterThan(0);
  });

  it("has no empty-string or duplicate app ids as keys", () => {
    const ids = Object.keys(APP_MENUS);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps every app id to a callable buildMenu function", () => {
    for (const [appId, buildMenu] of Object.entries(APP_MENUS)) {
      expect(typeof buildMenu, `${appId} is not mapped to a function`).toBe("function");
    }
  });
});

describe("MenuGroup shape — every registered app", () => {
  it("never declares a group with an empty items array", () => {
    for (const [appId, buildMenu] of Object.entries(APP_MENUS)) {
      const groups: MenuGroup[] = buildMenu(makeMenuContext({ appId }));
      for (const group of groups) {
        expect(
          group.items.length,
          `${appId}'s "${group.id}" group has zero items`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
