import { describe, expect, it } from "vitest";
import { relativeTime } from "@/shared/relative-time";

describe("relativeTime", () => {
  it("returns an empty string for undefined input", () => {
    expect(relativeTime(undefined)).toBe("");
  });

  it("returns an empty string for an unparseable date", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("returns an empty string for a future timestamp", () => {
    expect(relativeTime(Date.now() + 60_000)).toBe("");
  });

  it("returns 'à l'instant' for under a minute", () => {
    expect(relativeTime(Date.now() - 10_000)).toBe("à l'instant");
  });

  it("returns minutes for under an hour", () => {
    expect(relativeTime(Date.now() - 5 * 60_000)).toBe("5 min");
  });

  it("returns hours for under a day", () => {
    expect(relativeTime(Date.now() - 3 * 60 * 60_000)).toBe("3 h");
  });

  it("returns days for a day or more", () => {
    expect(relativeTime(Date.now() - 2 * 24 * 60 * 60_000)).toBe("2 j");
  });

  it("accepts a Date object", () => {
    expect(relativeTime(new Date(Date.now() - 10_000))).toBe("à l'instant");
  });
});
