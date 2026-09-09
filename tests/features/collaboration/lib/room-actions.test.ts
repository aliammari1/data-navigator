import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import type {
  RoomChange,
  RoomChatMessage,
  RoomComment,
  RoomDoc,
  RoomReply,
} from "@/features/collaboration/lib/room";
import {
  addComment,
  addReply,
  contributionCounts,
  hourlyActivity,
  type LocalPeer,
  recordChange,
  resolveComment,
  sendChat,
  togglePin,
  toggleReaction,
} from "@/features/collaboration/lib/room-actions";

/**
 * room-actions operates on the platform `CollabRoomDoc`, but the only surface
 * the CRDT helpers touch is `{ doc, comments, changes, chat }`. yjs is a pure
 * JS CRDT library (no native bindings, deterministic), so we drive a REAL Y.Doc
 * rather than mocking — this exercises the actual transact/merge behaviour the
 * module is written to preserve.
 */
function makeRoom(): RoomDoc {
  const doc = new Y.Doc();
  const comments = doc.getArray<Y.Map<unknown>>("comments");
  const changes = doc.getArray<Y.Map<unknown>>("changes");
  const chat = doc.getArray<Y.Map<unknown>>("chat");
  // Only the four fields the actions module reads are needed for these tests.
  return { id: "room-1", doc, comments, changes, chat } as unknown as RoomDoc;
}

const PEER: LocalPeer = { id: "peer-1", name: "Ada", color: "#2f6bff" };
const PEER2: LocalPeer = { id: "peer-2", name: "Bo", color: "#5e8bff" };

function firstComment(room: RoomDoc): Y.Map<unknown> {
  return room.comments.get(0);
}

describe("addComment", () => {
  let room: RoomDoc;
  beforeEach(() => {
    room = makeRoom();
  });

  it("appends a comment with all view-model fields populated", () => {
    addComment(room, PEER, { content: "Hello", cell: "A1", type: "comment" });

    expect(room.comments.length).toBe(1);
    const m = firstComment(room);
    expect(typeof m.get("id")).toBe("string");
    expect(String(m.get("id")).startsWith("c-")).toBe(true);
    expect(m.get("authorId")).toBe("peer-1");
    expect(m.get("authorName")).toBe("Ada");
    expect(m.get("authorColor")).toBe("#2f6bff");
    expect(m.get("content")).toBe("Hello");
    expect(typeof m.get("timestamp")).toBe("number");
    expect(m.get("cell")).toBe("A1");
    expect(m.get("resolved")).toBe(false);
    expect(m.get("pinned")).toBe(false);
    expect(m.get("type")).toBe("comment");
  });

  it("initialises reactions as a Y.Map and replies as a Y.Array", () => {
    addComment(room, PEER, { content: "x", cell: null, type: "question" });
    const m = firstComment(room);
    expect(m.get("reactions")).toBeInstanceOf(Y.Map);
    expect(m.get("replies")).toBeInstanceOf(Y.Array);
    expect((m.get("reactions") as Y.Map<unknown>).size).toBe(0);
    expect((m.get("replies") as Y.Array<unknown>).length).toBe(0);
  });

  it("trims surrounding whitespace from content", () => {
    addComment(room, PEER, { content: "  spaced  ", cell: null, type: "comment" });
    expect(firstComment(room).get("content")).toBe("spaced");
  });

  it("is a no-op when content is empty", () => {
    addComment(room, PEER, { content: "", cell: null, type: "comment" });
    expect(room.comments.length).toBe(0);
  });

  it("is a no-op when content is whitespace only", () => {
    addComment(room, PEER, { content: "   \t\n ", cell: null, type: "comment" });
    expect(room.comments.length).toBe(0);
  });

  it("stores null cell when cell is null", () => {
    addComment(room, PEER, { content: "x", cell: null, type: "comment" });
    expect(firstComment(room).get("cell")).toBeNull();
  });

  it("trims a provided cell value", () => {
    addComment(room, PEER, { content: "x", cell: "  B2  ", type: "comment" });
    expect(firstComment(room).get("cell")).toBe("B2");
  });

  it("coerces a whitespace-only cell to null", () => {
    addComment(room, PEER, { content: "x", cell: "   ", type: "comment" });
    expect(firstComment(room).get("cell")).toBeNull();
  });

  it("preserves the comment type passed in", () => {
    addComment(room, PEER, { content: "x", cell: null, type: "approval" });
    expect(firstComment(room).get("type")).toBe("approval");
  });

  it("unshifts so the newest comment is at index 0", () => {
    addComment(room, PEER, { content: "first", cell: null, type: "comment" });
    addComment(room, PEER, { content: "second", cell: null, type: "comment" });
    expect(room.comments.length).toBe(2);
    expect(room.comments.get(0).get("content")).toBe("second");
    expect(room.comments.get(1).get("content")).toBe("first");
  });
});

