import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import {
  type GuestPermission,
  type NavItem,
  lockNavItemsByPermission,
} from "@/features/dashboard-shell/nav/nav-config";

const icon = (() => undefined) as unknown as ComponentType;

const makeItem = (overrides: Partial<NavItem>): NavItem => ({
  title: "test",
  href: "/test",
  icon,
  description: "test item",
  ...overrides,
});

describe("lockNavItemsByPermission", () => {
  it("returns items unchanged when permissions is undefined (non-guest)", () => {
    const items = [
      makeItem({ href: "/upload", requiredPermission: "uploadData" }),
      makeItem({ href: "/settings", requiredPermission: "accessSettings" }),
    ];
    const result = lockNavItemsByPermission(items, undefined);
    expect(result[0].locked).toBeFalsy();
    expect(result[1].locked).toBeFalsy();
  });

  it("marks items as locked when the guest lacks the required permission", () => {
    const items = [
      makeItem({ href: "/upload", requiredPermission: "uploadData" }),
      makeItem({ href: "/settings", requiredPermission: "accessSettings" }),
    ];
    const granted: GuestPermission[] = ["viewReports"];
    const result = lockNavItemsByPermission(items, granted);
    expect(result[0].locked).toBe(true);
    expect(result[1].locked).toBe(true);
  });

  it("leaves items unlocked when the guest has the required permission", () => {
    const items = [
      makeItem({ href: "/upload", requiredPermission: "uploadData" }),
      makeItem({ href: "/settings", requiredPermission: "accessSettings" }),
    ];
    const granted: GuestPermission[] = ["uploadData", "accessSettings"];
    const result = lockNavItemsByPermission(items, granted);
    expect(result[0].locked).toBeFalsy();
    expect(result[1].locked).toBeFalsy();
  });

  it("does not lock items without a requiredPermission", () => {
    const items = [makeItem({ href: "/home" })];
    const result = lockNavItemsByPermission(items, []);
    expect(result[0].locked).toBeFalsy();
  });

  it("recursively locks children of group items", () => {
    const items = [
      makeItem({
        href: "/reports",
        title: "Rapports",
        children: [
          makeItem({ href: "/reports/grid", requiredPermission: "exportData" }),
          makeItem({ href: "/reports/overview" }),
        ],
      }),
    ];
    const granted: GuestPermission[] = [];
    const result = lockNavItemsByPermission(items, granted);
    expect(result[0].locked).toBeFalsy();
    expect(result[0].children?.[0].locked).toBe(true);
    expect(result[0].children?.[1].locked).toBeFalsy();
  });

  it("a reviewer with uploadData is unlocked on upload but locked on export", () => {
    const items = [
      makeItem({ href: "/upload", requiredPermission: "uploadData" }),
      makeItem({ href: "/export", requiredPermission: "exportData" }),
    ];
    const granted: GuestPermission[] = ["viewReports", "uploadData"];
    const result = lockNavItemsByPermission(items, granted);
    expect(result[0].locked).toBeFalsy();
    expect(result[1].locked).toBe(true);
  });
});
