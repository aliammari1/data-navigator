import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { RoomProvider } from "../lib/room-provider";
import CollaborationScreen from "./CollaborationScreen";

/**
 * CollaborationScreen is the real-time collaboration workspace (presence, LAN
 * sessions, comments, shared cursors). It is backed by the per-room CRDT doc
 * (durable y-indexeddb, LAN-syncable) — in Storybook it mounts a local-only room
 * via `RoomProvider` and renders its default offline shell with no connected
 * peers. This is a best-effort render + a11y smoke test and is opted out of
 * visual regression.
 */
const meta = {
  title: "Src/Features/Collaboration/Screens/CollaborationScreen",
  component: CollaborationScreen,
  tags: ["autodocs", "no-visual-test"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen w-full bg-background">
        <RoomProvider roomId="storybook-collab">
          <Story />
        </RoomProvider>
      </div>
    ),
  ],
} satisfies Meta<typeof CollaborationScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
