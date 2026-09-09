/**
 * Per-room collaboration document for the /dashboard/collaborative screen.
 *
 * This is the single source of truth the screen consumes. Comments, changes,
 * chat (and annotations/approvals/audit) live in Yjs shared types so they:
 *  - merge concurrently across peers/tabs as real CRDTs (no last-write clobber),
 *  - survive reload via durable y-indexeddb persistence (`whenStored`),
 *  - sync same-origin across tabs (BroadcastChannel) and cross-machine over the
 *    LAN y-websocket provider — without the screen touching transport.
 *
 * The heavy lifting (Yjs doc lifecycle, y-indexeddb durability, y-protocols
 * awareness, y-websocket transport, ref-counting) is owned by the platform
 * collaboration substrate `@/platform/collab`. This module is a thin feature
 * adapter: it re-exports the platform room handle and owns ONLY the feature's
 * view-model shapes + Y.Map ⇆ plain-object serialization. This deletes the old
 * persistence-less BroadcastChannel-only silo that used to live here.
 */

"use client";

import * as Y from "yjs";
import {
  type CollabRoomDoc,
  acquireRoom as platformAcquireRoom,
  releaseRoom as platformReleaseRoom,
} from "@/platform/collab";

export type CommentKind = "comment" | "suggestion" | "question" | "approval";

export interface RoomComment {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  content: string;
  timestamp: number;
  cell: string | null;
  resolved: boolean;
  pinned: boolean;
  type: CommentKind;
  /** emoji -> list of peer ids who reacted (CRDT-merged map). */
  reactions: Record<string, string[]>;
  replies: RoomReply[];
}

export interface RoomReply {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
}

export type ChangeKind = "edit" | "add_row" | "delete_row" | "schema" | "filter" | "sort";

export interface RoomChange {
  id: string;
  authorId: string;
  authorName: string;
  timestamp: number;
  type: ChangeKind;
  description: string;
  cell?: string;
  oldValue?: string;
  newValue?: string;
  rowsAffected?: number;
  approved?: boolean;
}

export interface RoomChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  text: string;
  ts: number;
}

/**
 * The feature-facing room handle. This is the platform `CollabRoomDoc` — the
 * screen reads `comments/changes/chat` as `Y.Array<Y.Map<unknown>>`, presence
 * from `awareness`, and gates first render on `whenStored` (durable load).
 */
export type RoomDoc = CollabRoomDoc;

/**
 * Acquire (or create) the shared, durable room document via the platform
 * substrate. Reference-counted: every acquire must be balanced with a
 * `releaseRoom(roomId)` so persistence/awareness/providers tear down when the
 * last consumer (this route) unmounts.
 */
export function acquireRoom(roomId: string): RoomDoc {
  return platformAcquireRoom(roomId);
}

export function releaseRoom(roomId: string): void {
  platformReleaseRoom(roomId);
}

// ─── Serialization helpers ────────────────────────────────────────────────────

function reactionsToObject(value: unknown): Record<string, string[]> {
  if (value instanceof Y.Map) {
    const out: Record<string, string[]> = {};
    for (const [emoji, users] of value.entries()) {
      const list = users instanceof Y.Array ? users.toArray() : users;
      if (Array.isArray(list)) out[emoji] = list.map(String);
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, string[]> = {};
    for (const [emoji, users] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(users)) out[emoji] = users.map(String);
    }
    return out;
  }
  return {};
}

function repliesToArray(value: unknown): RoomReply[] {
  const raw = value instanceof Y.Array ? value.toArray() : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const m = r instanceof Y.Map ? (r.toJSON() as RoomReply) : (r as RoomReply);
    return {
      id: String(m.id),
      authorId: String(m.authorId),
      authorName: String(m.authorName ?? m.authorId),
      content: String(m.content),
      timestamp: Number(m.timestamp) || 0,
    };
  });
}

export function commentFromYMap(m: Y.Map<unknown>): RoomComment {
  return {
    id: String(m.get("id")),
    authorId: String(m.get("authorId")),
    authorName: String(m.get("authorName") ?? m.get("authorId")),
    authorColor: String(m.get("authorColor") ?? "#1E40AF"),
    content: String(m.get("content") ?? ""),
    timestamp: Number(m.get("timestamp")) || 0,
    cell: (m.get("cell") as string | null) ?? null,
    resolved: Boolean(m.get("resolved")),
    pinned: Boolean(m.get("pinned")),
    type: (m.get("type") as CommentKind) ?? "comment",
    reactions: reactionsToObject(m.get("reactions")),
    replies: repliesToArray(m.get("replies")),
  };
}

export function changeFromYMap(m: Y.Map<unknown>): RoomChange {
  return {
    id: String(m.get("id")),
    authorId: String(m.get("authorId")),
    authorName: String(m.get("authorName") ?? m.get("authorId")),
    timestamp: Number(m.get("timestamp")) || 0,
    type: (m.get("type") as ChangeKind) ?? "edit",
    description: String(m.get("description") ?? ""),
    cell: m.get("cell") as string | undefined,
    oldValue: m.get("oldValue") as string | undefined,
    newValue: m.get("newValue") as string | undefined,
    rowsAffected: m.get("rowsAffected") as number | undefined,
    approved: m.get("approved") as boolean | undefined,
  };
}

export function chatFromYMap(m: Y.Map<unknown>): RoomChatMessage {
  return {
    id: String(m.get("id")),
    authorId: String(m.get("authorId")),
    authorName: String(m.get("authorName") ?? m.get("authorId")),
    authorColor: String(m.get("authorColor") ?? "#1E40AF"),
    text: String(m.get("text") ?? ""),
    ts: Number(m.get("ts")) || 0,
  };
}
