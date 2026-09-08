"use client";

import CollaborationScreen from "@/features/collaboration/screens/CollaborationScreen";
import { RoomProvider } from "@/features/collaboration/lib/room-provider";

export default function Page() {
  return (
    <RoomProvider roomId="telecom-default">
      <CollaborationScreen />
    </RoomProvider>
  );
}
