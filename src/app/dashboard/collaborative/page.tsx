"use client";

import { RoomProvider } from "@/features/collaboration/lib/room-provider";
import CollaborationScreen from "@/features/collaboration/screens/CollaborationScreen";

export default function Page() {
  return (
    <RoomProvider roomId="telecom-default">
      <CollaborationScreen />
    </RoomProvider>
  );
}
