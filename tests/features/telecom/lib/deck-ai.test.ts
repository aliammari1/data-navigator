import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TelecomDeckBriefSchema,
  DECK_BRIEF_SYSTEM_PROMPT,
  DECK_BRIEF_PROMPT_PREFIX,
  generateTelecomDeckBrief,
  type TelecomDeckBrief,
  type TelecomDeckBriefInput,
  type GenerateStructured,
} from "@/features/telecom/lib/deck-ai";
import type { KPISummary, CanalSummary, HourlyRow, StatusRow } from "@/features/telecom/types";

// ─── Builders ────────────────────────────────────────────────────────────────

function makeKpi(overrides: Partial<KPISummary> = {}): KPISummary {
  return {
    totalTransactions: 1000,
    successCount: 900,
    declinedCount: 100,
    refundCount: 5,
    instanceCount: 3,
    submittedCount: 2,
    successRate: 90,
    totalAmount: 5000.123,
    avgAmount: 5.0,
    avgProcessingMs: 200,
    uniqueCustomers: 300,
    peakHour: 10,
    topErrorCode: "DCL",
    ...overrides,
  };
}

function makeCanal(overrides: Partial<CanalSummary> & { key: CanalSummary["key"] }): CanalSummary {
  return {
    label: overrides.label ?? overrides.key,
    icon: (() => null) as unknown as CanalSummary["icon"],
    color: "",
    bgColor: "",
    borderColor: "",
    total: 100,
    success: 90,
    declined: 10,
    refund: 2,
    instance: 1,
    submitted: 0,
    amount: 500.0,
    successRate: 90,
    avgAmount: 5,
    share: 20,
    ...overrides,
  };
}

function makeHourly(hour: number, total: number, success = total, amount = 100): HourlyRow {
  return { hour, total, success, declined: total - success, amount };
}

function makeStatus(status: string, count: number, amount = 0): StatusRow {
  return { status, count, amount };
}

function makeInput(overrides: Partial<TelecomDeckBriefInput> = {}): TelecomDeckBriefInput {
  return {
    reportDate: "2026-06-25",
    fileName: "report.csv",
    kpi: makeKpi(),
    canals: [
      makeCanal({ key: "bill_payment", label: "Bill Payment", total: 500, successRate: 92, share: 50, amount: 2500, success: 460, declined: 40, refund: 5, instance: 2, submitted: 0 }),
      makeCanal({ key: "credit_transfer", label: "Credit Transfer", total: 300, successRate: 85, share: 30, amount: 1500, success: 255, declined: 45, refund: 3, instance: 1, submitted: 0 }),
      makeCanal({ key: "data_sabba", label: "Data Sabba", total: 200, successRate: 75, share: 20, amount: 1000, success: 150, declined: 50, refund: 2, instance: 0, submitted: 0 }),
    ],
    hourly: [
      makeHourly(8, 100, 95),
      makeHourly(10, 400, 380),
      makeHourly(14, 200, 190),
    ],
    statusData: [
      makeStatus("SUCCESS", 900, 5000),
      makeStatus("Échec", 100, 0),
    ],
    revenueGroups: [
      { group: "Recharge", total: 600, success: 540, amount: 3000, successRate: 90 },
    ],
    selectedKpis: [
      { label: "Total", value: 1000 },
      { label: "Success Rate", value: "90%" },
    ],
    ...overrides,
  };
}

// ─── TelecomDeckBriefSchema ───────────────────────────────────────────────────

