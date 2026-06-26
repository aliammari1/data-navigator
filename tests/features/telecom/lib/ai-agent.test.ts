import { describe, expect, it, vi } from "vitest";
import {
  type AgentContext,
  type AgentGenerate,
  type AgentGenerateStructured,
  type AgentInsight,
  askAgent,
  computeRuleInsights,
  generateNarrative,
} from "@/features/telecom/lib/ai-agent";
import type {
  PeriodKPI,
  RowAnomaly,
  SubStatusRow,
  TopAccountRow,
} from "@/features/telecom/lib/period-queries";

// ─── Builders ────────────────────────────────────────────────────────────────

const kpi = (overrides: Partial<PeriodKPI> = {}): PeriodKPI => ({
  total: overrides.total ?? 100,
  success: overrides.success ?? 90,
  declined: overrides.declined ?? 10,
  refund: overrides.refund ?? 0,
  instance: overrides.instance ?? 0,
  submitted: overrides.submitted ?? 0,
  amount: overrides.amount ?? 1000,
  successRate: overrides.successRate ?? 90,
  uniqueCustomers: overrides.uniqueCustomers ?? 50,
  uniqueAccounts: overrides.uniqueAccounts ?? 50,
  uniqueBrands: overrides.uniqueBrands ?? 3,
  avgAmount: overrides.avgAmount ?? 10,
});

const subStatusRow = (overrides: Partial<SubStatusRow> = {}): SubStatusRow => ({
  parent: overrides.parent ?? "DECLINED",
  code: overrides.code ?? "DCL",
  count: overrides.count ?? 5,
  amount: overrides.amount ?? 50,
  share: overrides.share ?? 5,
});

const topAccountRow = (
  overrides: Partial<TopAccountRow> = {},
): TopAccountRow => ({
  msisdn: overrides.msisdn ?? "21620000000",
  name: overrides.name ?? "Account",
  total: overrides.total ?? 10,
  success: overrides.success ?? 9,
  amount: overrides.amount ?? 100,
  successRate: overrides.successRate ?? 90,
  favCanal: overrides.favCanal ?? "USSD",
});

const anomaly = (overrides: Partial<RowAnomaly> = {}): RowAnomaly => ({
  canal: overrides.canal ?? "USSD",
  hour: overrides.hour ?? 14,
  total: overrides.total ?? 100,
  success: overrides.success ?? 10,
  successRate: overrides.successRate ?? 10,
  z: overrides.z ?? -3.5,
  reason: overrides.reason ?? "Taux anormal",
});

const ctx = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  dateFrom: overrides.dateFrom ?? "2026-01-01",
  dateTo: overrides.dateTo ?? "2026-01-31",
  kpi: overrides.kpi === undefined ? kpi() : overrides.kpi,
  subStatus: overrides.subStatus ?? [],
  topAccounts: overrides.topAccounts ?? [],
  anomalies: overrides.anomalies ?? [],
});

const byId = (out: AgentInsight[], id: string): AgentInsight | undefined =>
  out.find((i) => i.id === id);

// ─── computeRuleInsights: empty / guard branches ─────────────────────────────

describe("computeRuleInsights — guard branches", () => {
  it("returns an empty array when kpi is null", () => {
    const out = computeRuleInsights(ctx({ kpi: null }));

    expect(out).toEqual([]);
  });

  it("returns an empty array when kpi.total is 0", () => {
    const out = computeRuleInsights(ctx({ kpi: kpi({ total: 0 }) }));

    expect(out).toEqual([]);
  });

  it("returns no insights for a clean mid-range pipeline", () => {
    // successRate 90 (not <80, not >=95), no instance/refund/sub/anomaly/top
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ successRate: 90, instance: 0, refund: 0 }) }),
    );

    expect(out).toEqual([]);
  });
});

// ─── computeRuleInsights: success-rate branch ────────────────────────────────

