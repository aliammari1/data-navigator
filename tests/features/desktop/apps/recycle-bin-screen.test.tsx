import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { type Dataset, useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import RecycleBinScreen from "@/features/desktop/apps/RecycleBinScreen";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";

const dataset = {
  id: "ds_restore_test",
  name: "Telecom.csv",
  tableName: "ds_restore_test",
  viewName: "ds_restore_test",
  columns: [],
} as Dataset;

beforeEach(() => {
  useDataStore.setState({ datasets: [], activeDatasetId: null, loadedTableNames: [] });
  useFoldersStore.setState({ folders: [], datasetFolderMap: {}, starredDatasets: [] });
  useDesktopStore.setState({ recycleBin: [] });
});

describe("RecycleBinScreen restore", () => {
  it("returns a deleted dataset to the UI catalog and removes it from the bin", () => {
    useDesktopStore.getState().recycle({
      id: "rb-ds-restore-test",
      kind: "dataset",
      name: dataset.name,
      payload: { dataset },
    });
    render(<RecycleBinScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(useDataStore.getState().datasets).toContainEqual(
      expect.objectContaining({ id: dataset.id }),
    );
    expect(useDesktopStore.getState().recycleBin).toHaveLength(0);
    expect(screen.getByText("La corbeille est vide")).toBeInTheDocument();
  });

  it("keeps an invalid item in the bin instead of silently losing it", () => {
    useDesktopStore.getState().recycle({
      id: "rb-ds-invalid",
      kind: "dataset",
      name: "Broken.csv",
      payload: {},
    });
    render(<RecycleBinScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Restaurer" }));

    expect(useDesktopStore.getState().recycleBin).toHaveLength(1);
    expect(useDataStore.getState().datasets).toHaveLength(0);
  });
});
