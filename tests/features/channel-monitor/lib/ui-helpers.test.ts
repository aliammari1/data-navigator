import { describe, it, expect } from "vitest";
import {
  healthColor,
  healthTextColor,
  severityBadgeClass,
  severityDot,
  severityWeight,
  metricLabel,
  conditionLabel,
  successRateColor,
  trendSymbol,
} from "@/features/channel-monitor/lib/ui-helpers";

describe("healthColor", () => {
  it("returns bg-emerald-500 for healthy", () => {
    expect(healthColor("healthy")).toBe("bg-emerald-500");
  });

  it("returns bg-amber-500 for degraded", () => {
    expect(healthColor("degraded")).toBe("bg-amber-500");
  });

  it("returns bg-red-500 for critical", () => {
    expect(healthColor("critical")).toBe("bg-red-500");
  });

  it("returns bg-slate-500 for unknown", () => {
    expect(healthColor("unknown")).toBe("bg-slate-500");
  });
});

describe("healthTextColor", () => {
  it("returns text-emerald-400 for healthy", () => {
    expect(healthTextColor("healthy")).toBe("text-emerald-400");
  });

  it("returns text-amber-400 for degraded", () => {
    expect(healthTextColor("degraded")).toBe("text-amber-400");
  });

  it("returns text-red-400 for critical", () => {
    expect(healthTextColor("critical")).toBe("text-red-400");
  });

  it("returns text-slate-400 for unknown", () => {
    expect(healthTextColor("unknown")).toBe("text-slate-400");
  });
});

describe("severityBadgeClass", () => {
  it("returns blue badge class for info", () => {
    expect(severityBadgeClass("info")).toBe(
      "bg-blue-500/20 text-blue-300 border-blue-500/30"
    );
  });

  it("returns amber badge class for warning", () => {
    expect(severityBadgeClass("warning")).toBe(
      "bg-amber-500/20 text-amber-300 border-amber-500/30"
    );
  });

  it("returns red badge class for critical", () => {
    expect(severityBadgeClass("critical")).toBe(
      "bg-red-500/20 text-red-300 border-red-500/30"
    );
  });
});

describe("severityDot", () => {
  it("returns bg-blue-400 for info", () => {
    expect(severityDot("info")).toBe("bg-blue-400");
  });

  it("returns bg-amber-400 for warning", () => {
    expect(severityDot("warning")).toBe("bg-amber-400");
  });

  it("returns bg-red-400 for critical", () => {
    expect(severityDot("critical")).toBe("bg-red-400");
  });
});

describe("severityWeight", () => {
  it("returns 3 for critical", () => {
    expect(severityWeight("critical")).toBe(3);
  });

  it("returns 2 for warning", () => {
    expect(severityWeight("warning")).toBe(2);
  });

  it("returns 1 for info", () => {
    expect(severityWeight("info")).toBe(1);
  });
});

describe("metricLabel", () => {
  it("returns Success Rate for success_rate", () => {
    expect(metricLabel("success_rate")).toBe("Success Rate");
  });

  it("returns Volume for volume", () => {
    expect(metricLabel("volume")).toBe("Volume");
  });

  it("returns Failure Count for failure_count", () => {
    expect(metricLabel("failure_count")).toBe("Failure Count");
  });

  it("returns Avg Amount for avg_amount", () => {
    expect(metricLabel("avg_amount")).toBe("Avg Amount");
  });
});

describe("conditionLabel", () => {
  it("returns Falls below for falls_below", () => {
    expect(conditionLabel("falls_below")).toBe("Falls below");
  });

  it("returns Exceeds for exceeds", () => {
    expect(conditionLabel("exceeds")).toBe("Exceeds");
  });

  it("returns Equals for equals", () => {
    expect(conditionLabel("equals")).toBe("Equals");
  });
});

describe("successRateColor", () => {
  it("returns text-emerald-400 when rate is above 95", () => {
    expect(successRateColor(96)).toBe("text-emerald-400");
  });

  it("returns text-emerald-400 when rate is exactly 95.1", () => {
    expect(successRateColor(95.1)).toBe("text-emerald-400");
  });

  it("returns text-amber-400 when rate is exactly 95", () => {
    // rate > 95 is false, rate >= 85 is true
    expect(successRateColor(95)).toBe("text-amber-400");
  });

  it("returns text-amber-400 when rate is between 85 and 95 inclusive", () => {
    expect(successRateColor(90)).toBe("text-amber-400");
  });

  it("returns text-amber-400 when rate is exactly 85", () => {
    expect(successRateColor(85)).toBe("text-amber-400");
  });

  it("returns text-red-400 when rate is below 85", () => {
    expect(successRateColor(84)).toBe("text-red-400");
  });

  it("returns text-red-400 when rate is 0", () => {
    expect(successRateColor(0)).toBe("text-red-400");
  });
});

describe("trendSymbol", () => {
  it("returns up arrow with emerald class for trend up", () => {
    expect(trendSymbol("up")).toEqual({
      glyph: "↑",
      className: "text-emerald-400 font-bold",
    });
  });

  it("returns down arrow with red class for trend down", () => {
    expect(trendSymbol("down")).toEqual({
      glyph: "↓",
      className: "text-red-400 font-bold",
    });
  });

  it("returns right arrow with slate class for trend stable", () => {
    expect(trendSymbol("stable")).toEqual({
      glyph: "→",
      className: "text-slate-400",
    });
  });
});