describe("resolveComment", () => {
  let room: RoomDoc;
  beforeEach(() => {
    room = makeRoom();
    addComment(room, PEER, { content: "needs review", cell: null, type: "comment" });
  });

  it("sets resolved=true on the matching comment", () => {
    const id = String(firstComment(room).get("id"));
    resolveComment(room, id);
    expect(firstComment(room).get("resolved")).toBe(true);
  });

  it("is a no-op when no comment matches the id", () => {
    resolveComment(room, "does-not-exist");
    expect(firstComment(room).get("resolved")).toBe(false);
  });
});

describe("togglePin", () => {
  let room: RoomDoc;
  let id: string;
  beforeEach(() => {
    room = makeRoom();
    addComment(room, PEER, { content: "pin me", cell: null, type: "comment" });
    id = String(firstComment(room).get("id"));
  });

  it("flips pinned from false to true", () => {
    togglePin(room, id);
    expect(firstComment(room).get("pinned")).toBe(true);
  });

  it("flips pinned back to false on a second toggle", () => {
    togglePin(room, id);
    togglePin(room, id);
    expect(firstComment(room).get("pinned")).toBe(false);
  });

  it("is a no-op for an unknown id", () => {
    togglePin(room, "missing");
    expect(firstComment(room).get("pinned")).toBe(false);
  });
});

describe("toggleReaction", () => {
  let room: RoomDoc;
  let id: string;
  beforeEach(() => {
    room = makeRoom();
    addComment(room, PEER, { content: "react", cell: null, type: "comment" });
    id = String(firstComment(room).get("id"));
  });

  function reactions(): Y.Map<Y.Array<string>> {
    return firstComment(room).get("reactions") as Y.Map<Y.Array<string>>;
  }

  it("adds the peer id under the emoji on first toggle", () => {
    toggleReaction(room, id, "👍", "peer-1");
    const users = reactions().get("👍");
    expect(users).toBeInstanceOf(Y.Array);
    expect((users as Y.Array<string>).toArray()).toEqual(["peer-1"]);
  });

  it("removes the peer and deletes the emoji key when the last reactor leaves", () => {
    toggleReaction(room, id, "👍", "peer-1");
    toggleReaction(room, id, "👍", "peer-1");
    expect(reactions().has("👍")).toBe(false);
  });

  it("keeps the emoji key when other reactors remain", () => {
    toggleReaction(room, id, "🎉", "peer-1");
    toggleReaction(room, id, "🎉", "peer-2");
    // peer-1 toggles off; peer-2 still present.
    toggleReaction(room, id, "🎉", "peer-1");
    expect(reactions().get("🎉")?.toArray()).toEqual(["peer-2"]);
  });

  it("accumulates distinct peers under the same emoji", () => {
    toggleReaction(room, id, "❤️", "peer-1");
    toggleReaction(room, id, "❤️", "peer-2");
    expect(reactions().get("❤️")?.toArray()).toEqual(["peer-1", "peer-2"]);
  });

  it("tracks multiple emojis independently", () => {
    toggleReaction(room, id, "👍", "peer-1");
    toggleReaction(room, id, "👎", "peer-1");
    expect(reactions().get("👍")?.toArray()).toEqual(["peer-1"]);
    expect(reactions().get("👎")?.toArray()).toEqual(["peer-1"]);
  });

  it("is a no-op when the comment id is unknown", () => {
    toggleReaction(room, "missing", "👍", "peer-1");
    // The existing comment's reactions stay empty.
    expect(reactions().size).toBe(0);
  });

  it("recreates a reactions map when the stored value is not a Y.Map", () => {
    // Simulate a malformed/legacy doc where reactions is a plain value.
    room.doc.transact(() => {
      firstComment(room).set("reactions", "corrupt");
    });
    toggleReaction(room, id, "👍", "peer-1");
    expect(firstComment(room).get("reactions")).toBeInstanceOf(Y.Map);
    expect(reactions().get("👍")?.toArray()).toEqual(["peer-1"]);
  });
});