describe("TelecomDeckBriefSchema", () => {
  it("parses a valid TelecomDeckBrief object", () => {
    const valid: TelecomDeckBrief = {
      executiveSummary: "Summary",
      keyFindings: [
        {
          title: "Finding 1",
          summary: "Details",
          bullets: ["bullet 1", "bullet 2"],
          risk: "low",
        },
      ],
      recommendedActions: ["Action 1"],
      speakerNotes: ["Note 1"],
    };

    const result = TelecomDeckBriefSchema.safeParse(valid);

    expect(result.success).toBe(true);
  });

  it("rejects an invalid risk value", () => {
    const invalid = {
      executiveSummary: "Summary",
      keyFindings: [
        {
          title: "Finding",
          summary: "Summary",
          bullets: [],
          risk: "unknown", // invalid
        },
      ],
      recommendedActions: [],
      speakerNotes: [],
    };

    const result = TelecomDeckBriefSchema.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it("rejects more than 8 keyFindings", () => {
    const tooMany = {
      executiveSummary: "Sum",
      keyFindings: Array.from({ length: 9 }, (_, i) => ({
        title: `Finding ${i}`,
        summary: "S",
        bullets: [],
        risk: "low" as const,
      })),
      recommendedActions: [],
      speakerNotes: [],
    };

    const result = TelecomDeckBriefSchema.safeParse(tooMany);

    expect(result.success).toBe(false);
  });

  it("rejects more than 8 recommendedActions", () => {
    const tooMany = {
      executiveSummary: "Sum",
      keyFindings: [],
      recommendedActions: Array.from({ length: 9 }, (_, i) => `Action ${i}`),
      speakerNotes: [],
    };

    const result = TelecomDeckBriefSchema.safeParse(tooMany);

    expect(result.success).toBe(false);
  });

  it("rejects more than 8 speakerNotes", () => {
    const tooMany = {
      executiveSummary: "Sum",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: Array.from({ length: 9 }, (_, i) => `Note ${i}`),
    };

    const result = TelecomDeckBriefSchema.safeParse(tooMany);

    expect(result.success).toBe(false);
  });

  it("accepts all three valid risk enum values", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      const result = TelecomDeckBriefSchema.safeParse({
        executiveSummary: "S",
        keyFindings: [{ title: "T", summary: "S", bullets: [], risk }],
        recommendedActions: [],
        speakerNotes: [],
      });
      expect(result.success).toBe(true);
    }
  });
});

// ─── generateTelecomDeckBrief: no generator (local fallback) ─────────────────

describe("generateTelecomDeckBrief — no generator (local fallback)", () => {
  it("returns source='local' when no generator is provided", async () => {
    const { source } = await generateTelecomDeckBrief(makeInput());

    expect(source).toBe("local");
  });

  it("returns a valid brief object conforming to the schema", async () => {
    const { brief } = await generateTelecomDeckBrief(makeInput());

    const parsed = TelecomDeckBriefSchema.safeParse(brief);
    expect(parsed.success).toBe(true);
  });

  it("includes reportDate in the executiveSummary", async () => {
    const input = makeInput({ reportDate: "2026-06-25" });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.executiveSummary).toContain("2026-06-25");
  });

  it("handles empty reportDate in the executiveSummary", async () => {
    const input = makeInput({ reportDate: "" });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.executiveSummary).toContain("Synthèse locale du rapport");
  });

  it("returns exactly 4 keyFindings", async () => {
    const { brief } = await generateTelecomDeckBrief(makeInput());

    expect(brief.keyFindings).toHaveLength(4);
  });

  it("returns exactly 4 recommendedActions", async () => {
    const { brief } = await generateTelecomDeckBrief(makeInput());

    expect(brief.recommendedActions).toHaveLength(4);
  });

  it("returns exactly 3 speakerNotes", async () => {
    const { brief } = await generateTelecomDeckBrief(makeInput());

    expect(brief.speakerNotes).toHaveLength(3);
  });
});

// ─── buildFallbackBrief: Volume et réussite risk branches ────────────────────