describe("computeRuleInsights — success rate", () => {
  it("flags a critical low-success insight when successRate < 80", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({ successRate: 70, total: 100, success: 70, declined: 30 }),
      }),
    );
    const insight = byId(out, "low-success");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("critical");
    expect(insight?.source).toBe("rule");
    expect(insight?.title).toContain("70%");
    expect(insight?.body).toContain("30");
    expect(insight?.body).toContain("DCL");
  });

  it("flags a positive high-success insight when successRate >= 95", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ successRate: 96.5, success: 96, amount: 500 }) }),
    );
    const insight = byId(out, "high-success");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("positive");
    expect(insight?.title).toContain("96.5%");
  });

  it("treats exactly 80 as neither low nor high success", () => {
    const out = computeRuleInsights(ctx({ kpi: kpi({ successRate: 80 }) }));

    expect(byId(out, "low-success")).toBeUndefined();
    expect(byId(out, "high-success")).toBeUndefined();
  });

  it("treats exactly 95 as high success (inclusive boundary)", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ successRate: 95, success: 95 }) }),
    );

    expect(byId(out, "high-success")).toBeDefined();
  });

  it("treats 94.9 as neither low nor high success", () => {
    const out = computeRuleInsights(ctx({ kpi: kpi({ successRate: 94.9 }) }));

    expect(byId(out, "low-success")).toBeUndefined();
    expect(byId(out, "high-success")).toBeUndefined();
  });
});

// ─── computeRuleInsights: instance share branch ──────────────────────────────

describe("computeRuleInsights — instance (stuck) share", () => {
  it("flags a warning when instance share exceeds 5%", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ total: 100, instance: 10 }) }),
    );
    const insight = byId(out, "stuck-instance");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.title).toContain("10%");
  });

  it("does not flag when instance share is exactly 5% (strict >)", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ total: 100, instance: 5 }) }),
    );

    expect(byId(out, "stuck-instance")).toBeUndefined();
  });
});

// ─── computeRuleInsights: refund share branch ────────────────────────────────

describe("computeRuleInsights — refund share", () => {
  it("flags a warning when refund share exceeds 2%", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ total: 100, refund: 3 }) }),
    );
    const insight = byId(out, "high-refund");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.title).toContain("3%");
    expect(insight?.body).toContain("3");
  });

  it("does not flag when refund share is exactly 2% (strict >)", () => {
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ total: 100, refund: 2 }) }),
    );

    expect(byId(out, "high-refund")).toBeUndefined();
  });
});

// ─── computeRuleInsights: sub-status concentration ───────────────────────────

describe("computeRuleInsights — top decline code", () => {
  it("flags the dominant DECLINED sub-status code, sorted by count", () => {
    const out = computeRuleInsights(
      ctx({
        subStatus: [
          subStatusRow({ parent: "DECLINED", code: "DCL", count: 5, share: 5 }),
          subStatusRow({
            parent: "DECLINED",
            code: "DCT",
            count: 12,
            share: 12,
          }),
          subStatusRow({ parent: "SUCCESS", code: "OK", count: 99, share: 99 }),
        ],
      }),
    );
    const insight = byId(out, "top-decline-code");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("info");
    // DCT has the highest count among DECLINED rows → dominant code
    expect(insight?.title).toContain("DCT");
    expect(insight?.body).toContain("12");
  });

  it("does not flag when there are no DECLINED rows", () => {
    const out = computeRuleInsights(
      ctx({
        subStatus: [
          subStatusRow({ parent: "SUCCESS", code: "OK", count: 50 }),
        ],
      }),
    );

    expect(byId(out, "top-decline-code")).toBeUndefined();
  });

  it("does not flag when the dominant DECLINED count is 0", () => {
    const out = computeRuleInsights(
      ctx({
        subStatus: [
          subStatusRow({ parent: "DECLINED", code: "DCL", count: 0 }),
        ],
      }),
    );

    expect(byId(out, "top-decline-code")).toBeUndefined();
  });

  it("does not flag when subStatus is empty", () => {
    const out = computeRuleInsights(ctx({ subStatus: [] }));

    expect(byId(out, "top-decline-code")).toBeUndefined();
  });
});

// ─── computeRuleInsights: anomalies ──────────────────────────────────────────

