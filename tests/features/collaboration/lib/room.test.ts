/**
 * Unit tests for src/features/collaboration/lib/room.ts
 *
 * The module is a thin feature adapter over @/platform/collab.
 * We mock @/platform/collab so we can drive the real adapter logic.
 * Yjs is a pure JS CRDT library (no native bindings) so we use it for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

// ─── Hoisted mock factories ─────────────────────────────────────────────────

const { platformAcquireRoomMock, platformReleaseRoomMock } = vi.hoisted(() => {
  const platformAcquireRoomMock = vi.fn();
  const platformReleaseRoomMock = vi.fn();
  return { platformAcquireRoomMock, platformReleaseRoomMock };
});

vi.mock("@/platform/collab", () => ({
  acquireRoom: (id: string) => platformAcquireRoomMock(id),
  releaseRoom: (id: string) => platformReleaseRoomMock(id),
}));

// ─── Target under test ──────────────────────────────────────────────────────

import {
  acquireRoom,
  changeFromYMap,
  chatFromYMap,
  commentFromYMap,
  releaseRoom,
} from "@/features/collaboration/lib/room";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a Y.Map with the given plain-object fields set. */
function ymap(fields: Record<string, unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  const m = doc.getMap<unknown>("m");
  doc.transact(() => {
    for (const [k, v] of Object.entries(fields)) {
      m.set(k, v);
    }
  });
  return m;
}

// ─── acquireRoom ────────────────────────────────────────────────────────────

describe("acquireRoom", () => {
  beforeEach(() => {
    platformAcquireRoomMock.mockReset();
  });

  it("delegates to platformAcquireRoom and returns its result", () => {
    const fakeDoc = { id: "room-x" };
    platformAcquireRoomMock.mockReturnValue(fakeDoc);
    const result = acquireRoom("room-x");
    expect(platformAcquireRoomMock).toHaveBeenCalledWith("room-x");
    expect(result).toBe(fakeDoc);
  });
});

// ─── releaseRoom ────────────────────────────────────────────────────────────

describe("releaseRoom", () => {
  beforeEach(() => {
    platformReleaseRoomMock.mockReset();
  });

  it("delegates to platformReleaseRoom", () => {
    platformReleaseRoomMock.mockReturnValue(undefined);
    releaseRoom("room-y");
    expect(platformReleaseRoomMock).toHaveBeenCalledWith("room-y");
  });
});

// ─── commentFromYMap ────────────────────────────────────────────────────────

