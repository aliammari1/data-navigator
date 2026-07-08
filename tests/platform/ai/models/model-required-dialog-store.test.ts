import { beforeEach, describe, expect, it } from "vitest";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";

describe("useModelRequiredDialogStore", () => {
  beforeEach(() => {
    useModelRequiredDialogStore.setState({ open: false, reason: null });
  });

  it("starts closed with no reason", () => {
    const state = useModelRequiredDialogStore.getState();
    expect(state.open).toBe(false);
    expect(state.reason).toBeNull();
  });

  it("show() opens the dialog and stores the reason", () => {
    useModelRequiredDialogStore.getState().show("Generating an analysis needs a downloaded model.");
    const state = useModelRequiredDialogStore.getState();
    expect(state.open).toBe(true);
    expect(state.reason).toBe("Generating an analysis needs a downloaded model.");
  });

  it("show() defaults to a generic reason when none is given", () => {
    useModelRequiredDialogStore.getState().show();
    expect(useModelRequiredDialogStore.getState().reason).toBeTruthy();
  });

  it("hide() closes the dialog but keeps the last reason (for exit-animation text)", () => {
    useModelRequiredDialogStore.getState().show("some reason");
    useModelRequiredDialogStore.getState().hide();
    const state = useModelRequiredDialogStore.getState();
    expect(state.open).toBe(false);
    expect(state.reason).toBe("some reason");
  });
});