describe("computeRuleInsights — anomalies", () => {
  it("flags a warning when between 1 and 5 anomalies exist", () => {
    const out = computeRuleInsights(
      ctx({
        anomalies: [
          anomaly({ canal: "WEB", hour: 9, reason: "Spike volume" }),
          anomaly(),
        ],
      }),
    );
    const insight = byId(out, "anomaly-top");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.title).toContain("2 anomalie");
    // worst = anomalies[0], hour padded to 2 digits
    expect(insight?.body).toContain("WEB");
    expect(insight?.body).toContain("09h");
    expect(insight?.body).toContain("Spike volume");
  });

  it("escalates to critical when more than 5 anomalies exist", () => {
    const out = computeRuleInsights(
      ctx({ anomalies: Array.from({ length: 6 }, () => anomaly()) }),
    );
    const insight = byId(out, "anomaly-top");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("critical");
    expect(insight?.title).toContain("6 anomalie");
  });

  it("stays a warning at exactly 5 anomalies (strict >)", () => {
    const out = computeRuleInsights(
      ctx({ anomalies: Array.from({ length: 5 }, () => anomaly()) }),
    );

    expect(byId(out, "anomaly-top")?.severity).toBe("warning");
  });

  it("does not flag when there are no anomalies", () => {
    const out = computeRuleInsights(ctx({ anomalies: [] }));

    expect(byId(out, "anomaly-top")).toBeUndefined();
  });

  it("pads single-digit hours to two characters", () => {
    const out = computeRuleInsights(
      ctx({ anomalies: [anomaly({ hour: 3, canal: "APP" })] }),
    );

    expect(byId(out, "anomaly-top")?.body).toContain("03h");
  });
});

// ─── computeRuleInsights: top-account concentration ──────────────────────────

describe("computeRuleInsights — concentration", () => {
  it("flags concentration when top 5 accounts exceed 50% of amount", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({ amount: 1000 }),
        // top 5 amounts sum to 600 (> 50% of 1000)
        topAccounts: [
          topAccountRow({ msisdn: "A", amount: 200 }),
          topAccountRow({ msisdn: "B", amount: 150 }),
          topAccountRow({ msisdn: "C", amount: 120 }),
          topAccountRow({ msisdn: "D", amount: 80 }),
          topAccountRow({ msisdn: "E", amount: 50 }),
          topAccountRow({ msisdn: "F", amount: 10 }),
        ],
      }),
    );
    const insight = byId(out, "concentration");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.title).toContain("top 5");
  });

  it("does not flag concentration when top 5 are at or below 50%", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({ amount: 1000 }),
        // exactly 500 = 50%, ratio 0.5 is not > 0.5
        topAccounts: [
          topAccountRow({ amount: 100 }),
          topAccountRow({ amount: 100 }),
          topAccountRow({ amount: 100 }),
          topAccountRow({ amount: 100 }),
          topAccountRow({ amount: 100 }),
        ],
      }),
    );

    expect(byId(out, "concentration")).toBeUndefined();
  });

  it("does not flag concentration with fewer than 5 top accounts", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({ amount: 100 }),
        topAccounts: [
          topAccountRow({ amount: 90 }),
          topAccountRow({ amount: 90 }),
          topAccountRow({ amount: 90 }),
          topAccountRow({ amount: 90 }),
        ],
      }),
    );

    expect(byId(out, "concentration")).toBeUndefined();
  });

  it("does not flag concentration when kpi.amount is 0", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({ amount: 0 }),
        topAccounts: Array.from({ length: 5 }, () =>
          topAccountRow({ amount: 100 }),
        ),
      }),
    );

    expect(byId(out, "concentration")).toBeUndefined();
  });
});

// ─── computeRuleInsights: outlier amounts (z-score) ──────────────────────────

describe("computeRuleInsights — outlier amount", () => {
  it("flags an outlier whose amount is more than 3 SD above the mean", () => {
    // 19 accounts at 50 + one at 300 → z ≈ 4.25 for the outlier
    const top: TopAccountRow[] = [
      ...Array.from({ length: 19 }, (_, i) =>
        topAccountRow({ msisdn: `m${i}`, amount: 50 }),
      ),
      topAccountRow({ msisdn: "OUTLIER", amount: 300 }),
    ];
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ amount: 100000 }), topAccounts: top }),
    );
    const insight = byId(out, "outlier-amount");

    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("info");
    expect(insight?.title).toContain("OUTLIER");
    // z rounded to one decimal place
    expect(insight?.body).toContain("z=4.2");
  });

  it("does not flag an outlier when spread is uniform (sd small but no z>3)", () => {
    const top: TopAccountRow[] = [
      topAccountRow({ amount: 100 }),
      topAccountRow({ amount: 110 }),
      topAccountRow({ amount: 90 }),
      topAccountRow({ amount: 105 }),
    ];
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ amount: 100000 }), topAccounts: top }),
    );

    expect(byId(out, "outlier-amount")).toBeUndefined();
  });

  it("does not flag an outlier with fewer than 4 top accounts", () => {
    const top: TopAccountRow[] = [
      topAccountRow({ amount: 50 }),
      topAccountRow({ amount: 50 }),
      topAccountRow({ amount: 5000 }),
    ];
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ amount: 100000 }), topAccounts: top }),
    );

    expect(byId(out, "outlier-amount")).toBeUndefined();
  });

  it("does not flag an outlier when fewer than 4 positive amounts remain", () => {
    // 4 accounts but only 2 with positive amounts → amounts.length < 4 guard
    const top: TopAccountRow[] = [
      topAccountRow({ amount: 0 }),
      topAccountRow({ amount: -10 }),
      topAccountRow({ amount: 50 }),
      topAccountRow({ amount: 5000 }),
    ];
    const out = computeRuleInsights(
      ctx({ kpi: kpi({ amount: 100000 }), topAccounts: top }),
    );

    expect(byId(out, "outlier-amount")).toBeUndefined();
  });

  it("does not flag an outlier when all amounts are equal (sd == 0)", () => {
    const top: TopAccountRow[] = Array.from({ length: 5 }, () =>
      topAccountRow({ amount: 100 }),
    );
    const out = computeRuleInsights(
      // kpi.amount large so concentration rule does not also fire here
      ctx({ kpi: kpi({ amount: 100000 }), topAccounts: top }),
    );

    expect(byId(out, "outlier-amount")).toBeUndefined();
  });
});

