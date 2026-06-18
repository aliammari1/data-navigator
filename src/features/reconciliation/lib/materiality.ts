/**
 * Distribution-aware materiality.
 *
 * The legacy stub flagged a row as material with a flat `|variance%| > 5` rule.
 * That magic constant ignores the shape of the variance distribution: in a noisy
 * dataset every row looks material, in a tight one nothing does.
 *
 * Here we use `simple-statistics` (already installed) to compute a robust,
 * median/MAD-based threshold (a modified z-score). Rows whose absolute variance%
 * is an outlier relative to the run's own distribution are material — alongside
 * the user's flat tolerance as a floor. ADDED/REMOVED rows are always material.
 */

import { median, medianAbsoluteDeviation } from "simple-statistics";
import type { DiffStatus } from "./recon-sql";

/** Standard scaling so MAD estimates the normal-distribution sigma. */
const MAD_SIGMA_SCALE = 1.4826;
/** Modified z-score cutoff above which a point is an outlier (Iglewicz–Hoaglin). */
const MODIFIED_Z_CUTOFF = 3.5;

export interface MaterialityModel {
  /** Median of |variance%| across rows with a defined variance%. */
  center: number;
  /** Scaled MAD (robust sigma estimate); 0 when the distribution is degenerate. */
  scale: number;
  /** Effective |variance%| threshold actually applied (max of MAD-based + flat). */
  threshold: number;
  /** Number of finite samples the model was fit on. */
  sampleSize: number;
}

/**
 * Fit a robust materiality model from the run's variance% distribution.
 *
 * `tolerancePct` is the user's flat floor; the effective threshold is the larger
 * of the MAD-derived outlier boundary and that floor, so the model can only ever
 * make materiality *stricter* than a naive flat rule never looser than the
 * explicit user tolerance.
 */
export function fitMateriality(
  variancePcts: Array<number | null>,
  tolerancePct: number,
): MaterialityModel {
  const samples = variancePcts
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .map((v) => Math.abs(v));

  const floor = Math.abs(tolerancePct);

  if (samples.length < 4) {
    // Too few points for a meaningful distribution — fall back to the flat floor.
    return { center: floor, scale: 0, threshold: floor, sampleSize: samples.length };
  }

  const center = median(samples);
  const mad = medianAbsoluteDeviation(samples);
  const scale = mad * MAD_SIGMA_SCALE;

  // |variance%| at which the modified z-score crosses the outlier cutoff.
  const madThreshold = scale > 0 ? center + MODIFIED_Z_CUTOFF * scale : floor;
  const threshold = Math.max(madThreshold, floor);

  return { center, scale, threshold, sampleSize: samples.length };
}

/**
 * Decide whether a single row is material given the fitted model.
 * Structural changes (ADDED / REMOVED) are always material.
 */
export function isMaterialRow(
  status: DiffStatus,
  variancePct: number | null,
  model: MaterialityModel,
): boolean {
  if (status === "ADDED" || status === "REMOVED") return true;
  if (status === "UNCHANGED") return false;
  if (variancePct === null || !Number.isFinite(variancePct)) return false;
  return Math.abs(variancePct) > model.threshold;
}
