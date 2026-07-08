"use client";

/**
 * Desktop-hosted entry for the collaboration workspace.
 *
 * The desktop registry mounts screens bare (no route wrapper), but
 * `CollaborationScreen` reads the per-room CRDT doc via `useRoom()` /
 * `useLocalPeer()`, which require a `RoomProvider`. This wrapper supplies the
 * same `telecom-default` room the `/dashboard/collaborative` route uses, so the
 * launcher window gets a fully working collaboration surface (comments, chat,
 * presence) alongside the report-review tabs (annotations / approval / audit).
 */

import { RoomProvider } from "../lib/room-provider";
import CollaborationScreen from "./CollaborationScreen";

export default function CollaborationHostedScreen() {
  return (
    <RoomProvider roomId="telecom-default">
      <CollaborationScreen />
    </RoomProvider>
  );
}
