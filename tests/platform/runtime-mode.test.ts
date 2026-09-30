import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCollaborationVisible, loadRuntimeMode, useRuntimeMode } from "@/platform/runtime-mode";

describe("runtime mode", () => {
  beforeEach(() => {
    useRuntimeMode.getState().setMode("offline");
  });

  afterEach(() => {
    // @ts-expect-error clean up mock
    delete window.electronRuntime;
  });

  it("starts offline and hides collaboration", () => {
    expect(useRuntimeMode.getState().mode).toBe("offline");
    expect(isCollaborationVisible("offline")).toBe(false);
    expect(isCollaborationVisible("online")).toBe(true);
  });

  it("loadRuntimeMode returns offline when window.electronRuntime is missing", async () => {
    const mode = await loadRuntimeMode();
    expect(mode).toBe("offline");
    expect(useRuntimeMode.getState().mode).toBe("offline");
  });

  it("loadRuntimeMode loads online when electronRuntime returns online", async () => {
    // @ts-expect-error mock window.electronRuntime
    window.electronRuntime = {
      getMode: vi.fn().mockResolvedValue("online"),
    };

    const mode = await loadRuntimeMode();
    expect(mode).toBe("online");
    expect(useRuntimeMode.getState().mode).toBe("online");
  });

  it("loadRuntimeMode falls back to offline when electronRuntime throws", async () => {
    // @ts-expect-error mock window.electronRuntime
    window.electronRuntime = {
      getMode: vi.fn().mockRejectedValue(new Error("bridge failure")),
    };

    const mode = await loadRuntimeMode();
    expect(mode).toBe("offline");
    expect(useRuntimeMode.getState().mode).toBe("offline");
  });
});