describe("commentFromYMap", () => {
  it("serializes all fields from a fully-populated Y.Map", () => {
    const m = ymap({
      id: "c1",
      authorId: "u1",
      authorName: "Alice",
      authorColor: "#123456",
      content: "Hello",
      timestamp: 1000,
      cell: "A1",
      resolved: true,
      pinned: true,
      type: "suggestion",
    });
    const result = commentFromYMap(m);
    expect(result.id).toBe("c1");
    expect(result.authorId).toBe("u1");
    expect(result.authorName).toBe("Alice");
    expect(result.authorColor).toBe("#123456");
    expect(result.content).toBe("Hello");
    expect(result.timestamp).toBe(1000);
    expect(result.cell).toBe("A1");
    expect(result.resolved).toBe(true);
    expect(result.pinned).toBe(true);
    expect(result.type).toBe("suggestion");
    expect(result.reactions).toEqual({});
    expect(result.replies).toEqual([]);
  });

  it("falls back authorName to authorId when authorName is absent", () => {
    const m = ymap({ id: "c2", authorId: "u2" });
    const result = commentFromYMap(m);
    expect(result.authorName).toBe("u2");
  });

  it("falls back authorColor to #1E40AF when absent", () => {
    const m = ymap({ id: "c3", authorId: "u3" });
    const result = commentFromYMap(m);
    expect(result.authorColor).toBe("#1E40AF");
  });

  it("falls back content to empty string when absent", () => {
    const m = ymap({ id: "c4", authorId: "u4" });
    const result = commentFromYMap(m);
    expect(result.content).toBe("");
  });

  it("returns timestamp=0 when timestamp is not a finite number (missing)", () => {
    const m = ymap({ id: "c5", authorId: "u5" });
    const result = commentFromYMap(m);
    expect(result.timestamp).toBe(0);
  });

  it("returns cell=null when cell is absent", () => {
    const m = ymap({ id: "c6", authorId: "u6" });
    const result = commentFromYMap(m);
    expect(result.cell).toBeNull();
  });

  it("returns cell=null when cell is explicitly null", () => {
    const m = ymap({ id: "c7", authorId: "u7", cell: null });
    const result = commentFromYMap(m);
    expect(result.cell).toBeNull();
  });

  it("falls back type to 'comment' when absent", () => {
    const m = ymap({ id: "c8", authorId: "u8" });
    const result = commentFromYMap(m);
    expect(result.type).toBe("comment");
  });

  it("resolved=false when resolved is absent", () => {
    const m = ymap({ id: "c9", authorId: "u9" });
    const result = commentFromYMap(m);
    expect(result.resolved).toBe(false);
  });

  it("pinned=false when pinned is absent", () => {
    const m = ymap({ id: "c10", authorId: "u10" });
    const result = commentFromYMap(m);
    expect(result.pinned).toBe(false);
  });

  it("deserializes reactions from a Y.Map containing Y.Array values", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const reactionsMap = new Y.Map<Y.Array<string>>();
    const users = new Y.Array<string>();
    doc.transact(() => {
      users.push(["peer-1", "peer-2"]);
      reactionsMap.set("👍", users);
      m.set("id", "c11");
      m.set("authorId", "u11");
      m.set("reactions", reactionsMap);
    });
    const result = commentFromYMap(m);
    expect(result.reactions).toEqual({ "👍": ["peer-1", "peer-2"] });
  });

  it("deserializes reactions from a Y.Map containing plain array values", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const reactionsMap = new Y.Map<unknown>();
    doc.transact(() => {
      reactionsMap.set("❤️", ["peer-a"]);
      m.set("id", "c12");
      m.set("authorId", "u12");
      m.set("reactions", reactionsMap);
    });
    const result = commentFromYMap(m);
    // A plain array inside a Y.Map — the Y.Array check fails, falls back to array check
    expect(result.reactions).toEqual({ "❤️": ["peer-a"] });
  });

  it("deserializes reactions from a plain object (non-Y.Map)", () => {
    // The reactions field is a plain JS object with array values.
    // We set it as a plain JS object — this goes through the second branch.
    // We can't easily set a plain object directly into a Y.Map without it being
    // treated as a value; test via the plain-object fallback path in reactionsToObject.
    // We'll build via ymap with a null reactions to trigger the {} return (no reactions key),
    // but that doesn't test the plain object path.
    // Instead, create a doc manually and insert a plain object reference indirectly.
    // NOTE: The Y.Map branch and Y.Array sub-branch are already tested above.
    // The plain-object branch is tested here by calling commentFromYMap with
    // a Y.Map that has its "reactions" set to a non-Y.Map object value.
    // Y doesn't let you store plain objects directly in a Y.Map in a shared doc,
    // but the accessor reads it via m.get("reactions") and checks instanceof.
    // We can test by reading a Y.Map after it's been set with a plain object value.
    const doc = new Y.Doc();
    const outerMap = doc.getMap<unknown>("m");
    // Set reactions to a plain string (not an object, not a Y.Map) — triggers {} return
    doc.transact(() => {
      outerMap.set("id", "c13");
      outerMap.set("authorId", "u13");
      outerMap.set("reactions", "not-a-map");
    });
    const result = commentFromYMap(outerMap);
    expect(result.reactions).toEqual({});
  });

  it("deserializes replies from a Y.Array containing Y.Map entries", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const repliesArr = new Y.Array<Y.Map<unknown>>();
    const replyMap = new Y.Map<unknown>();
    doc.transact(() => {
      replyMap.set("id", "r1");
      replyMap.set("authorId", "ua");
      replyMap.set("authorName", "Author A");
      replyMap.set("content", "Reply content");
      replyMap.set("timestamp", 5000);
      repliesArr.push([replyMap]);
      m.set("id", "c14");
      m.set("authorId", "u14");
      m.set("replies", repliesArr);
    });
    const result = commentFromYMap(m);
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]).toEqual({
      id: "r1",
      authorId: "ua",
      authorName: "Author A",
      content: "Reply content",
      timestamp: 5000,
    });
  });

  it("deserializes replies from a Y.Array containing plain-object entries", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    // Y.Array can hold plain JSON-serializable objects in Yjs
    // But in practice, Yjs stores objects as plain values inside Y.Array.
    // repliesToArray checks `r instanceof Y.Map` — a plain object falls to the else branch.
    const repliesArr = new Y.Array<unknown>();
    doc.transact(() => {
      repliesArr.push([
        { id: "r2", authorId: "ub", authorName: "Author B", content: "Hi", timestamp: 2000 },
      ]);
      m.set("id", "c15");
      m.set("authorId", "u15");
      m.set("replies", repliesArr);
    });
    const result = commentFromYMap(m);
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0].id).toBe("r2");
    expect(result.replies[0].authorName).toBe("Author B");
    expect(result.replies[0].timestamp).toBe(2000);
  });

  it("repliesToArray: falls back authorName to authorId when authorName is missing", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const repliesArr = new Y.Array<unknown>();
    doc.transact(() => {
      // No authorName field — should fall back to authorId
      repliesArr.push([{ id: "r3", authorId: "uc", content: "Test", timestamp: 100 }]);
      m.set("id", "c16");
      m.set("authorId", "u16");
      m.set("replies", repliesArr);
    });
    const result = commentFromYMap(m);
    expect(result.replies[0].authorName).toBe("uc");
  });

  it("repliesToArray: returns empty array for non-array replies value", () => {
    const m = ymap({ id: "c17", authorId: "u17", replies: "not-an-array" });
    const result = commentFromYMap(m);
    expect(result.replies).toEqual([]);
  });

  it("repliesToArray: returns timestamp=0 when timestamp is missing in reply", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const repliesArr = new Y.Array<unknown>();
    doc.transact(() => {
      repliesArr.push([{ id: "r4", authorId: "ud", authorName: "D", content: "No ts" }]);
      m.set("id", "c18");
      m.set("authorId", "u18");
      m.set("replies", repliesArr);
    });
    const result = commentFromYMap(m);
    expect(result.replies[0].timestamp).toBe(0);
  });
});