describe("addReply", () => {
  let room: RoomDoc;
  let id: string;
  beforeEach(() => {
    room = makeRoom();
    addComment(room, PEER, { content: "thread", cell: null, type: "comment" });
    id = String(firstComment(room).get("id"));
  });

  function replies(): Y.Array<Y.Map<unknown>> {
    return firstComment(room).get("replies") as Y.Array<Y.Map<unknown>>;
  }

  it("pushes a reply with trimmed content and author identity", () => {
    addReply(room, PEER2, id, "  good point  ");
    expect(replies().length).toBe(1);
    const r = replies().get(0);
    expect(r.get("content")).toBe("good point");
    expect(r.get("authorId")).toBe("peer-2");
    expect(r.get("authorName")).toBe("Bo");
    expect(String(r.get("id")).startsWith("r-")).toBe(true);
    expect(typeof r.get("timestamp")).toBe("number");
  });

  it("appends replies in chronological (push) order", () => {
    addReply(room, PEER, id, "one");
    addReply(room, PEER2, id, "two");
    expect(replies().get(0).get("content")).toBe("one");
    expect(replies().get(1).get("content")).toBe("two");
  });

  it("is a no-op for empty text", () => {
    addReply(room, PEER, id, "");
    expect(replies().length).toBe(0);
  });

  it("is a no-op for whitespace-only text", () => {
    addReply(room, PEER, id, "   ");
    expect(replies().length).toBe(0);
  });

  it("is a no-op when the comment id is unknown", () => {
    addReply(room, PEER, "missing", "hi");
    expect(replies().length).toBe(0);
  });

  it("recreates a replies array when the stored value is not a Y.Array", () => {
    room.doc.transact(() => {
      firstComment(room).set("replies", 42);
    });
    addReply(room, PEER, id, "recovered");
    expect(firstComment(room).get("replies")).toBeInstanceOf(Y.Array);
    expect(replies().length).toBe(1);
    expect(replies().get(0).get("content")).toBe("recovered");
  });
});

describe("sendChat", () => {
  let room: RoomDoc;
  beforeEach(() => {
    room = makeRoom();
  });

  it("pushes a chat message with trimmed text and identity", () => {
    sendChat(room, PEER, "  hi team  ");
    expect(room.chat.length).toBe(1);
    const m = room.chat.get(0);
    expect(m.get("text")).toBe("hi team");
    expect(m.get("authorId")).toBe("peer-1");
    expect(m.get("authorName")).toBe("Ada");
    expect(m.get("authorColor")).toBe("#2f6bff");
    expect(String(m.get("id")).startsWith("m-")).toBe(true);
    expect(typeof m.get("ts")).toBe("number");
  });

  it("is a no-op for empty text", () => {
    sendChat(room, PEER, "");
    expect(room.chat.length).toBe(0);
  });

  it("is a no-op for whitespace-only text", () => {
    sendChat(room, PEER, "  \n\t ");
    expect(room.chat.length).toBe(0);
  });

  it("appends messages in send order", () => {
    sendChat(room, PEER, "first");
    sendChat(room, PEER2, "second");
    expect(room.chat.get(0).get("text")).toBe("first");
    expect(room.chat.get(1).get("text")).toBe("second");
  });
});

