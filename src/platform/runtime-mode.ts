import { create } from "zustand";

export type RuntimeMode = "offline" | "online";

type RuntimeModeState = {
  mode: RuntimeMode;
  setMode: (mode: RuntimeMode) => void;
};

export const useRuntimeMode = create<RuntimeModeState>((set) => ({
  mode: "offline",
  setMode: (mode) => set({ mode }),
}));

export function isCollaborationVisible(mode: RuntimeMode): boolean {
  return mode === "online";
}

export async function loadRuntimeMode(): Promise<RuntimeMode> {
  if (typeof window === "undefined") return "offline";
  const bridge = (window as Window & { electronRuntime?: { getMode: () => Promise<RuntimeMode> } })
    .electronRuntime;
  const mode = bridge ? await bridge.getMode().catch(() => "offline" as const) : "offline";
  useRuntimeMode.getState().setMode(mode);
  return mode;
}