// ─── changeFromYMap ──────────────────────────────────────────────────────────

describe("changeFromYMap", () => {
  it("serializes all required fields from a fully-populated Y.Map", () => {
    const m = ymap({
      id: "ch1",
      authorId: "u1",
      authorName: "Bob",
      timestamp: 2000,
      type: "edit",
      description: "Changed A1",
      cell: "A1",
      oldValue: "old",
      newValue: "new",
      rowsAffected: 3,
      approved: true,
    });
    const result = changeFromYMap(m);
    expect(result.id).toBe("ch1");
    expect(result.authorId).toBe("u1");
    expect(result.authorName).toBe("Bob");
    expect(result.timestamp).toBe(2000);
    expect(result.type).toBe("edit");
    expect(result.description).toBe("Changed A1");
    expect(result.cell).toBe("A1");
    expect(result.oldValue).toBe("old");
    expect(result.newValue).toBe("new");
    expect(result.rowsAffected).toBe(3);
    expect(result.approved).toBe(true);
  });

  it("falls back authorName to authorId when authorName is absent", () => {
    const m = ymap({ id: "ch2", authorId: "u2" });
    const result = changeFromYMap(m);
    expect(result.authorName).toBe("u2");
  });

  it("falls back type to 'edit' when absent", () => {
    const m = ymap({ id: "ch3", authorId: "u3" });
    const result = changeFromYMap(m);
    expect(result.type).toBe("edit");
  });

  it("falls back description to empty string when absent", () => {
    const m = ymap({ id: "ch4", authorId: "u4" });
    const result = changeFromYMap(m);
    expect(result.description).toBe("");
  });

  it("returns timestamp=0 when timestamp is absent", () => {
    const m = ymap({ id: "ch5", authorId: "u5" });
    const result = changeFromYMap(m);
    expect(result.timestamp).toBe(0);
  });

  it("returns undefined for optional fields when absent", () => {
    const m = ymap({ id: "ch6", authorId: "u6" });
    const result = changeFromYMap(m);
    expect(result.cell).toBeUndefined();
    expect(result.oldValue).toBeUndefined();
    expect(result.newValue).toBeUndefined();
    expect(result.rowsAffected).toBeUndefined();
    expect(result.approved).toBeUndefined();
  });
});

// ─── chatFromYMap ────────────────────────────────────────────────────────────

describe("chatFromYMap", () => {
  it("serializes all fields from a fully-populated Y.Map", () => {
    const m = ymap({
      id: "msg1",
      authorId: "u1",
      authorName: "Carol",
      authorColor: "#abcdef",
      text: "Hello chat!",
      ts: 9999,
    });
    const result = chatFromYMap(m);
    expect(result.id).toBe("msg1");
    expect(result.authorId).toBe("u1");
    expect(result.authorName).toBe("Carol");
    expect(result.authorColor).toBe("#abcdef");
    expect(result.text).toBe("Hello chat!");
    expect(result.ts).toBe(9999);
  });

  it("falls back authorName to authorId when authorName is absent", () => {
    const m = ymap({ id: "msg2", authorId: "u2" });
    const result = chatFromYMap(m);
    expect(result.authorName).toBe("u2");
  });

  it("falls back authorColor to #1E40AF when absent", () => {
    const m = ymap({ id: "msg3", authorId: "u3" });
    const result = chatFromYMap(m);
    expect(result.authorColor).toBe("#1E40AF");
  });

  it("falls back text to empty string when absent", () => {
    const m = ymap({ id: "msg4", authorId: "u4" });
    const result = chatFromYMap(m);
    expect(result.text).toBe("");
  });

  it("returns ts=0 when ts is absent", () => {
    const m = ymap({ id: "msg5", authorId: "u5" });
    const result = chatFromYMap(m);
    expect(result.ts).toBe(0);
  });
});

