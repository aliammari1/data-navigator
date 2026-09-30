import { describe, expect, it } from "vitest";
import { findFreeIconPosition, layoutDesktopIcons } from "@/features/desktop/core/icon-layout";

const bounds = { width: 400, height: 360 };

describe("desktop icon layout", () => {
  it("places new icons around existing saved positions", () => {
    const layout = layoutDesktopIcons(
      ["recycle", "folder:a", "dataset:b", "folder:c"],
      { "folder:a": { x: 16, y: 16 } },
      bounds,
    );

    expect(layout["folder:a"]).toEqual({ x: 16, y: 16 });
    expect(layout.recycle).toEqual({ x: 16, y: 120 });
    expect(new Set(Object.values(layout).map((point) => `${point.x},${point.y}`)).size).toBe(4);
  });

  it("repairs overlapping and out-of-bounds saved positions", () => {
    const layout = layoutDesktopIcons(
      ["a", "b", "c"],
      { a: { x: 16, y: 16 }, b: { x: 16, y: 16 }, c: { x: 900, y: 900 } },
      bounds,
    );

    expect(layout.a).toEqual({ x: 16, y: 16 });
    expect(layout.b).not.toEqual(layout.a);
    expect(
      Object.values(layout).every((point) => point.x < bounds.width && point.y < bounds.height),
    ).toBe(true);
  });

  it("moves a drop to a free slot when it overlaps another icon", () => {
    const occupied = [{ x: 100, y: 100 }];
    expect(findFreeIconPosition({ x: 110, y: 110 }, occupied, bounds)).not.toEqual({
      x: 110,
      y: 110,
    });
    expect(findFreeIconPosition({ x: 200, y: 100 }, occupied, bounds)).toEqual({ x: 200, y: 100 });
  });

  it("wraps icons into another column when the first column is full", () => {
    const layout = layoutDesktopIcons(["a", "b", "c"], {}, { width: 220, height: 250 });

    expect(layout.a).toEqual({ x: 16, y: 16 });
    expect(layout.b).toEqual({ x: 16, y: 120 });
    expect(layout.c).toEqual({ x: 112, y: 16 });
  });
});
