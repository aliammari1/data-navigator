import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Dataset } from "@/core/stores/data-store";
import { DatasetPreview } from "@/features/folders/components/DatasetPreview";

const { runReadOnlyQueryMock } = vi.hoisted(() => ({ runReadOnlyQueryMock: vi.fn() }));

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: runReadOnlyQueryMock,
}));

function makeDataset(): Dataset {
  return {
    id: "ds_1",
    name: "Ventes Q1",
    tableName: "ventes_q1",
    viewName: "ventes_q1",
    source: "upload",
    format: "csv",
    rowCount: 1234,
    colCount: 2,
    sizeBytes: 4096,
    columns: [
      { name: "montant", type: "number", nullCount: 0, distinctCount: 10, sample: [] },
      { name: "canal", type: "string", nullCount: 0, distinctCount: 3, sample: [] },
    ],
    tags: [],
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    qualityScore: 88,
  };
}

function renderPreview(overrides: Partial<Parameters<typeof DatasetPreview>[0]> = {}) {
  const props = {
    dataset: makeDataset(),
    onClose: vi.fn(),
    onOpenExplorer: vi.fn(),
    onProfile: vi.fn(),
    onTransform: vi.fn(),
    onAskMoudir: vi.fn(),
    ...overrides,
  };
  render(<DatasetPreview {...props} />);
  return props;
}

describe("DatasetPreview", () => {
  it("renders the schema and the fetched rows", async () => {
    runReadOnlyQueryMock.mockResolvedValue([
      { montant: 100, canal: "USSD" },
      { montant: 250, canal: "WEB" },
    ]);

    renderPreview();

    // Column names appear (schema chips + table headers).
    expect(screen.getAllByText("montant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("canal").length).toBeGreaterThan(0);
    // Rows arrive asynchronously from the (mocked) read-only query.
    expect(await screen.findByText("USSD")).toBeInTheDocument();
    expect(screen.getByText("WEB")).toBeInTheDocument();
  });

  it("fires onOpenExplorer when the 'Ouvrir dans l'Explorateur' button is clicked", async () => {
    runReadOnlyQueryMock.mockResolvedValue([]);
    const user = userEvent.setup();
    const props = renderPreview();

    await user.click(screen.getByRole("button", { name: /ouvrir dans l'explorateur/i }));

    expect(props.onOpenExplorer).toHaveBeenCalledTimes(1);
  });

  it("wires the quick actions to their handlers", async () => {
    runReadOnlyQueryMock.mockResolvedValue([]);
    const user = userEvent.setup();
    const props = renderPreview();

    await user.click(screen.getByRole("button", { name: /profiler/i }));
    await user.click(screen.getByRole("button", { name: /demander à moudir/i }));

    expect(props.onProfile).toHaveBeenCalledTimes(1);
    expect(props.onAskMoudir).toHaveBeenCalledTimes(1);
  });

  it("shows an error state when the preview query fails", async () => {
    runReadOnlyQueryMock.mockRejectedValue(new Error("boom"));
    renderPreview();

    expect(await screen.findByText(/aperçu indisponible/i)).toBeInTheDocument();
  });
});
