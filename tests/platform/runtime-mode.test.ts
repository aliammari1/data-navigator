import { describe, expect, it } from "vitest";
import { isCollaborationVisible, useRuntimeMode } from "@/platform/runtime-mode";

describe("runtime mode", () => {
  it("starts offline and hides collaboration", () => {
    expect(useRuntimeMode.getState().mode).toBe("offline");
    expect(isCollaborationVisible("offline")).toBe(false);
    expect(isCollaborationVisible("online")).toBe(true);
  });
});