// ─── computeRuleInsights: composition / multiple insights ────────────────────

describe("computeRuleInsights — composition", () => {
  it("accumulates multiple independent insights for a problematic period", () => {
    const out = computeRuleInsights(
      ctx({
        kpi: kpi({
          total: 100,
          successRate: 60,
          success: 60,
          declined: 40,
          instance: 20,
          refund: 5,
          amount: 1000,
        }),
        subStatus: [
          subStatusRow({ parent: "DECLINED", code: "DCL", count: 30 }),
        ],
        anomalies: [anomaly(), anomaly()],
      }),
    );
    const ids = out.map((i) => i.id);

    expect(ids).toContain("low-success");
    expect(ids).toContain("stuck-instance");
    expect(ids).toContain("high-refund");
    expect(ids).toContain("top-decline-code");
    expect(ids).toContain("anomaly-top");
    // Every rule insight is tagged with the rule source.
    expect(out.every((i) => i.source === "rule")).toBe(true);
  });

  it("never emits both low-success and high-success (mutually exclusive)", () => {
    const lowOut = computeRuleInsights(ctx({ kpi: kpi({ successRate: 50 }) }));
    const highOut = computeRuleInsights(ctx({ kpi: kpi({ successRate: 99 }) }));

    expect(
      lowOut.filter((i) => i.id === "low-success" || i.id === "high-success")
        .length,
    ).toBe(1);
    expect(
      highOut.filter((i) => i.id === "low-success" || i.id === "high-success")
        .length,
    ).toBe(1);
  });
});

// ─── askAgent ────────────────────────────────────────────────────────────────

