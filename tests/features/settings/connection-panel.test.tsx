import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionPanel } from "@/features/settings/components/panels/connection-panel";
import { useRuntimeMode } from "@/platform/runtime-mode";

const { disconnectLAN } = vi.hoisted(() => ({ disconnectLAN: vi.fn(async () => {}) }));
vi.mock("@/platform/lan/lan-collab", () => ({ disconnectLAN }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const runtimeWindow = window as Window & {
  electronRuntime?: { setMode: (mode: "offline" | "online") => Promise<"offline" | "online"> };
};

beforeEach(() => {
  useRuntimeMode.getState().setMode("offline");
  runtimeWindow.electronRuntime = { setMode: vi.fn(async (mode) => mode) };
  disconnectLAN.mockClear();
});

afterEach(() => {
  cleanup();
  delete runtimeWindow.electronRuntime;
});

describe("ConnectionPanel", () => {
  it("switches modes without opening a collaboration session", async () => {
    render(<ConnectionPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Online/i }));
    await waitFor(() => expect(useRuntimeMode.getState().mode).toBe("online"));
    expect(runtimeWindow.electronRuntime?.setMode).toHaveBeenCalledWith("online");
    expect(disconnectLAN).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Offline/i }));
    await waitFor(() => expect(useRuntimeMode.getState().mode).toBe("offline"));
    expect(disconnectLAN).toHaveBeenCalledOnce();
  });
});