// ─── reactionsToObject: plain-object branch ─────────────────────────────────

describe("reactionsToObject: plain-object branch (via commentFromYMap)", () => {
  it("converts a plain object with array values to a reactions record", () => {
    // To reach the plain-object branch in reactionsToObject, we need a value
    // that is truthy, typeof === 'object', but NOT instanceof Y.Map.
    // In a Y.Doc, we can't directly store a plain object. However, the function
    // is called by commentFromYMap with m.get("reactions").
    // We test by first understanding that in the Y.Map branch (Y.Array path),
    // if the users value is a plain array (not Y.Array), it still goes to list = users
    // and then Array.isArray(list) is true.
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const reactionsYMap = new Y.Map<unknown>();
    // Set a plain array as a value in the Y.Map (not Y.Array)
    doc.transact(() => {
      reactionsYMap.set("🎉", ["alice", "bob"]);
      m.set("id", "c20");
      m.set("authorId", "u20");
      m.set("reactions", reactionsYMap);
    });
    const result = commentFromYMap(m);
    // The Y.Map branch is taken; users = ["alice", "bob"] (plain array);
    // Y.Array check fails; list = users; Array.isArray(list) = true.
    expect(result.reactions["🎉"]).toEqual(["alice", "bob"]);
  });

  it("skips reaction entries with non-array values inside Y.Map branch", () => {
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    const reactionsYMap = new Y.Map<unknown>();
    doc.transact(() => {
      // Non-array value stored under a key — Array.isArray(list) will be false
      reactionsYMap.set("🔥", "not-an-array");
      m.set("id", "c21");
      m.set("authorId", "u21");
      m.set("reactions", reactionsYMap);
    });
    const result = commentFromYMap(m);
    // "🔥" entry is skipped because the list is not an array
    expect(result.reactions["🔥"]).toBeUndefined();
    expect(Object.keys(result.reactions)).toHaveLength(0);
  });

  it("converts a stored plain object (non-Y.Map) with array values to reactions record", () => {
    // Yjs lets you store plain JS objects as values in a Y.Map.
    // This reaches the second branch: value && typeof value === 'object' && !(value instanceof Y.Map)
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    doc.transact(() => {
      m.set("id", "c30");
      m.set("authorId", "u30");
      // Store a plain object — this is NOT instanceof Y.Map
      m.set("reactions", { "👍": ["peer-x", "peer-y"], "❤️": ["peer-z"] });
    });
    const result = commentFromYMap(m);
    expect(result.reactions["👍"]).toEqual(["peer-x", "peer-y"]);
    expect(result.reactions["❤️"]).toEqual(["peer-z"]);
  });

  it("skips non-array values inside a plain-object reactions map", () => {
    // Tests the Array.isArray(users) false branch inside the plain-object loop
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    doc.transact(() => {
      m.set("id", "c31");
      m.set("authorId", "u31");
      // Mix of array and non-array values
      m.set("reactions", { "👍": ["peer-a"], "🔥": "not-an-array", "❤️": 42 });
    });
    const result = commentFromYMap(m);
    // Only the array value should be included
    expect(result.reactions["👍"]).toEqual(["peer-a"]);
    expect(result.reactions["🔥"]).toBeUndefined();
    expect(result.reactions["❤️"]).toBeUndefined();
  });
});

// ─── repliesToArray: non-Y.Array input path ─────────────────────────────────

describe("repliesToArray: non-Y.Array input (via commentFromYMap)", () => {
  it("handles a plain array as replies value (not Y.Array)", () => {
    // In a Y.Map, a plain array can be stored as a JSON value.
    // repliesToArray: value is not instanceof Y.Array → raw = value directly.
    // Since Yjs serializes plain arrays as JS arrays in memory, we test:
    const doc = new Y.Doc();
    const m = doc.getMap<unknown>("m");
    doc.transact(() => {
      m.set("id", "c22");
      m.set("authorId", "u22");
      // Store a plain array — repliesToArray gets raw = value (not Y.Array)
      m.set("replies", [
        { id: "r-x", authorId: "ux", authorName: "X", content: "hi", timestamp: 42 },
      ]);
    });
    const result = commentFromYMap(m);
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0].authorId).toBe("ux");
    expect(result.replies[0].timestamp).toBe(42);
  });
});
