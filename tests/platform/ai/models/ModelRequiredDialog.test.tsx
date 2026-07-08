import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRequiredDialog } from "@/platform/ai/models/ModelRequiredDialog";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";

const { useModelStatusMock } = vi.hoisted(() => ({
  useModelStatusMock: vi.fn(),
}));

vi.mock("@/platform/ai/models/use-model-status", () => ({
  useModelStatus: useModelStatusMock,
}));

function notReady() {
  useModelStatusMock.mockReturnValue({
    records: [],
    loading: false,
    ready: false,
    downloads: {},
    refresh: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
  });
}

describe("ModelRequiredDialog", () => {
  beforeEach(() => {
    useModelRequiredDialogStore.setState({ open: false, reason: null });
    useModelStatusMock.mockReset();
    notReady();
  });

  it("renders nothing visible when the store is closed", () => {
    render(<ModelRequiredDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the dialog with the stored reason once show() is called", async () => {
    render(<ModelRequiredDialog />);
    useModelRequiredDialogStore.getState().show("Generating an analysis needs a downloaded model.");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Generating an analysis needs a downloaded model."),
    ).toBeInTheDocument();
  });

  it("closing the dialog calls hide() on the store", async () => {
    const user = userEvent.setup();
    render(<ModelRequiredDialog />);
    useModelRequiredDialogStore.getState().show();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(useModelRequiredDialogStore.getState().open).toBe(false);
    });
  });

  it("auto-closes once the model becomes ready", async () => {
    useModelStatusMock.mockReturnValue({
      records: [],
      loading: false,
      ready: true,
      downloads: {},
      refresh: vi.fn(),
      download: vi.fn(),
      cancel: vi.fn(),
    });
    render(<ModelRequiredDialog />);
    useModelRequiredDialogStore.getState().show();
    await waitFor(() => {
      expect(useModelRequiredDialogStore.getState().open).toBe(false);
    });
  });
});
