import {
  fitMateriality,
  isMaterialRow,
  type MaterialityModel,
} from "@/features/reconciliation/lib/materiality";

describe("fitMateriality", () => {
  it("falls back to the flat tolerance floor when fewer than four finite samples", () => {
    const model = fitMateriality([1, null, 2], 5);
    expect(model.sampleSize).toBe(2);
    expect(model.scale).toBe(0);
    expect(model.center).toBe(5);
    expect(model.threshold).toBe(5);
  });

  it("uses the absolute value of the tolerance as the floor", () => {
    const model = fitMateriality([null], -8);
    expect(model.threshold).toBe(8);
    expect(model.center).toBe(8);
  });

  it("ignores null and non-finite variance%% samples when counting", () => {
    const model = fitMateriality(
      [1, 2, null, Number.NaN, Number.POSITIVE_INFINITY],
      5,
    );
    // only the two finite samples survive → below the 4-sample minimum
    expect(model.sampleSize).toBe(2);
  });

  it("fits a median/MAD model on a tight distribution and clamps to the floor", () => {
    // A perfectly tight distribution → MAD = 0 → scale 0 → threshold = floor.
    const model = fitMateriality([2, 2, 2, 2, 2, 2], 5);
    expect(model.sampleSize).toBe(6);
    expect(model.center).toBe(2);
    expect(model.scale).toBe(0);
    expect(model.threshold).toBe(5);
  });

  it("derives a threshold above the median for a spread distribution", () => {
    const samples = [1, 1, 2, 2, 3, 3, 4, 4, 100];
    const model = fitMateriality(samples, 1);
    expect(model.sampleSize).toBe(9);
    // a real spread → positive scale and a threshold well above both the
    // median center and the flat floor
    expect(model.scale).toBeGreaterThan(0);
    expect(model.threshold).toBeGreaterThan(model.center);
    expect(model.threshold).toBeGreaterThan(1);
  });

  it("uses |variance%%| so negative variances widen the distribution like positives", () => {
    const positive = fitMateriality([1, 2, 3, 50], 1);
    const negative = fitMateriality([-1, -2, -3, -50], 1);
    expect(negative.center).toBe(positive.center);
    expect(negative.scale).toBeCloseTo(positive.scale);
    expect(negative.threshold).toBeCloseTo(positive.threshold);
  });

  it("never returns a threshold looser than the explicit user tolerance", () => {
    const samples = [0.1, 0.1, 0.1, 0.1, 0.2];
    const model = fitMateriality(samples, 25);
    expect(model.threshold).toBeGreaterThanOrEqual(25);
  });
});

describe("isMaterialRow", () => {
  const model: MaterialityModel = {
    center: 2,
    scale: 1,
    threshold: 10,
    sampleSize: 20,
  };

  it("treats ADDED rows as always material", () => {
    expect(isMaterialRow("ADDED", null, model)).toBe(true);
    expect(isMaterialRow("ADDED", 0, model)).toBe(true);
  });

  it("treats REMOVED rows as always material", () => {
    expect(isMaterialRow("REMOVED", null, model)).toBe(true);
  });

  it("treats UNCHANGED rows as never material", () => {
    expect(isMaterialRow("UNCHANGED", 9999, model)).toBe(false);
  });

  it("returns false for a CHANGED row with null or non-finite variance%%", () => {
    expect(isMaterialRow("CHANGED", null, model)).toBe(false);
    expect(isMaterialRow("CHANGED", Number.NaN, model)).toBe(false);
  });

  it("flags a CHANGED row only when |variance%%| strictly exceeds the threshold", () => {
    expect(isMaterialRow("CHANGED", 11, model)).toBe(true);
    expect(isMaterialRow("CHANGED", -11, model)).toBe(true);
    // exactly at the threshold is NOT material (strict >)
    expect(isMaterialRow("CHANGED", 10, model)).toBe(false);
    expect(isMaterialRow("CHANGED", 5, model)).toBe(false);
  });
});