describe("recordChange", () => {
  let room: RoomDoc;
  beforeEach(() => {
    room = makeRoom();
  });

  it("records required fields and the author identity", () => {
    recordChange(room, PEER, { type: "edit", description: "changed A1" });
    expect(room.changes.length).toBe(1);
    const m = room.changes.get(0);
    expect(m.get("type")).toBe("edit");
    expect(m.get("description")).toBe("changed A1");
    expect(m.get("authorId")).toBe("peer-1");
    expect(m.get("authorName")).toBe("Ada");
    expect(String(m.get("id")).startsWith("ch-")).toBe(true);
    expect(typeof m.get("timestamp")).toBe("number");
  });

  it("omits optional string fields when not provided", () => {
    recordChange(room, PEER, { type: "filter", description: "applied filter" });
    const m = room.changes.get(0);
    expect(m.has("cell")).toBe(false);
    expect(m.has("oldValue")).toBe(false);
    expect(m.has("newValue")).toBe(false);
    expect(m.has("rowsAffected")).toBe(false);
  });

  it("includes optional string fields when truthy", () => {
    recordChange(room, PEER, {
      type: "edit",
      description: "d",
      cell: "C3",
      oldValue: "10",
      newValue: "20",
    });
    const m = room.changes.get(0);
    expect(m.get("cell")).toBe("C3");
    expect(m.get("oldValue")).toBe("10");
    expect(m.get("newValue")).toBe("20");
  });

  it("drops empty-string optional fields because they are falsy", () => {
    recordChange(room, PEER, {
      type: "edit",
      description: "d",
      cell: "",
      oldValue: "",
      newValue: "",
    });
    const m = room.changes.get(0);
    expect(m.has("cell")).toBe(false);
    expect(m.has("oldValue")).toBe(false);
    expect(m.has("newValue")).toBe(false);
  });

  it("records rowsAffected=0 because the guard is !== undefined", () => {
    recordChange(room, PEER, { type: "add_row", description: "d", rowsAffected: 0 });
    const m = room.changes.get(0);
    expect(m.has("rowsAffected")).toBe(true);
    expect(m.get("rowsAffected")).toBe(0);
  });

  it("records a non-zero rowsAffected", () => {
    recordChange(room, PEER, { type: "delete_row", description: "d", rowsAffected: 7 });
    expect(room.changes.get(0).get("rowsAffected")).toBe(7);
  });

  it("unshifts so the newest change is at index 0", () => {
    recordChange(room, PEER, { type: "edit", description: "old" });
    recordChange(room, PEER, { type: "edit", description: "new" });
    expect(room.changes.get(0).get("description")).toBe("new");
    expect(room.changes.get(1).get("description")).toBe("old");
  });
});

// ─── Pure aggregation helpers ─────────────────────────────────────────────────

function comment(over: Partial<RoomComment>): RoomComment {
  return {
    id: "c",
    authorId: "a",
    authorName: "A",
    authorColor: "#111111",
    content: "",
    timestamp: 0,
    cell: null,
    resolved: false,
    pinned: false,
    type: "comment",
    reactions: {},
    replies: [],
    ...over,
  };
}

function reply(over: Partial<RoomReply>): RoomReply {
  return { id: "r", authorId: "a", authorName: "A", content: "", timestamp: 0, ...over };
}

function chatMsg(over: Partial<RoomChatMessage>): RoomChatMessage {
  return {
    id: "m",
    authorId: "a",
    authorName: "A",
    authorColor: "#222222",
    text: "",
    ts: 0,
    ...over,
  };
}

function change(over: Partial<RoomChange>): RoomChange {
  return {
    id: "ch",
    authorId: "a",
    authorName: "A",
    timestamp: 0,
    type: "edit",
    description: "",
    ...over,
  };
}

