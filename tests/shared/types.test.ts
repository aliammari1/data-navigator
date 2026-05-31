import { describe, expect, it } from "vitest";

describe("Shared Types", () => {
  it("should support NonEmptyArray type", () => {
    const arr: import("@/shared/types").NonEmptyArray<number> = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr[0]).toBe(1);
  });

  it("should support SupportedExtensions type", () => {
    const ext: import("@/shared/types").SupportedExtensions = "csv";
    expect(ext).toBe("csv");
  });
});
