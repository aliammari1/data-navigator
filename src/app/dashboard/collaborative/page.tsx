"use client";

import { useEffect, useState } from "react";
import { RoomProvider } from "@/features/collaboration/lib/room-provider";
import CollaborationScreen from "@/features/collaboration/screens/CollaborationScreen";
import { readLANSettings, subscribeLAN } from "@/platform/lan/lan-collab";
import { useRuntimeMode } from "@/platform/runtime-mode";

export default function Page() {
  const online = useRuntimeMode((s) => s.mode === "online");
  const [roomId, setRoomId] = useState(() => readLANSettings().room || "telecom-default");

  useEffect(() => {
    return subscribeLAN(() => {
      const current = readLANSettings().room;
      if (current) {
        setRoomId((prev) => (prev !== current ? current : prev));
      }
    });
  }, []);

  if (!online) return null;

  return (
    <RoomProvider roomId={roomId}>
      <CollaborationScreen />
    </RoomProvider>
  );
}