describe("askAgent", () => {
  it("returns a heuristic message and null intent when no generator is provided", async () => {
    const answer = await askAgent("Pourquoi ?", ctx());

    expect(answer.intent).toBeNull();
    expect(answer.text).toContain("Modèle IA non disponible");
  });

  it("returns the trimmed reply text from the structured generator", async () => {
    const gen: AgentGenerateStructured = vi
      .fn()
      .mockResolvedValue({ reply: "  Réponse courte.  ", action: "none" });

    const answer = await askAgent("Question", ctx(), gen);

    expect(answer.text).toBe("Réponse courte.");
    expect(answer.intent).toBeNull();
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("passes the system prompt, summarized context, and decode params to the generator", async () => {
    const gen = vi
      .fn()
      .mockResolvedValue({ reply: "ok", action: "none" });

    await askAgent(
      "Combien de transactions ?",
      ctx({
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        kpi: kpi({ total: 42, successRate: 88 }),
      }),
      gen as unknown as AgentGenerateStructured,
    );

    const [req, schema] = gen.mock.calls[0];
    expect(req.system).toContain("agent télécom");
    expect(req.prompt).toContain("Combien de transactions ?");
    expect(req.prompt).toContain("2026-02-01");
    expect(req.prompt).toContain("2026-02-28");
    expect(req.maxTokens).toBe(260);
    expect(req.temperature).toBeCloseTo(0.05);
    // The Zod schema is passed as the second argument.
    expect(schema).toBeDefined();
    expect(typeof schema.parse).toBe("function");
  });

  it.each([
    ["show_anomalies", { kind: "show_anomalies" }],
    ["show_top_accounts_amount", { kind: "show_top_accounts", by: "amount" }],
    ["show_top_accounts_count", { kind: "show_top_accounts", by: "count" }],
    ["show_sub_status", { kind: "show_sub_status" }],
    ["compare_periods", { kind: "compare_periods" }],
    ["show_brands", { kind: "show_brands" }],
    ["explain_kpi", { kind: "explain_kpi" }],
  ])("maps the %s action to its intent", async (action, expected) => {
    const gen: AgentGenerateStructured = vi
      .fn()
      .mockResolvedValue({ reply: "ok", action });

    const answer = await askAgent("Q", ctx(), gen);

    expect(answer.intent).toEqual(expected);
  });

  it('maps the "none" action to a null intent', async () => {
    const gen: AgentGenerateStructured = vi
      .fn()
      .mockResolvedValue({ reply: "ok", action: "none" });

    const answer = await askAgent("Q", ctx(), gen);

    expect(answer.intent).toBeNull();
  });

  it("falls back to a heuristic message and null intent when the generator throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gen: AgentGenerateStructured = vi
      .fn()
      .mockRejectedValue(new Error("provider down"));

    const answer = await askAgent("Q", ctx(), gen);

    expect(answer.intent).toBeNull();
    expect(answer.text).toContain("n'a pas pu répondre");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("summarizes an empty context as 'Aucune donnée chargée.' in the prompt", async () => {
    const gen = vi.fn().mockResolvedValue({ reply: "ok", action: "none" });

    await askAgent(
      "Q",
      ctx({ kpi: null }),
      gen as unknown as AgentGenerateStructured,
    );

    expect(gen.mock.calls[0][0].prompt).toContain("Aucune donnée chargée.");
  });

  it("includes top sub-status and top account lines in the summary when present", async () => {
    const gen = vi.fn().mockResolvedValue({ reply: "ok", action: "none" });

    await askAgent(
      "Q",
      ctx({
        subStatus: [
          subStatusRow({ code: "DCL", count: 7 }),
          subStatusRow({ code: "DCT", count: 4 }),
        ],
        topAccounts: [topAccountRow({ msisdn: "21699112233", amount: 555 })],
      }),
      gen as unknown as AgentGenerateStructured,
    );
    const prompt = gen.mock.calls[0][0].prompt as string;

    expect(prompt).toContain("Top sous-statuts:");
    expect(prompt).toContain("DCL=7");
    expect(prompt).toContain("Top abonné: 21699112233");
  });
});

// ─── generateNarrative ───────────────────────────────────────────────────────

describe("generateNarrative", () => {
  it("returns a deterministic rule digest when no generator is provided", async () => {
    const text = await generateNarrative(
      ctx({ kpi: kpi({ successRate: 70, total: 100, declined: 30 }) }),
    );

    // Rule digest is bullet-formatted from computeRuleInsights titles + bodies.
    expect(text).toContain("•");
    expect(text).toContain("70%");
  });

  it("returns an empty string digest when there are no rule insights", async () => {
    const text = await generateNarrative(
      ctx({ kpi: kpi({ successRate: 90 }) }),
    );

    expect(text).toBe("");
  });

  it("returns an empty string digest when kpi is null and no generator", async () => {
    const text = await generateNarrative(ctx({ kpi: null }));

    expect(text).toBe("");
  });

  it("returns the trimmed generated narrative when a generator succeeds", async () => {
    const gen: AgentGenerate = vi
      .fn()
      .mockResolvedValue({ text: "  Résumé exécutif.  " });

    const text = await generateNarrative(ctx(), gen);

    expect(text).toBe("Résumé exécutif.");
  });

  it("passes the analyst system prompt, summary, and decode params to the generator", async () => {
    const gen = vi.fn().mockResolvedValue({ text: "x" });

    await generateNarrative(
      ctx({ kpi: kpi({ total: 7, successRate: 99, success: 7 }) }),
      gen as unknown as AgentGenerate,
    );
    const req = gen.mock.calls[0][0];

    expect(req.system).toContain("analyste télécom");
    expect(req.prompt).toContain("Données :");
    expect(req.maxTokens).toBe(220);
    expect(req.temperature).toBeCloseTo(0.1);
  });

  it("falls back to the rule digest when the generator throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gen: AgentGenerate = vi
      .fn()
      .mockRejectedValue(new Error("provider down"));

    const text = await generateNarrative(
      ctx({ kpi: kpi({ successRate: 60, total: 100, declined: 40 }) }),
      gen,
    );

    expect(text).toContain("•");
    expect(text).toContain("60%");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
