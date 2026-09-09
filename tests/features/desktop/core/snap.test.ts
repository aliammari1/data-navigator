import { describe, expect, it } from "vitest";

/**
 * Behavioral tests for the window-snapping geometry module.
 *
 * `snap.ts` is pure computation — no React, no DOM, no external deps — so no
 * mocks are needed. Every test exercises real module logic and checks a concrete
 * numeric or string outcome.
 */

import {
  computeSnapZones,
  rectForZone,
  SNAP_CORNER_THRESHOLD,
  SNAP_EDGE_THRESHOLD,
  type SnapViewport,
  type SnapZoneName,
  snapForPointer,
} from "@/features/desktop/core/snap";

// ─── Constant values ─────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("SNAP_EDGE_THRESHOLD is 12", () => {
    expect(SNAP_EDGE_THRESHOLD).toBe(12);
  });

  it("SNAP_CORNER_THRESHOLD is 36", () => {
    expect(SNAP_CORNER_THRESHOLD).toBe(36);
  });

  it("SNAP_CORNER_THRESHOLD is larger than SNAP_EDGE_THRESHOLD", () => {
    // The docstring notes this intentional asymmetry.
    expect(SNAP_CORNER_THRESHOLD).toBeGreaterThan(SNAP_EDGE_THRESHOLD);
  });
});

// ─── computeSnapZones — basic viewport (no insets) ───────────────────────────