describe("buildFallbackBrief — 'Volume et réussite' risk", () => {
  it("assigns risk='low' when successRate >= 90", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 90 }) });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[0];

    expect(finding.title).toBe("Volume et réussite");
    expect(finding.risk).toBe("low");
  });

  it("assigns risk='low' when successRate > 90", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 95 }) });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[0].risk).toBe("low");
  });

  it("assigns risk='medium' when successRate is between 75 and 89.9", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 80 }) });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[0].risk).toBe("medium");
  });

  it("assigns risk='medium' when successRate is exactly 75", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 75 }) });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[0].risk).toBe("medium");
  });

  it("assigns risk='high' when successRate < 75", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 74 }) });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[0].risk).toBe("high");
  });

  it("assigns risk='high' when successRate is 0", async () => {
    const input = makeInput({ kpi: makeKpi({ successRate: 0 }) });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[0].risk).toBe("high");
  });

  it("includes KPI data in bullets", async () => {
    const kpi = makeKpi({
      totalTransactions: 1000,
      successCount: 900,
      declinedCount: 100,
      totalAmount: 5000.123,
      successRate: 90,
    });
    const { brief } = await generateTelecomDeckBrief(makeInput({ kpi }));
    const finding = brief.keyFindings[0];

    expect(finding.summary).toContain("1");
    expect(finding.bullets.some((b) => b.includes("Réussies"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Échecs"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Montant"))).toBe(true);
  });
});

// ─── buildFallbackBrief: Canal dominant branches ──────────────────────────────

describe("buildFallbackBrief — 'Canal dominant'", () => {
  it("uses top canal label in summary when canals are present", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Bill Payment", total: 500, successRate: 92, share: 50, amount: 2500, success: 460, declined: 40, refund: 5, instance: 2, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Credit Transfer", total: 300, successRate: 85, share: 30, amount: 1500, success: 255, declined: 45, refund: 3, instance: 1, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[1];

    expect(finding.title).toBe("Canal dominant");
    expect(finding.summary).toContain("Bill Payment");
    expect(finding.bullets.some((b) => b.includes("Part"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Taux de réussite"))).toBe(true);
  });

  it("uses fallback summary when canals is empty", async () => {
    const input = makeInput({ canals: [] });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[1];

    expect(finding.summary).toContain("Aucun canal dominant détecté.");
    expect(finding.bullets).toContain("Importer un rapport pour enrichir cette analyse.");
  });

  it("assigns risk='high' for Canal dominant when topCanal.successRate < 80", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Bill Payment", total: 500, successRate: 70, share: 50, amount: 2500, success: 350, declined: 150, refund: 5, instance: 2, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[1];

    expect(finding.risk).toBe("high");
  });

  it("assigns risk='low' for Canal dominant when topCanal.successRate >= 80", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Bill Payment", total: 500, successRate: 85, share: 50, amount: 2500, success: 425, declined: 75, refund: 5, instance: 2, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[1];

    expect(finding.risk).toBe("low");
  });

  it("assigns risk='low' when canals is empty (topCanal is undefined)", async () => {
    const input = makeInput({ canals: [] });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[1];

    expect(finding.risk).toBe("low");
  });
});

// ─── buildFallbackBrief: Point de fragilité branches ─────────────────────────

describe("buildFallbackBrief — 'Point de fragilité'", () => {
  it("uses weakest canal label in summary when active canals exist", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Strong Canal", total: 500, successRate: 92, share: 50, amount: 2500, success: 460, declined: 40, refund: 5, instance: 2, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Weak Canal", total: 100, successRate: 60, share: 10, amount: 500, success: 60, declined: 40, refund: 3, instance: 5, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.title).toBe("Point de fragilité");
    expect(finding.summary).toContain("Weak Canal");
    expect(finding.bullets.some((b) => b.includes("Taux"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Échecs"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Instances"))).toBe(true);
  });

  it("uses fallback when all canals have total=0", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Zero Canal", total: 0, successRate: 0, share: 0, amount: 0, success: 0, declined: 0, refund: 0, instance: 0, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.summary).toContain("Aucun point de fragilité canal détecté.");
    expect(finding.bullets).toContain("Surveiller les canaux avec faible volume avant d'interpréter les taux.");
  });

  it("uses fallback when canals is empty (weakestCanal is undefined)", async () => {
    const input = makeInput({ canals: [] });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.summary).toContain("Aucun point de fragilité canal détecté.");
  });

  it("assigns risk='high' for Point de fragilité when weakestCanal.successRate < 80", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Canal A", total: 200, successRate: 70, share: 20, amount: 1000, success: 140, declined: 60, refund: 2, instance: 3, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Canal B", total: 100, successRate: 50, share: 10, amount: 500, success: 50, declined: 50, refund: 1, instance: 1, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.risk).toBe("high");
  });

  it("assigns risk='medium' for Point de fragilité when weakestCanal.successRate >= 80", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Canal A", total: 200, successRate: 90, share: 20, amount: 1000, success: 180, declined: 20, refund: 2, instance: 1, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Canal B", total: 100, successRate: 82, share: 10, amount: 500, success: 82, declined: 18, refund: 1, instance: 0, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.risk).toBe("medium");
  });

  it("assigns risk='medium' when canals is empty (weakestCanal is undefined)", async () => {
    const input = makeInput({ canals: [] });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[2];

    expect(finding.risk).toBe("medium");
  });
});

