import { describe, expect, it } from "vitest";
import { cn } from "@/shared/utils";

describe("cn utility", () => {
  it("should merge class names correctly", () => {
    const result = cn("class1", "class2");
    expect(result).toBe("class1 class2");
  });

  it("should handle conditional classes", () => {
    const result = cn("base", true && "active", false && "inactive");
    expect(result).toBe("base active");
  });

  it("should handle undefined and null values", () => {
    const result = cn("base", undefined, null, "end");
    expect(result).toBe("base end");
  });

  it("should merge tailwind classes correctly", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toBe("py-1 px-4");
  });

  it("should handle array of classes", () => {
    const result = cn(["class1", "class2"], "class3");
    expect(result).toBe("class1 class2 class3");
  });

  it("should handle object syntax", () => {
    const result = cn("base", { active: true, disabled: false });
    expect(result).toBe("base active");
  });

  it("should return empty string for no arguments", () => {
    const result = cn();
    expect(result).toBe("");
  });

  it("should handle nested arrays", () => {
    const result = cn("base", ["class1", ["class2", "class3"]]);
    expect(result).toBe("base class1 class2 class3");
  });
});
