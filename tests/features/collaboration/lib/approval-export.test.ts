import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadApprovalRecord } from "@/features/collaboration/lib/approval-export";

describe("downloadApprovalRecord", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads the real approval record as JSON", async () => {
    let exportedBlob: Blob | undefined;
    const mockUrl = Object.assign(class extends URL {}, {
      createObjectURL: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return "blob:approval";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("URL", mockUrl);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("telecom-september-approval.json");
      expect(this.href).toBe("blob:approval");
    });
    const record = {
      reportId: "telecom/september",
      status: "APPROVED" as const,
      reviewerName: "Sam",
      history: [{ id: "h1", status: "APPROVED" as const, by: "Sam", at: 123, comment: "OK" }],
      sharedUrl: "http://127.0.0.1:3000/guest/join",
    };

    downloadApprovalRecord(record);

    expect(click).toHaveBeenCalledOnce();
    expect(exportedBlob?.type).toBe("application/json");
    expect(exportedBlob).toBeDefined();
    const json = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exportedBlob as Blob);
    });
    expect(JSON.parse(json)).toEqual(record);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:approval");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