// ─── buildFallbackBrief: Charge horaire branches ──────────────────────────────

describe("buildFallbackBrief — 'Charge horaire'", () => {
  it("includes peak hour in summary when hourly data is present", async () => {
    const input = makeInput({
      hourly: [
        makeHourly(8, 100, 95),
        makeHourly(10, 400, 380),
        makeHourly(14, 200, 190),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[3];

    expect(finding.title).toBe("Charge horaire");
    expect(finding.summary).toContain("10:00");
    expect(finding.bullets.some((b) => b.includes("Transactions"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Réussies"))).toBe(true);
    expect(finding.bullets.some((b) => b.includes("Montant"))).toBe(true);
    expect(finding.risk).toBe("medium");
  });

  it("pads single-digit hours with a leading zero", async () => {
    const input = makeInput({
      hourly: [makeHourly(9, 50)],
    });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[3];

    expect(finding.summary).toContain("09:00");
  });

  it("uses fallback when hourly is empty (peakHour is undefined)", async () => {
    const input = makeInput({ hourly: [] });
    const { brief } = await generateTelecomDeckBrief(input);
    const finding = brief.keyFindings[3];

    expect(finding.summary).toContain("Aucun pic horaire disponible.");
    expect(finding.bullets).toContain("Activer le mapping de date/heure pour obtenir cette vue.");
    expect(finding.risk).toBe("medium");
  });
});

// ─── buildFallbackBrief: recommendedActions branches ─────────────────────────

describe("buildFallbackBrief — recommendedActions", () => {
  it("includes weakest canal name in action 1 when weakestCanal exists", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Bill Payment", total: 500, successRate: 92, share: 50, amount: 2500, success: 460, declined: 40, refund: 5, instance: 2, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Weak Canal", total: 100, successRate: 60, share: 10, amount: 500, success: 60, declined: 40, refund: 3, instance: 5, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[0]).toContain("Weak Canal");
  });

  it("uses generic action 1 when weakestCanal is undefined (no active canals)", async () => {
    const input = makeInput({ canals: [] });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[0]).toContain("Identifier les canaux actifs");
  });

  it("includes failure count in action 2 when failed status is found", async () => {
    const input = makeInput({
      statusData: [
        makeStatus("SUCCESS", 900, 5000),
        makeStatus("Échec partiel", 50, 0),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[1]).toContain("50");
  });

  it("uses generic action 2 when no failed status is found", async () => {
    const input = makeInput({
      statusData: [makeStatus("SUCCESS", 900, 5000)],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[1]).toContain("Contrôler les statuts échoués");
  });

  it("matches 'échec' case-insensitively (lowercase)", async () => {
    const input = makeInput({
      statusData: [
        makeStatus("SUCCESS", 900, 5000),
        makeStatus("échec", 75, 0),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[1]).toContain("75");
  });

  it("matches 'ÉCHEC' (uppercase) using toLowerCase()", async () => {
    const input = makeInput({
      statusData: [
        makeStatus("SUCCESS", 900, 5000),
        makeStatus("ÉCHEC SYSTÈME", 120, 0),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[1]).toContain("120");
  });

  it("always includes the last two static recommended actions", async () => {
    const { brief } = await generateTelecomDeckBrief(makeInput());

    expect(brief.recommendedActions[2]).toContain("exports journaliers");
    expect(brief.recommendedActions[3]).toContain("J-1");
  });
});

// ─── generateTelecomDeckBrief: with generator (AI path) ──────────────────────

describe("generateTelecomDeckBrief — with generator (AI path)", () => {
  it("returns source='ai' when generator succeeds", async () => {
    const mockBrief: TelecomDeckBrief = {
      executiveSummary: "AI summary",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: [],
    };
    const gen: GenerateStructured = vi.fn().mockResolvedValue(mockBrief);

    const { source, brief } = await generateTelecomDeckBrief(makeInput(), gen);

    expect(source).toBe("ai");
    expect(brief).toBe(mockBrief);
  });

  it("passes correct request parameters to the generator", async () => {
    const gen: GenerateStructured = vi.fn().mockResolvedValue({
      executiveSummary: "x",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: [],
    });

    await generateTelecomDeckBrief(makeInput(), gen);

    expect(gen).toHaveBeenCalledTimes(1);
    const [req, schema] = (gen as ReturnType<typeof vi.fn>).mock.calls[0];

    // Exact system prompt, not a substring keyword check — a substring check
    // (e.g. toContain("analyste")) could only ever catch removal of one word
    // and would still pass if the instructions were rewritten to ask for
    // something else entirely while accidentally keeping that one keyword.
    expect(req.system).toBe(DECK_BRIEF_SYSTEM_PROMPT);
    // The prompt is `DECK_BRIEF_PROMPT_PREFIX + JSON.stringify(payload)`. The
    // payload's field mapping, canal slicing, and interpolated values (dates,
    // filenames, KPI numbers) are exercised by the dedicated payload tests
    // below with real runtime data, so here we only need to prove the static
    // instructional wording sent to the model is intact — asserting exact
    // prefix identity instead of a loose "contains the word JSON" check,
    // which would pass even if the wording were rewritten to ask for
    // something unrelated as long as it still mentioned JSON somewhere.
    expect(req.prompt.startsWith(DECK_BRIEF_PROMPT_PREFIX)).toBe(true);
    expect(req.maxTokens).toBe(1600);
    expect(req.temperature).toBeCloseTo(0.15);
    expect(typeof schema.parse).toBe("function");
  });

  it("includes the payload JSON in the prompt", async () => {
    const gen: GenerateStructured = vi.fn().mockResolvedValue({
      executiveSummary: "x",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: [],
    });
    const input = makeInput({ reportDate: "2026-06-25", fileName: "test-report.csv" });

    await generateTelecomDeckBrief(input, gen);

    const [req] = (gen as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(req.prompt).toContain("2026-06-25");
    expect(req.prompt).toContain("test-report.csv");
  });

  it("falls back to local brief when generator throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const gen: GenerateStructured = vi.fn().mockRejectedValue(new Error("AI error"));

    const { source, brief } = await generateTelecomDeckBrief(makeInput(), gen);

    expect(source).toBe("local");
    expect(brief.executiveSummary).toContain("Synthèse locale");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("logs the error with the expected prefix when generator throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new Error("provider offline");
    const gen: GenerateStructured = vi.fn().mockRejectedValue(err);

    await generateTelecomDeckBrief(makeInput(), gen);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[telecom deck]"),
      err,
    );
    warnSpy.mockRestore();
  });

  it("slices canals to max 12 in the payload", async () => {
    const gen: GenerateStructured = vi.fn().mockResolvedValue({
      executiveSummary: "x",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: [],
    });

    const canalKeys = [
      "bill_payment",
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
      "voucher_for_payment",
      "credit_transfer",
      "voucher_convergent",
      "bill_payment",
      "credit_transfer",
      "data_sabba",
    ] as const;

    const thirteenCanals = canalKeys.map((key, i) =>
      makeCanal({ key, label: `Canal ${i}`, total: i + 1, successRate: 90 }),
    );

    await generateTelecomDeckBrief(makeInput({ canals: thirteenCanals }), gen);

    const [req] = (gen as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = JSON.parse(req.prompt.split(":\n\n")[1]);
    expect(parsed.canals).toHaveLength(12);
  });

  // A dedicated "passes system prompt in French about offline analysis" test
  // used to live here, checking req.system for the substrings "hors-ligne"
  // and "français". That's now fully subsumed (and superseded) by the exact
  // `expect(req.system).toBe(DECK_BRIEF_SYSTEM_PROMPT)` assertion in "passes
  // correct request parameters to the generator" above — an exact-identity
  // check is strictly stronger than any substring check on the same field,
  // so keeping both would just be duplicate coverage.
});

// ─── generateTelecomDeckBrief: payload structure ──────────────────────────────

describe("generateTelecomDeckBrief — payload canal mapping", () => {
  it("maps all canal fields correctly in the payload", async () => {
    const gen: GenerateStructured = vi.fn().mockResolvedValue({
      executiveSummary: "x",
      keyFindings: [],
      recommendedActions: [],
      speakerNotes: [],
    });
    const canal = makeCanal({
      key: "bill_payment",
      label: "Bill Payment",
      total: 500,
      success: 450,
      declined: 50,
      instance: 5,
      refund: 3,
      amount: 2500,
      successRate: 90,
      share: 50,
    });

    await generateTelecomDeckBrief(makeInput({ canals: [canal] }), gen);

    const [req] = (gen as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = JSON.parse(req.prompt.split(":\n\n")[1]);
    const mappedCanal = parsed.canals[0];

    expect(mappedCanal.label).toBe("Bill Payment");
    expect(mappedCanal.total).toBe(500);
    expect(mappedCanal.success).toBe(450);
    expect(mappedCanal.declined).toBe(50);
    expect(mappedCanal.instance).toBe(5);
    expect(mappedCanal.refund).toBe(3);
    expect(mappedCanal.amount).toBe(2500);
    expect(mappedCanal.successRate).toBe(90);
    expect(mappedCanal.share).toBe(50);
  });
});

// ─── generateTelecomDeckBrief: edge cases ────────────────────────────────────

describe("generateTelecomDeckBrief — edge cases", () => {
  it("returns local fallback when no generator is passed (undefined)", async () => {
    const { source } = await generateTelecomDeckBrief(makeInput(), undefined);

    expect(source).toBe("local");
  });

  it("handles a canal with exactly successRate=80 — Canal dominant risk='low'", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Borderline", total: 100, successRate: 80, share: 100, amount: 500, success: 80, declined: 20, refund: 0, instance: 0, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[1].risk).toBe("low");
  });

  it("handles a canal with successRate=79.9 — Canal dominant risk='high'", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Borderline", total: 100, successRate: 79.9, share: 100, amount: 500, success: 79, declined: 21, refund: 0, instance: 0, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[1].risk).toBe("high");
  });

  it("handles all canals with zero total — weakestCanal is undefined", async () => {
    const input = makeInput({
      canals: [
        makeCanal({ key: "bill_payment", label: "Zero", total: 0, successRate: 0, share: 0, amount: 0, success: 0, declined: 0, refund: 0, instance: 0, submitted: 0 }),
        makeCanal({ key: "credit_transfer", label: "Also Zero", total: 0, successRate: 0, share: 0, amount: 0, success: 0, declined: 0, refund: 0, instance: 0, submitted: 0 }),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[2].summary).toContain("Aucun point de fragilité canal détecté.");
    expect(brief.recommendedActions[0]).toContain("Identifier les canaux actifs");
  });

  it("handles status matching 'échec' in middle of string", async () => {
    const input = makeInput({
      statusData: [
        makeStatus("Transaction en échec complet", 33, 0),
      ],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.recommendedActions[1]).toContain("33");
  });

  it("handles single hourly row correctly", async () => {
    const input = makeInput({
      hourly: [makeHourly(5, 50)],
    });
    const { brief } = await generateTelecomDeckBrief(input);

    expect(brief.keyFindings[3].summary).toContain("05:00");
  });
});
