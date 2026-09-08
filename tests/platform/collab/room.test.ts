/**
 * @vitest-environment jsdom
 *
 * Contract tests for the singleton-backed room substrate: room handles must be
 * views onto the app `ydoc` (same roots, same shared Awareness) so the LAN
 * transport in `@/platform/lan/lan-collab` is the ONLY provider ever attached
 * to the document — the old per-room Y.Doc/Awareness/provider stack duplicated
 * every peer and forked the CRDT state.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getAppAwareness, ydoc } from "@/platform/collab/collab";
import { acquireRoom, getRoomDoc, releaseRoom } from "@/platform/collab/room";

describe("getRoomDoc (singleton-backed)", () => {
  it("returns a stable handle per roomId", () => {
    const a = getRoomDoc("telecom-default");
    const b = getRoomDoc("telecom-default");
    expect(a).toBe(b);
    expect(acquireRoom("telecom-default")).toBe(a);
  });

  it("backs every room with the app ydoc and its root types", () => {
    const room = getRoomDoc("telecom-default");
    expect(room.doc).toBe(ydoc);
    expect(room.comments).toBe(ydoc.getArray("comments"));
    expect(room.changes).toBe(ydoc.getArray("changes"));
    expect(room.chat).toBe(ydoc.getArray("chat"));
    expect(room.annotations).toBe(ydoc.getMap("annotations"));
    expect(room.approvals).toBe(ydoc.getMap("approvals"));
    expect(room.audit).toBe(ydoc.getArray("audit"));
    expect(room.meta).toBe(ydoc.getMap("meta"));
  });

  it("shares ONE Awareness instance with the app substrate (no duplicate rosters)", () => {
    const room = getRoomDoc("telecom-default");
    expect(room.awareness).not.toBeNull();
    expect(room.awareness).toBe(getAppAwareness());
    // Every room handle rides the same awareness — a second instance on the
    // same Hocuspocus document is exactly the duplicated-peer bug.
    expect(getRoomDoc("another-room").awareness).toBe(room.awareness);
  });

  it("whenStored resolves even without IndexedDB (SSR/jsdom fallback + no-op migration)", async () => {
    await expect(getRoomDoc("telecom-default").whenStored).resolves.toBeUndefined();
  });

  it("releaseRoom and destroy are safe no-ops — the app doc must survive room unmounts", () => {
    const room = getRoomDoc("telecom-default");
    room.comments.push([new Y.Map()]);
    const lengthBefore = room.comments.length;
    releaseRoom("telecom-default");
    room.destroy();
    // Handle still usable, doc intact.
    expect(getRoomDoc("telecom-default").comments.length).toBe(lengthBefore);
  });
});
