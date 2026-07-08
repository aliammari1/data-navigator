/**
 * Canned briefing fixtures for the grounding eval.
 *
 * Each case pairs a synthetic set of KPIs with a briefing text and a label
 * ("grounded" | "hallucinated"). The grounded briefings cite ONLY figures that
 * trace to the KPIs (mirroring how `ruleBasedSummary` in report-ai.ts phrases
 * things). The hallucinated ones smuggle in invented numbers — fake revenue, made-up
 * percentages, regions, growth rates — that never appear in the inputs.
 *
 * These are deterministic ground truth: the scorer must rank grounded high and
 * hallucinated low with NO model in the loop.
 */

import type { BriefingKpis } from "./briefing-grounding";

export type BriefingLabel = "grounded" | "hallucinated";

export interface BriefingCase {
  name: string;
  label: BriefingLabel;
  kpis: BriefingKpis;
  text: string;
}

// ─── Synthetic KPI sets ──────────────────────────────────────────────────────

const KPI_A: BriefingKpis = {
  status: { reussie: 8200, annulation: 600, instance: 400, echec: 800, total: 10000 },
  channels: [
    { canal: "USSD", nombre: 5200, montant: 1_250_000 },
    { canal: "App", nombre: 3100, montant: 980_000 },
    { canal: "Web", nombre: 1700, montant: 410_000 },
  ],
};
// success 82.0%, fail 8.0%, cancel 6.0%, instance 4.0%
// USSD share 52%, App 31%, Web 17%

const KPI_B: BriefingKpis = {
  status: { reussie: 45_000, annulation: 1_200, instance: 900, echec: 6_900, total: 54_000 },
  channels: [
    { canal: "Retail", nombre: 30_000, montant: 7_800_000 },
    { canal: "Online", nombre: 18_000, montant: 5_100_000 },
    { canal: "Agent", nombre: 6_000, montant: 1_300_000 },
  ],
};
// success 83.3%, fail 12.8%, cancel 2.2%, instance 1.7%
// Retail share 55.6% (56%), Online 33.3% (33%), Agent 11.1% (11%)

const KPI_C: BriefingKpis = {
  status: { reussie: 1_500, annulation: 90, instance: 60, echec: 350, total: 2_000 },
  channels: [
    { canal: "Kiosk", nombre: 1_400, montant: 220_000 },
    { canal: "Call", nombre: 600, montant: 90_000 },
  ],
};
// success 75.0%, fail 17.5%, cancel 4.5%, instance 3.0%
// Kiosk share 70%, Call 30%

// ─── Grounded briefings (every number traces to the KPIs) ────────────────────

const GROUNDED: BriefingCase[] = [
  {
    name: "A · plain rule-based phrasing",
    label: "grounded",
    kpis: KPI_A,
    text:
      "10,000 transactions were processed on 2026-06-16, with a success rate of 82.0% " +
      "(8,200 successful). 800 transactions failed (8.0% failure rate). " +
      'The top channel "USSD" accounts for 52% of all transactions.',
  },
  {
    name: "A · richer narrative, still grounded",
    label: "grounded",
    kpis: KPI_A,
    text:
      "Out of 10,000 total transactions, 8,200 succeeded — a healthy 82.0% success rate. " +
      "Cancellations stood at 600 and 400 remain in progress, while 800 failed outright. " +
      "USSD led volume with 5,200 transactions, ahead of App at 3,100 and Web at 1,700.",
  },
  {
    name: "B · large volumes, derived rates",
    label: "grounded",
    kpis: KPI_B,
    text:
      "54,000 transactions were processed, with a success rate of 83.3% (45,000 successful). " +
      "6,900 transactions failed (12.8% failure rate), and 1,200 were cancelled. " +
      "Retail dominated with 30,000 transactions (about 56% of the total).",
  },
  {
    name: "C · small volumes, high failure",
    label: "grounded",
    kpis: KPI_C,
    text:
      "2,000 transactions were processed, with a success rate of 75.0% (1,500 successful). " +
      "350 transactions failed (17.5% failure rate). Kiosk carried 1,400 transactions, " +
      "roughly 70% of all activity, with Call handling the remaining 600.",
  },
  {
    name: "B · qualitative, no numbers (vacuously clean)",
    label: "grounded",
    kpis: KPI_B,
    text:
      "Transaction throughput held strong today, with the vast majority of attempts clearing " +
      "successfully. Failures remained the main area to watch, concentrated in the retail channel, " +
      "while cancellations and in-progress items stayed minimal. Overall the day looks stable.",
  },
];

// ─── Hallucinated briefings (invented figures the KPIs never contain) ─────────

const HALLUCINATED: BriefingCase[] = [
  {
    name: "A · invented revenue + growth + churn",
    label: "hallucinated",
    kpis: KPI_A,
    text:
      "10,000 transactions were processed with a 82.0% success rate. Revenue reached $4.7M, " +
      "up 23% week-over-week, while churn climbed to 14.5% and the NPS dropped to 31. " +
      "We project 18,400 transactions next week across 7 new regions.",
  },
  {
    name: "A · wrong totals + fabricated percentages",
    label: "hallucinated",
    kpis: KPI_A,
    text:
      "A record 27,500 transactions were processed today, with a 96.4% success rate and only " +
      "a 1.2% failure rate. The Lagos region alone drove 41% of volume, and average ticket size " +
      "rose to 312 units. Fraud was flagged on 2,038 transactions.",
  },
  {
    name: "B · plausible-looking but fabricated metrics",
    label: "hallucinated",
    kpis: KPI_B,
    text:
      "54,000 transactions were processed. Customer satisfaction hit 88%, latency averaged 240ms, " +
      "and the system handled a peak of 1,950 transactions per second. Refunds totaled $612,000 " +
      "and the conversion funnel improved by 7.3 points to 64%.",
  },
  {
    name: "C · invented breakdown that ignores the real split",
    label: "hallucinated",
    kpis: KPI_C,
    text:
      "2,000 transactions were processed. Mobile drove 58% of volume, Desktop 29%, and Tablet 13%. " +
      "Repeat customers made up 44%, average session lasted 6.2 minutes, and the cart-abandonment " +
      "rate fell to 22%. Marketing attributed 3,750 conversions to the new campaign.",
  },
  {
    name: "B · mostly invented, one real anchor",
    label: "hallucinated",
    kpis: KPI_B,
    text:
      "Out of 54,000 transactions, our AI detected 9,820 anomalies, blocked 1,440 fraudulent " +
      "attempts, and saved an estimated $2.1M. Uptime was 99.97%, the model's F1 score reached 0.94, " +
      "and predicted demand will grow 31% next quarter.",
  },
];

export const BRIEFING_CASES: readonly BriefingCase[] = [...GROUNDED, ...HALLUCINATED];

export const GROUNDED_CASES: readonly BriefingCase[] = GROUNDED;
export const HALLUCINATED_CASES: readonly BriefingCase[] = HALLUCINATED;

/** The synthetic KPI set used by the live eval (well-conditioned, distinct numbers). */
export const LIVE_KPIS: BriefingKpis = KPI_A;