describe("contributionCounts", () => {
  it("returns an empty map for no activity", () => {
    expect(contributionCounts([], []).size).toBe(0);
  });

  it("counts one contribution per comment authored", () => {
    const out = contributionCounts(
      [comment({ authorId: "u1", authorName: "One", authorColor: "#aaa" })],
      [],
    );
    expect(out.get("u1")).toEqual({ name: "One", color: "#aaa", count: 1 });
  });

  it("aggregates multiple comments by the same author", () => {
    const out = contributionCounts(
      [
        comment({ authorId: "u1", authorName: "One", authorColor: "#aaa" }),
        comment({ authorId: "u1", authorName: "One", authorColor: "#aaa" }),
      ],
      [],
    );
    expect(out.get("u1")?.count).toBe(2);
  });

  it("counts replies and assigns the fixed reply color #64748b", () => {
    const out = contributionCounts(
      [
        comment({
          authorId: "u1",
          authorName: "One",
          authorColor: "#aaa",
          replies: [reply({ authorId: "u2", authorName: "Two" })],
        }),
      ],
      [],
    );
    expect(out.get("u1")?.count).toBe(1);
    expect(out.get("u2")).toEqual({ name: "Two", color: "#64748b", count: 1 });
  });

  it("counts chat messages by author", () => {
    const out = contributionCounts(
      [],
      [chatMsg({ authorId: "u3", authorName: "Three", authorColor: "#ccc" })],
    );
    expect(out.get("u3")).toEqual({ name: "Three", color: "#ccc", count: 1 });
  });

  it("merges comment, reply and chat contributions for one author", () => {
    const out = contributionCounts(
      [
        comment({
          authorId: "u1",
          authorName: "One",
          authorColor: "#aaa",
          replies: [reply({ authorId: "u1", authorName: "One" })],
        }),
      ],
      [chatMsg({ authorId: "u1", authorName: "One", authorColor: "#aaa" })],
    );
    expect(out.get("u1")?.count).toBe(3);
  });

  it("keeps the first-seen name/color when later entries differ", () => {
    // The bump helper only writes name/color on first insert.
    const out = contributionCounts(
      [
        comment({ authorId: "u1", authorName: "First", authorColor: "#first" }),
        comment({ authorId: "u1", authorName: "Renamed", authorColor: "#later" }),
      ],
      [],
    );
    expect(out.get("u1")).toEqual({ name: "First", color: "#first", count: 2 });
  });
});

describe("hourlyActivity", () => {
  // Build a timestamp pinned to a known LOCAL hour (the impl uses getHours()).
  function tsAtLocalHour(hour: number): number {
    const d = new Date(2024, 0, 2, hour, 30, 0, 0);
    return d.getTime();
  }

  it("returns 24 zeroed buckets for no activity", () => {
    const out = hourlyActivity([], [], []);
    expect(out).toHaveLength(24);
    expect(out.every((n) => n === 0)).toBe(true);
  });

  it("buckets a comment into its local hour", () => {
    const out = hourlyActivity([comment({ timestamp: tsAtLocalHour(9) })], [], []);
    expect(out[9]).toBe(1);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("buckets replies, changes and chat alongside comments", () => {
    const out = hourlyActivity(
      [
        comment({
          timestamp: tsAtLocalHour(10),
          replies: [reply({ timestamp: tsAtLocalHour(10) })],
        }),
      ],
      [change({ timestamp: tsAtLocalHour(10) })],
      [chatMsg({ ts: tsAtLocalHour(10) })],
    );
    expect(out[10]).toBe(4);
  });

  it("ignores non-finite timestamps (NaN / Infinity)", () => {
    const out = hourlyActivity(
      [comment({ timestamp: Number.NaN }), comment({ timestamp: Number.POSITIVE_INFINITY })],
      [],
      [],
    );
    expect(out.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("ignores zero and negative timestamps", () => {
    const out = hourlyActivity([comment({ timestamp: 0 }), comment({ timestamp: -1000 })], [], []);
    expect(out.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("distributes events across distinct hours", () => {
    const out = hourlyActivity(
      [comment({ timestamp: tsAtLocalHour(0) }), comment({ timestamp: tsAtLocalHour(23) })],
      [],
      [],
    );
    expect(out[0]).toBe(1);
    expect(out[23]).toBe(1);
    expect(out.reduce((a, b) => a + b, 0)).toBe(2);
  });
});
