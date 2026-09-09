/**
 * Grounding scorer for AI briefings over telecom KPIs.
 *
 * The briefing engine (`src/platform/ai/report-ai.ts`) turns a numeric
 * `StatusSummary` + `ChannelStat[]` into a human-readable narrative. The single
 * failure mode that matters for a tiny offline model is HALLUCINATION: inventing
 * numbers that never appeared in the input. This module scores a briefing on two
 * axes that together define "grounded":
 *
 *   1. groundedness — of every numeric claim in the text, what fraction traces
 *      back to a real input figure? (1.0 = no invented metrics.)
 *   2. coverage     — of the key input figures, what fraction did the briefing
 *      actually mention? (so a briefing can't score perfectly by saying nothing.)
 *
 * Both are pure value->value transforms with NO model and NO app imports, so the
 * deterministic eval can exercise them with zero dependencies. The scorer mirrors
 * the real shapes from `report-ai.ts` (`StatusSummary`, `ChannelStat`) so the
 * figures we ground against are exactly the ones the briefing prompt is fed.
 */

// ─── Input shapes (mirror src/platform/ai/report-ai.ts) ──────────────────────

/** Status breakdown — the core numeric KPIs a briefing is built from. */
export interface StatusSummary {
  reussie: number;
  annulation: number;
  instance: number;
  echec: number;
  total: number;
}

/** One channel's volume + amount. */
export interface ChannelStat {
  canal: string;
  nombre: number;
  montant: number;
}

/** The grounding inputs: the figures a briefing is allowed to cite. */
export interface BriefingKpis {
  status: StatusSummary;
  channels: ChannelStat[];
}

// ─── Numeric tolerance ───────────────────────────────────────────────────────

/**
 * A claim like "63.2%" is grounded by a real figure of 63.18%. Percentages are
 * rounded to 1 decimal in the source, so allow a small relative slack plus a tiny
 * absolute floor (for figures near zero). Integers must match closer.
 */
const REL_TOLERANCE = 0.012; // 1.2% relative — covers .1 / .0 rounding of rates
const ABS_FLOOR = 0.15; // absolute slack for small numbers / 1-decimal rounding

function numbersMatch(claim: number, real: number): boolean {
  const diff = Math.abs(claim - real);
  if (diff <= ABS_FLOOR) return true;
  const scale = Math.max(Math.abs(real), Math.abs(claim));
  return diff <= scale * REL_TOLERANCE;
}

// ─── Build the set of grounded figures from the KPIs ─────────────────────────

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}

/**
 * Every numeric figure a briefing may legitimately cite: the raw KPI counts, the
 * total, each channel's volume + amount, and the standard derived rates
 * (success / failure / cancellation / in-progress as a % of total, and each
 * channel's share of total). Derived rates are included because a faithful
 * narrative routinely reports them ("a 91.2% success rate") and they ARE traceable
 * to the inputs — they are not invented.
 */
export function groundedFigures(kpis: BriefingKpis): number[] {
  const { status, channels } = kpis;
  const figs: number[] = [
    status.reussie,
    status.annulation,
    status.instance,
    status.echec,
    status.total,
  ];

  const rates = [
    pct(status.reussie, status.total),
    pct(status.echec, status.total),
    pct(status.annulation, status.total),
    pct(status.instance, status.total),
  ];
  for (const r of rates) if (r !== null) figs.push(Number(r.toFixed(1)));

  for (const c of channels) {
    figs.push(c.nombre, c.montant);
    const share = pct(c.nombre, status.total);
    if (share !== null) figs.push(Number(share.toFixed(1)), Number(share.toFixed(0)));
  }

  // Small whole numbers (counts of channels, "top 3", etc.) are ubiquitous filler
  // that a narrative legitimately uses without it being a data claim. Treat the
  // integers 0..3 as always-grounded so "top 3 channels" never reads as a
  // hallucination.
  figs.push(0, 1, 2, 3);

  return figs;
}

// ─── Extract numeric claims from a briefing's prose ──────────────────────────

/**
 * Pull every numeric token out of free text. Handles:
 *   - thousands separators: "1,234,567" -> 1234567
 *   - decimals / percentages: "91.2%" -> 91.2
 *   - bare integers: "4521" -> 4521
 *
 * A trailing "%" is stripped (the value is compared against percentage figures).
 * ISO date tokens ("2026-06-16") are provenance, not a metric claim, so they are
 * removed BEFORE extraction — the real briefing (report-ai.ts) always stamps the
 * report date into the narrative, and that date must not read as a hallucinated
 * number. Times ("240ms") are NOT stripped: those are real fabricated metrics.
 */
export function extractNumericClaims(text: string): number[] {
  // Drop ISO-8601 dates first so their digit groups don't surface as claims.
  const withoutDates = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");

  const claims: number[] = [];
  // Match an optional sign, then digits (allowing thousands-commas) with an
  // optional decimal part and an optional trailing %. Commas/% are stripped before
  // parsing.
  const re = /-?[\d,]*\d(?:\.\d+)?%?/g;
  const matches = withoutDates.match(re) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replaceAll(",", "").replace(/%$/, "");
    const value = Number(cleaned);
    if (Number.isFinite(value)) claims.push(value);
  }
  return claims;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface GroundingScore {
  /** Fraction of numeric claims in the text that trace to a real figure [0,1]. */
  groundedness: number;
  /** Fraction of key input figures the briefing actually mentions [0,1]. */
  coverage: number;
  /** Combined score: groundedness weighted heavily, coverage as a tie-breaker. */
  overall: number;
  /** Total numeric claims found in the text. */
  claimCount: number;
  /** How many of those claims were grounded. */
  groundedCount: number;
  /** The specific claims that did NOT trace to any figure (the hallucinations). */
  ungrounded: number[];
}

/** Key figures a faithful briefing is expected to surface (drives coverage). */
function keyFigures(kpis: BriefingKpis): number[] {
  const { status } = kpis;
  const keys: number[] = [status.total];
  const success = pct(status.reussie, status.total);
  if (success !== null) keys.push(Number(success.toFixed(1)));
  // The single largest failure-side count the operator cares about.
  keys.push(Math.max(status.echec, status.annulation, status.instance));
  return keys;
}

/**
 * Score a briefing's grounding against its source KPIs.
 *
 * groundedness — a briefing with NO numeric claims is vacuously perfectly grounded
 * (1.0): it invents nothing. Coverage is what stops an empty briefing from winning
 * overall.
 *
 * overall — `0.8 * groundedness + 0.2 * coverage`. Hallucination is the cardinal
 * sin, so groundedness dominates; coverage keeps a content-free briefing from
 * scoring perfectly.
 */
export function scoreBriefingGrounding(text: string, kpis: BriefingKpis): GroundingScore {
  const figures = groundedFigures(kpis);
  const claims = extractNumericClaims(text);

  const ungrounded: number[] = [];
  let groundedCount = 0;
  for (const claim of claims) {
    if (figures.some((f) => numbersMatch(claim, f))) {
      groundedCount += 1;
    } else {
      ungrounded.push(claim);
    }
  }

  const groundedness = claims.length === 0 ? 1 : groundedCount / claims.length;

  const keys = keyFigures(kpis);
  const mentioned = keys.filter((k) => claims.some((c) => numbersMatch(c, k))).length;
  const coverage = keys.length === 0 ? 1 : mentioned / keys.length;

  const overall = 0.8 * groundedness + 0.2 * coverage;

  return {
    groundedness,
    coverage,
    overall,
    claimCount: claims.length,
    groundedCount,
    ungrounded,
  };
}
