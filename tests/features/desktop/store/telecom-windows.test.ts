import { beforeEach, describe, expect, it } from "vitest";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";

describe("telecom desktop windows", () => {
  beforeEach(() => {
    useDesktopStore.setState({ windows: [], zCounter: 0, spawnSeed: 0 });
  });

  it("opens separate windows for separate datasets and reuses the same dataset window", () => {
    const open = useDesktopStore.getState().openApp;
    const first = open("telecom", { props: { datasetId: "file-a" } });
    const second = open("telecom", { props: { datasetId: "file-b" } });
    const firstAgain = open("telecom", { props: { datasetId: "file-a" } });

    expect(first).toBeDefined();
    expect(second).not.toBe(first);
    expect(firstAgain).toBe(first);
    expect(useDesktopStore.getState().windows.map((window) => window.props?.datasetId)).toEqual([
      "file-a",
      "file-b",
    ]);
  });
});