describe("computeSnapZones — no insets (simple viewport)", () => {
  const vp: SnapViewport = { width: 1000, height: 800 };

  it("maximize fills the whole viewport", () => {
    const zones = computeSnapZones(vp);
    expect(zones.maximize).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it("left half occupies the left side", () => {
    const zones = computeSnapZones(vp);
    expect(zones.left).toEqual({ x: 0, y: 0, w: 500, h: 800 });
  });

  it("right half occupies the right side", () => {
    const zones = computeSnapZones(vp);
    // halfW = Math.round(1000/2) = 500; rightW = 1000 - 500 = 500; midX = 500
    expect(zones.right).toEqual({ x: 500, y: 0, w: 500, h: 800 });
  });

  it("top half occupies the upper portion", () => {
    const zones = computeSnapZones(vp);
    // halfH = Math.round(800/2) = 400
    expect(zones.top).toEqual({ x: 0, y: 0, w: 1000, h: 400 });
  });

  it("bottom half occupies the lower portion", () => {
    const zones = computeSnapZones(vp);
    // bottomH = 800 - 400 = 400; midY = 400
    expect(zones.bottom).toEqual({ x: 0, y: 400, w: 1000, h: 400 });
  });

  it("topLeft quarter is the upper-left", () => {
    const zones = computeSnapZones(vp);
    expect(zones.topLeft).toEqual({ x: 0, y: 0, w: 500, h: 400 });
  });

  it("topRight quarter is the upper-right", () => {
    const zones = computeSnapZones(vp);
    expect(zones.topRight).toEqual({ x: 500, y: 0, w: 500, h: 400 });
  });

  it("bottomLeft quarter is the lower-left", () => {
    const zones = computeSnapZones(vp);
    expect(zones.bottomLeft).toEqual({ x: 0, y: 400, w: 500, h: 400 });
  });

  it("bottomRight quarter is the lower-right", () => {
    const zones = computeSnapZones(vp);
    expect(zones.bottomRight).toEqual({ x: 500, y: 400, w: 500, h: 400 });
  });

  it("left.w + right.w equals the full width", () => {
    const zones = computeSnapZones(vp);
    expect(zones.left.w + zones.right.w).toBe(vp.width);
  });

  it("top.h + bottom.h equals the full height", () => {
    const zones = computeSnapZones(vp);
    expect(zones.top.h + zones.bottom.h).toBe(vp.height);
  });
});

// ─── computeSnapZones — viewport with insets ─────────────────────────────────

describe("computeSnapZones — with all insets", () => {
  // top=40 (menu bar), bottom=60 (dock), left=10, right=10
  const vp: SnapViewport = { width: 1200, height: 900, top: 40, bottom: 60, left: 10, right: 10 };
  // Usable box: x=10, y=40, w=1180, h=800

  it("maximize reflects the inset content box", () => {
    const zones = computeSnapZones(vp);
    expect(zones.maximize).toEqual({ x: 10, y: 40, w: 1180, h: 800 });
  });

  it("left half starts at the left inset x", () => {
    const zones = computeSnapZones(vp);
    expect(zones.left.x).toBe(10);
    expect(zones.left.y).toBe(40);
    expect(zones.left.h).toBe(800);
  });

  it("right half starts at x = left inset + halfW", () => {
    const zones = computeSnapZones(vp);
    const halfW = Math.round(1180 / 2);
    expect(zones.right.x).toBe(10 + halfW);
    expect(zones.left.w + zones.right.w).toBe(1180);
  });

  it("top zone starts at the top inset y", () => {
    const zones = computeSnapZones(vp);
    expect(zones.top.y).toBe(40);
  });

  it("bottom zone starts at y = top inset + halfH", () => {
    const zones = computeSnapZones(vp);
    const halfH = Math.round(800 / 2);
    expect(zones.bottom.y).toBe(40 + halfH);
    expect(zones.top.h + zones.bottom.h).toBe(800);
  });

  it("topLeft corner sits at the content-box origin", () => {
    const zones = computeSnapZones(vp);
    expect(zones.topLeft.x).toBe(10);
    expect(zones.topLeft.y).toBe(40);
  });

  it("bottomRight corner ends at the content-box far corner", () => {
    const zones = computeSnapZones(vp);
    const br = zones.bottomRight;
    expect(br.x + br.w).toBe(10 + 1180); // = 1190 = width - right
    expect(br.y + br.h).toBe(40 + 800); // = 840 = height - bottom
  });
});

// ─── computeSnapZones — odd viewport dimensions ───────────────────────────────

describe("computeSnapZones — odd dimensions (rounding)", () => {
  it("rounds halfW up for odd width and keeps right.w complementary", () => {
    // width=1001 → halfW = Math.round(1001/2) = Math.round(500.5) = 501 (JS banker's round → 501 here)
    // Actually Math.round(500.5) = 501 in JS; rightW = 1001 - 501 = 500
    const vp: SnapViewport = { width: 1001, height: 600 };
    const zones = computeSnapZones(vp);
    expect(zones.left.w + zones.right.w).toBe(1001);
  });

  it("rounds halfH and keeps bottom.h complementary for odd height", () => {
    const vp: SnapViewport = { width: 800, height: 801 };
    const zones = computeSnapZones(vp);
    expect(zones.top.h + zones.bottom.h).toBe(801);
  });

  it("handles 1x1 viewport without crashing", () => {
    const vp: SnapViewport = { width: 1, height: 1 };
    const zones = computeSnapZones(vp);
    expect(zones.maximize).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("handles insets that exceed viewport size (clamp to 0)", () => {
    // left + right > width → w should be 0
    const vp: SnapViewport = { width: 100, height: 100, left: 60, right: 60 };
    const zones = computeSnapZones(vp);
    expect(zones.maximize.w).toBe(0);
    expect(zones.maximize.h).toBe(100); // h insets = 0
  });

  it("handles only top inset with default others", () => {
    const vp: SnapViewport = { width: 800, height: 600, top: 48 };
    const zones = computeSnapZones(vp);
    expect(zones.maximize).toEqual({ x: 0, y: 48, w: 800, h: 552 });
  });

  it("handles only bottom inset with default others", () => {
    const vp: SnapViewport = { width: 800, height: 600, bottom: 64 };
    const zones = computeSnapZones(vp);
    expect(zones.maximize).toEqual({ x: 0, y: 0, w: 800, h: 536 });
  });
});

// ─── snapForPointer — corners (highest priority) ─────────────────────────────

describe("snapForPointer — corner zones", () => {
  const vp: SnapViewport = { width: 1000, height: 800 };

  it("returns 'topLeft' when pointer is near the top-left corner", () => {
    // x=20, y=20 → both within SNAP_CORNER_THRESHOLD=36 of left (x=0) and top (y=0)
    expect(snapForPointer(20, 20, vp)).toBe("topLeft");
  });

  it("returns 'topRight' when pointer is near the top-right corner", () => {
    // x=985, y=20 → maxX-x = 1000-985 = 15 ≤ 36; y-0 = 20 ≤ 36
    expect(snapForPointer(985, 20, vp)).toBe("topRight");
  });

  it("returns 'bottomLeft' when pointer is near the bottom-left corner", () => {
    // x=20, y=780 → x within 36 of left; maxY-y = 800-780 = 20 ≤ 36
    expect(snapForPointer(20, 780, vp)).toBe("bottomLeft");
  });

  it("returns 'bottomRight' when pointer is near the bottom-right corner", () => {
    // x=985, y=780 → both within 36 of right and bottom edges
    expect(snapForPointer(985, 780, vp)).toBe("bottomRight");
  });

  it("corners win over the top edge even when y is within SNAP_EDGE_THRESHOLD", () => {
    // x=10 (near left corner), y=5 (within both corner and edge thresholds)
    // Corner check runs first, so result is 'topLeft', NOT 'maximize'
    expect(snapForPointer(10, 5, vp)).toBe("topLeft");
  });

  it("corners win over the left edge for a near-corner position", () => {
    // x=10, y=30 — both within corner threshold
    expect(snapForPointer(10, 30, vp)).toBe("topLeft");
  });

  it("corners win over bottom edge for a near-corner position", () => {
    // x=10, y=770 — within SNAP_CORNER_THRESHOLD of both left and bottom
    expect(snapForPointer(10, 770, vp)).toBe("bottomLeft");
  });
});

// ─── snapForPointer — edge zones (post-corner) ───────────────────────────────

describe("snapForPointer — edge zones", () => {
  const vp: SnapViewport = { width: 1000, height: 800 };
  // Middle of the viewport horizontally/vertically to avoid corner zones.
  const midX = 500;
  const midY = 400;

  it("returns 'maximize' when pointer is near the top edge (not a corner)", () => {
    // y=5 (within SNAP_EDGE_THRESHOLD=12); x=500 (not near corners)
    expect(snapForPointer(midX, 5, vp)).toBe("maximize");
  });

  it("returns 'maximize' at exactly y=0 (top boundary)", () => {
    expect(snapForPointer(midX, 0, vp)).toBe("maximize");
  });

  it("returns 'maximize' at y equal to SNAP_EDGE_THRESHOLD", () => {
    expect(snapForPointer(midX, SNAP_EDGE_THRESHOLD, vp)).toBe("maximize");
  });

  it("does NOT return 'maximize' when y is one pixel beyond the edge threshold", () => {
    // y=13 > 12 and x=500 is not near any corner → should return null
    expect(snapForPointer(midX, SNAP_EDGE_THRESHOLD + 1, vp)).toBeNull();
  });

  it("returns 'left' when pointer is near the left edge (not a corner)", () => {
    // x=5, y=400 (midpoint — no corner)
    expect(snapForPointer(5, midY, vp)).toBe("left");
  });

  it("returns 'left' at exactly x=0", () => {
    expect(snapForPointer(0, midY, vp)).toBe("left");
  });

  it("returns 'left' at x equal to SNAP_EDGE_THRESHOLD", () => {
    expect(snapForPointer(SNAP_EDGE_THRESHOLD, midY, vp)).toBe("left");
  });

  it("does NOT return 'left' when x is one pixel past the edge threshold", () => {
    expect(snapForPointer(SNAP_EDGE_THRESHOLD + 1, midY, vp)).toBeNull();
  });

  it("returns 'right' when pointer is near the right edge (not a corner)", () => {
    // maxX=1000, x=995 → distance=5 ≤ 12
    expect(snapForPointer(995, midY, vp)).toBe("right");
  });

  it("returns 'right' at exactly x = viewport.width", () => {
    expect(snapForPointer(vp.width, midY, vp)).toBe("right");
  });

  it("returns 'right' when distance from right edge equals SNAP_EDGE_THRESHOLD", () => {
    // maxX - x = SNAP_EDGE_THRESHOLD → x = 1000 - 12 = 988
    expect(snapForPointer(vp.width - SNAP_EDGE_THRESHOLD, midY, vp)).toBe("right");
  });

  it("does NOT return 'right' one pixel inside the threshold", () => {
    expect(snapForPointer(vp.width - SNAP_EDGE_THRESHOLD - 1, midY, vp)).toBeNull();
  });

  it("returns 'bottom' when pointer is near the bottom edge (not a corner)", () => {
    // maxY=800, y=795 → distance=5 ≤ 12
    expect(snapForPointer(midX, 795, vp)).toBe("bottom");
  });

  it("returns 'bottom' at exactly y = viewport.height", () => {
    expect(snapForPointer(midX, vp.height, vp)).toBe("bottom");
  });

  it("returns 'bottom' when distance from bottom equals SNAP_EDGE_THRESHOLD", () => {
    expect(snapForPointer(midX, vp.height - SNAP_EDGE_THRESHOLD, vp)).toBe("bottom");
  });

  it("does NOT return 'bottom' one pixel inside the threshold", () => {
    expect(snapForPointer(midX, vp.height - SNAP_EDGE_THRESHOLD - 1, vp)).toBeNull();
  });
});

// ─── snapForPointer — null (no zone) ─────────────────────────────────────────

describe("snapForPointer — returns null when not near any edge", () => {
  const vp: SnapViewport = { width: 1000, height: 800 };

  it("returns null for the viewport center", () => {
    expect(snapForPointer(500, 400, vp)).toBeNull();
  });

  it("returns null for a point well inside the viewport", () => {
    expect(snapForPointer(200, 300, vp)).toBeNull();
  });

  it("returns null just beyond the top edge threshold", () => {
    expect(snapForPointer(500, SNAP_EDGE_THRESHOLD + 1, vp)).toBeNull();
  });

  it("returns null for a pointer one pixel inside the edge threshold but well away from corners", () => {
    // x=13, y=400 — just past edge threshold from left (13 > 12), well away from
    // all corners (y=400 is nowhere near top or bottom corner bands of 36px)
    expect(snapForPointer(SNAP_EDGE_THRESHOLD + 1, 400, vp)).toBeNull();
  });
});

// ─── snapForPointer — with viewport insets ───────────────────────────────────

describe("snapForPointer — viewport with insets", () => {
  // Simulates a menu bar (top=40) and dock (bottom=60).
  const vp: SnapViewport = { width: 1000, height: 800, top: 40, bottom: 60 };
  // Usable box: y starts at 40, maxY = 800-60 = 740

  it("returns 'maximize' when pointer is at the inset top boundary (y=40)", () => {
    expect(snapForPointer(500, 40, vp)).toBe("maximize");
  });

  it("returns 'maximize' when pointer is within SNAP_EDGE_THRESHOLD of the inset top", () => {
    // y = 40 + 12 = 52; nearTop = y - minY = 52 - 40 = 12 ≤ 12
    expect(snapForPointer(500, 40 + SNAP_EDGE_THRESHOLD, vp)).toBe("maximize");
  });

  it("does NOT return 'maximize' at y=40+13 (outside edge threshold)", () => {
    expect(snapForPointer(500, 40 + SNAP_EDGE_THRESHOLD + 1, vp)).toBeNull();
  });

  it("returns 'bottom' near the inset bottom boundary", () => {
    // maxY = 800-60 = 740; y=735 → distance=5 ≤ 12
    expect(snapForPointer(500, 735, vp)).toBe("bottom");
  });

  it("does NOT return 'bottom' at y=0 (above menu bar, not near real bottom)", () => {
    // y=0 → maxY - y = 740; way outside threshold → null
    // (also not near top inset edge since minY=40 and 0-40=-40 ≤ threshold but
    //  it IS within corner threshold; however x=500 is not near corners, so nearTop
    //  = 0 - 40 = -40 ≤ 12 → TRUE, so actually 'maximize' is returned)
    // Let's verify actual behavior:
    const result = snapForPointer(500, 0, vp);
    // y - minY = 0 - 40 = -40 ≤ 12 → nearTop = true → maximize
    expect(result).toBe("maximize");
  });

  it("returns 'topLeft' corner when pointer is near inset top-left corner", () => {
    // x=20 (≤36 from left=0), y=50 (≤36 from top inset at 40: 50-40=10 ≤ 36)
    expect(snapForPointer(20, 50, vp)).toBe("topLeft");
  });

  it("returns 'bottomRight' corner near the inset bottom-right corner", () => {
    // x=980 (≤36 from right: 1000-980=20 ≤ 36), y=725 (maxY-y = 740-725=15 ≤ 36)
    expect(snapForPointer(980, 725, vp)).toBe("bottomRight");
  });
});

// ─── snapForPointer — left/right insets ──────────────────────────────────────

describe("snapForPointer — left and right insets", () => {
  const vp: SnapViewport = { width: 1000, height: 800, left: 20, right: 20 };
  // minX=20, maxX=980

  it("returns 'left' at x=minX (left inset boundary)", () => {
    expect(snapForPointer(20, 400, vp)).toBe("left");
  });

  it("returns 'left' within SNAP_EDGE_THRESHOLD of inset left boundary", () => {
    // x - minX = (20+12) - 20 = 12 ≤ 12
    expect(snapForPointer(20 + SNAP_EDGE_THRESHOLD, 400, vp)).toBe("left");
  });

  it("does NOT return 'left' one pixel beyond left edge threshold", () => {
    expect(snapForPointer(20 + SNAP_EDGE_THRESHOLD + 1, 400, vp)).toBeNull();
  });

  it("returns 'right' at x=maxX (right inset boundary)", () => {
    expect(snapForPointer(980, 400, vp)).toBe("right");
  });

  it("returns 'right' within SNAP_EDGE_THRESHOLD of inset right boundary", () => {
    // maxX - x = 980 - (980-12) = 12 ≤ 12
    expect(snapForPointer(980 - SNAP_EDGE_THRESHOLD, 400, vp)).toBe("right");
  });

  it("does NOT return 'right' beyond inset right edge threshold", () => {
    expect(snapForPointer(980 - SNAP_EDGE_THRESHOLD - 1, 400, vp)).toBeNull();
  });
});

// ─── rectForZone ─────────────────────────────────────────────────────────────

describe("rectForZone", () => {
  const vp: SnapViewport = { width: 1000, height: 800 };

  it("returns null when zone is null", () => {
    expect(rectForZone(null, vp)).toBeNull();
  });

  it("returns the maximize rect for the 'maximize' zone", () => {
    const rect = rectForZone("maximize", vp);
    expect(rect).toEqual({ x: 0, y: 0, w: 1000, h: 800 });
  });

  it("returns the left half rect for the 'left' zone", () => {
    const rect = rectForZone("left", vp);
    expect(rect).toEqual({ x: 0, y: 0, w: 500, h: 800 });
  });

  it("returns the right half rect for the 'right' zone", () => {
    const rect = rectForZone("right", vp);
    expect(rect).toEqual({ x: 500, y: 0, w: 500, h: 800 });
  });

  it("returns the top half rect for the 'top' zone", () => {
    const rect = rectForZone("top", vp);
    expect(rect).toEqual({ x: 0, y: 0, w: 1000, h: 400 });
  });

  it("returns the bottom half rect for the 'bottom' zone", () => {
    const rect = rectForZone("bottom", vp);
    expect(rect).toEqual({ x: 0, y: 400, w: 1000, h: 400 });
  });

  it("returns the topLeft quarter rect", () => {
    const rect = rectForZone("topLeft", vp);
    expect(rect).toEqual({ x: 0, y: 0, w: 500, h: 400 });
  });

  it("returns the topRight quarter rect", () => {
    const rect = rectForZone("topRight", vp);
    expect(rect).toEqual({ x: 500, y: 0, w: 500, h: 400 });
  });

  it("returns the bottomLeft quarter rect", () => {
    const rect = rectForZone("bottomLeft", vp);
    expect(rect).toEqual({ x: 0, y: 400, w: 500, h: 400 });
  });

  it("returns the bottomRight quarter rect", () => {
    const rect = rectForZone("bottomRight", vp);
    expect(rect).toEqual({ x: 500, y: 400, w: 500, h: 400 });
  });

  it("result matches computeSnapZones for the same zone", () => {
    const zones = computeSnapZones(vp);
    const allZones: SnapZoneName[] = [
      "maximize",
      "left",
      "right",
      "top",
      "bottom",
      "topLeft",
      "topRight",
      "bottomLeft",
      "bottomRight",
    ];
    for (const zone of allZones) {
      expect(rectForZone(zone, vp)).toEqual(zones[zone]);
    }
  });

  it("works with insets — maximize matches content box", () => {
    const vpInset: SnapViewport = { width: 800, height: 600, top: 40, bottom: 60 };
    const rect = rectForZone("maximize", vpInset);
    expect(rect).toEqual({ x: 0, y: 40, w: 800, h: 500 });
  });
});

// ─── Integration: snapForPointer + rectForZone round-trip ────────────────────

describe("snapForPointer + rectForZone integration", () => {
  const vp: SnapViewport = { width: 1200, height: 900, top: 30, bottom: 50 };

  it("pointer near top-left corner yields a topLeft rect via rectForZone", () => {
    const zone = snapForPointer(10, 50, vp); // within corner threshold
    const rect = rectForZone(zone, vp);
    const expected = computeSnapZones(vp).topLeft;
    expect(rect).toEqual(expected);
  });

  it("pointer near top center yields maximize rect via rectForZone", () => {
    // x=600 (mid), y=30+5=35 (just inside top edge threshold of inset top)
    const zone = snapForPointer(600, 35, vp);
    expect(zone).toBe("maximize");
    const rect = rectForZone(zone, vp);
    expect(rect).toEqual(computeSnapZones(vp).maximize);
  });

  it("pointer far from all edges yields null zone and null rect", () => {
    const zone = snapForPointer(600, 450, vp);
    expect(zone).toBeNull();
    expect(rectForZone(zone, vp)).toBeNull();
  });
});
