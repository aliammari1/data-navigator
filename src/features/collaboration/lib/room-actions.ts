/**
 * CRDT mutation helpers for the collaboration room.
 *
 * All writes go through a single `doc.transact` so concurrent edits merge as
 * proper CRDT operations (a reaction toggle no longer clobbers a sibling
 * reaction the way the old `.map()` clone-and-replace logic did).
 */

"use client";

import * as Y from "yjs";
import type {
  ChangeKind,
  CommentKind,
  RoomChange,
  RoomChatMessage,
  RoomComment,
  RoomDoc,
} from "./room";

export interface LocalPeer {
  id: string;
  name: string;
  color: string;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function addComment(
  room: RoomDoc,
  peer: LocalPeer,
  input: { content: string; cell: string | null; type: CommentKind },
): void {
  const content = input.content.trim();
  if (!content) return;
  room.doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("id", newId("c"));
    m.set("authorId", peer.id);
    m.set("authorName", peer.name);
    m.set("authorColor", peer.color);
    m.set("content", content);
    m.set("timestamp", Date.now());
    m.set("cell", input.cell?.trim() ? input.cell.trim() : null);
    m.set("resolved", false);
    m.set("pinned", false);
    m.set("type", input.type);
    m.set("reactions", new Y.Map<Y.Array<string>>());
    m.set("replies", new Y.Array<Y.Map<unknown>>());
    room.comments.unshift([m]);
  });
}

function findComment(room: RoomDoc, id: string): Y.Map<unknown> | null {
  for (const m of room.comments) {
    if (m.get("id") === id) return m;
  }
  return null;
}

export function resolveComment(room: RoomDoc, id: string): void {
  room.doc.transact(() => {
    const m = findComment(room, id);
    if (m) m.set("resolved", true);
  });
}

export function togglePin(room: RoomDoc, id: string): void {
  room.doc.transact(() => {
    const m = findComment(room, id);
    if (m) m.set("pinned", !m.get("pinned"));
  });
}

/**
 * Toggle a reaction for the current peer. Reactions are a nested
 * `Y.Map<emoji, Y.Array<peerId>>` so concurrent reactions from different peers
 * merge instead of overwriting each other.
 */
export function toggleReaction(
  room: RoomDoc,
  commentId: string,
  emoji: string,
  peerId: string,
): void {
  room.doc.transact(() => {
    const m = findComment(room, commentId);
    if (!m) return;
    let reactions = m.get("reactions") as Y.Map<Y.Array<string>> | undefined;
    if (!(reactions instanceof Y.Map)) {
      reactions = new Y.Map<Y.Array<string>>();
      m.set("reactions", reactions);
    }
    let users = reactions.get(emoji);
    if (!(users instanceof Y.Array)) {
      users = new Y.Array<string>();
      reactions.set(emoji, users);
    }
    const current = users.toArray();
    const idx = current.indexOf(peerId);
    if (idx >= 0) {
      users.delete(idx, 1);
      if (users.length === 0) reactions.delete(emoji);
    } else {
      users.push([peerId]);
    }
  });
}

export function addReply(room: RoomDoc, peer: LocalPeer, commentId: string, text: string): void {
  const content = text.trim();
  if (!content) return;
  room.doc.transact(() => {
    const m = findComment(room, commentId);
    if (!m) return;
    let replies = m.get("replies") as Y.Array<Y.Map<unknown>> | undefined;
    if (!(replies instanceof Y.Array)) {
      replies = new Y.Array<Y.Map<unknown>>();
      m.set("replies", replies);
    }
    const reply = new Y.Map<unknown>();
    reply.set("id", newId("r"));
    reply.set("authorId", peer.id);
    reply.set("authorName", peer.name);
    reply.set("content", content);
    reply.set("timestamp", Date.now());
    replies.push([reply]);
  });
}

export function sendChat(room: RoomDoc, peer: LocalPeer, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  room.doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("id", newId("m"));
    m.set("authorId", peer.id);
    m.set("authorName", peer.name);
    m.set("authorColor", peer.color);
    m.set("text", trimmed);
    m.set("ts", Date.now());
    room.chat.push([m]);
  });
}

export function recordChange(
  room: RoomDoc,
  peer: LocalPeer,
  input: {
    type: ChangeKind;
    description: string;
    cell?: string;
    oldValue?: string;
    newValue?: string;
    rowsAffected?: number;
  },
): void {
  room.doc.transact(() => {
    const m = new Y.Map<unknown>();
    m.set("id", newId("ch"));
    m.set("authorId", peer.id);
    m.set("authorName", peer.name);
    m.set("timestamp", Date.now());
    m.set("type", input.type);
    m.set("description", input.description);
    if (input.cell) m.set("cell", input.cell);
    if (input.oldValue) m.set("oldValue", input.oldValue);
    if (input.newValue) m.set("newValue", input.newValue);
    if (input.rowsAffected !== undefined) m.set("rowsAffected", input.rowsAffected);
    room.changes.unshift([m]);
  });
}

/** Count a peer's total contributions for the (real) contribution chart. */
export function contributionCounts(
  comments: RoomComment[],
  chat: RoomChatMessage[],
): Map<string, { name: string; color: string; count: number }> {
  const out = new Map<string, { name: string; color: string; count: number }>();
  const bump = (id: string, name: string, color: string) => {
    const prev = out.get(id);
    if (prev) prev.count += 1;
    else out.set(id, { name, color, count: 1 });
  };
  for (const c of comments) {
    bump(c.authorId, c.authorName, c.authorColor);
    for (const r of c.replies) bump(r.authorId, r.authorName, "#64748b");
  }
  for (const m of chat) bump(m.authorId, m.authorName, m.authorColor);
  return out;
}

/**
 * Real hourly activity (24 buckets, local hour 0..23) derived from the CRDT
 * timestamps of comments, changes and chat. This replaces the old
 * `Math.random()` activity chart with a count that traces to actual edits.
 */
export function hourlyActivity(
  comments: RoomComment[],
  changes: RoomChange[],
  chat: RoomChatMessage[],
): number[] {
  const buckets = new Array<number>(24).fill(0);
  const add = (ts: number) => {
    if (!Number.isFinite(ts) || ts <= 0) return;
    const h = new Date(ts).getHours();
    if (h >= 0 && h < 24) buckets[h] += 1;
  };
  for (const c of comments) {
    add(c.timestamp);
    for (const r of c.replies) add(r.timestamp);
  }
  for (const ch of changes) add(ch.timestamp);
  for (const m of chat) add(m.ts);
  return buckets;
}
