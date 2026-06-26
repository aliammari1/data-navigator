import { describe, it, expect } from "vitest";

import {
  DERJA_GLOSSARY,
  DERJA_SYSTEM_HINT,
  detectLikelyLanguage,
  localizedSystemPrefix,
} from "@/platform/ai/locale/derja";
import type { DerjaGlossaryEntry } from "@/platform/ai/locale/derja";

// ─── DERJA_GLOSSARY ──────────────────────────────────────────────────────────

describe("DERJA_GLOSSARY", () => {
  it("is a non-empty readonly array", () => {
    expect(Array.isArray(DERJA_GLOSSARY)).toBe(true);
    expect(DERJA_GLOSSARY.length).toBeGreaterThan(0);
  });

  it("every entry has a non-empty forms array and a non-empty meaning string", () => {
    for (const entry of DERJA_GLOSSARY) {
      expect(entry.forms.length).toBeGreaterThan(0);
      expect(typeof entry.meaning).toBe("string");
      expect(entry.meaning.trim().length).toBeGreaterThan(0);
    }
  });

  it("contains an entry for 'how much / how many' with 9adech", () => {
    // Arrange: look up the entry whose meaning contains "how much"
    const entry = DERJA_GLOSSARY.find((e) => e.meaning.includes("how much"));
    // Assert
    expect(entry).toBeDefined();
    expect(entry!.forms).toContain("9adech");
  });

  it("contains an entry for 'money / revenue' with flus and floos", () => {
    const entry = DERJA_GLOSSARY.find((e) => e.meaning.includes("money"));
    expect(entry).toBeDefined();
    expect(entry!.forms).toContain("flus");
    expect(entry!.forms).toContain("floos");
  });

  it("contains an entry for 'today' with lyoum", () => {
    const entry = DERJA_GLOSSARY.find((e) => e.meaning === "today");
    expect(entry).toBeDefined();
    expect(entry!.forms).toContain("lyoum");
  });

  it("contains an entry for 'yesterday' with lbera7", () => {
    const entry = DERJA_GLOSSARY.find((e) => e.meaning === "yesterday");
    expect(entry).toBeDefined();
    expect(entry!.forms).toContain("lbera7");
  });

  it("DerjaGlossaryEntry interface: forms is string[] and meaning is string", () => {
    // Verify the shape (TypeScript checks statically, runtime confirms)
    const sample: DerjaGlossaryEntry = DERJA_GLOSSARY[0];
    expect(Array.isArray(sample.forms)).toBe(true);
    expect(typeof sample.meaning).toBe("string");
  });
});

// ─── DERJA_SYSTEM_HINT ───────────────────────────────────────────────────────

describe("DERJA_SYSTEM_HINT", () => {
  it("is a non-empty string", () => {
    expect(typeof DERJA_SYSTEM_HINT).toBe("string");
    expect(DERJA_SYSTEM_HINT.trim().length).toBeGreaterThan(0);
  });

  it("mentions Arabizi digit conventions (3, 7, 9)", () => {
    expect(DERJA_SYSTEM_HINT).toMatch(/3=ع|7=ح|9=ق/);
  });

  it("mentions Tunisian Arabic / Derja", () => {
    expect(DERJA_SYSTEM_HINT.toLowerCase()).toContain("tunisian");
  });

  it("embeds the glossary: contains '9adech'", () => {
    // renderGlossary() is called inside the module; verify it rendered
    expect(DERJA_SYSTEM_HINT).toContain("9adech");
  });

  it("embeds the glossary: contains '= money / revenue'", () => {
    expect(DERJA_SYSTEM_HINT).toContain("= money / revenue");
  });

  it("instructs the model to answer in the user's script", () => {
    expect(DERJA_SYSTEM_HINT.toLowerCase()).toContain("answer in the same language");
  });

  it("includes French code-switching mention", () => {
    expect(DERJA_SYSTEM_HINT.toLowerCase()).toContain("french");
  });
});

// ─── detectLikelyLanguage ────────────────────────────────────────────────────

describe("detectLikelyLanguage — empty / whitespace input", () => {
  it("returns 'unknown' for an empty string", () => {
    expect(detectLikelyLanguage("")).toBe("unknown");
  });

  it("returns 'unknown' for a whitespace-only string", () => {
    expect(detectLikelyLanguage("   ")).toBe("unknown");
  });

  it("handles empty string (covers the ?? fallback path in the implementation)", () => {
    // The implementation does `(text ?? "").trim()` — empty string trims to "" → "unknown".
    expect(detectLikelyLanguage("")).toBe("unknown");
  });
});

describe("detectLikelyLanguage — Arabic script (MSA)", () => {
  it("returns 'ar' for plain Modern Standard Arabic", () => {
    // 'ما هو إجمالي الإيرادات؟' — no Derja markers
    expect(detectLikelyLanguage("ما هو إجمالي الإيرادات؟")).toBe("ar");
  });

  it("returns 'ar' for MSA that does not contain Derja Arabic forms", () => {
    // This sentence uses MSA vocabulary not present in the Derja glossary.
    // "ما هو مجموع الإيرادات السنوية؟" = "What is the total annual revenue?"
    expect(detectLikelyLanguage("ما هو مجموع الإيرادات السنوية؟")).toBe("ar");
  });
});

describe("detectLikelyLanguage — Arabic-script Derja", () => {
  it("returns 'derja' for قداش الفلوس (glossary Arabic forms)", () => {
    // قداش = how much, الفلوس = money
    expect(detectLikelyLanguage("قداش الفلوس متاع النهار؟")).toBe("derja");
  });

  it("returns 'derja' when Arabic-script Derja form قدّاش is present", () => {
    expect(detectLikelyLanguage("قدّاش")).toBe("derja");
  });

  it("returns 'derja' for mixed Arabic-script Derja sentence", () => {
    expect(detectLikelyLanguage("شنية الأرباح اليوم")).toBe("derja");
  });
});

describe("detectLikelyLanguage — Arabizi", () => {
  it("returns 'derja' for '9adech el flus mta3 ennhar?'", () => {
    expect(detectLikelyLanguage("9adech el flus mta3 ennhar?")).toBe("derja");
  });

  it("returns 'derja' for Arabizi digit-letter pattern: '3lech'", () => {
    expect(detectLikelyLanguage("3lech")).toBe("derja");
  });

  it("returns 'derja' for Arabizi digit-letter pattern: '7keya'", () => {
    // 7 adjacent to letter → Arabizi signature
    expect(detectLikelyLanguage("7keya")).toBe("derja");
  });

  it("returns 'derja' for Arabizi digit-letter pattern: 'kifech' (glossary token)", () => {
    expect(detectLikelyLanguage("kifech")).toBe("derja");
  });

  it("returns 'derja' for EXTRA_DERJA_TOKENS: 'mta3'", () => {
    expect(detectLikelyLanguage("mta3 el yom")).toBe("derja");
  });

  it("returns 'derja' for glossary token 'barcha'", () => {
    expect(detectLikelyLanguage("barcha clients today")).toBe("derja");
  });

  it("returns 'derja' for glossary token 'chwaya'", () => {
    expect(detectLikelyLanguage("chwaya flus")).toBe("derja");
  });

  it("returns 'derja' for EXTRA_DERJA_TOKENS: 'famma'", () => {
    expect(detectLikelyLanguage("famma problem")).toBe("derja");
  });

  it("does NOT treat plain standalone digits as Arabizi: '3 days, 9000 calls'", () => {
    // Digits not letter-adjacent → no Arabizi signal → English fallthrough
    expect(detectLikelyLanguage("3 days, 9000 calls")).toBe("en");
  });
});

describe("detectLikelyLanguage — French", () => {
  it("returns 'fr' for 'Combien de revenu pour le mois?'", () => {
    expect(detectLikelyLanguage("Combien de revenu pour le mois?")).toBe("fr");
  });

  it("returns 'fr' when French stopwords are present (comment, pourquoi)", () => {
    expect(detectLikelyLanguage("Comment est le revenu hier")).toBe("fr");
  });

  it("returns 'fr' for a sentence with 'les', 'des', 'pour'", () => {
    expect(detectLikelyLanguage("les ventes des clients pour ce mois")).toBe("fr");
  });

  it("returns 'fr' for 'combien' alone", () => {
    expect(detectLikelyLanguage("combien")).toBe("fr");
  });

  it("returns 'fr' for 'sur le chiffre des affaires'", () => {
    expect(detectLikelyLanguage("sur le chiffre des affaires")).toBe("fr");
  });
});

describe("detectLikelyLanguage — English", () => {
  it("returns 'en' for 'What was revenue yesterday?'", () => {
    expect(detectLikelyLanguage("What was revenue yesterday?")).toBe("en");
  });

  it("returns 'en' for a normal English analytics question", () => {
    expect(detectLikelyLanguage("Show me the top 10 customers by revenue")).toBe("en");
  });

  it("returns 'en' for a single ASCII word with no French/Derja markers", () => {
    expect(detectLikelyLanguage("revenue")).toBe("en");
  });

  it("returns 'unknown' for pure digits with no ASCII letters", () => {
    // No /[a-z]/i match → falls through to "unknown"
    expect(detectLikelyLanguage("9000")).toBe("unknown");
  });
});

describe("detectLikelyLanguage — unknown", () => {
  it("returns 'unknown' for a string with only punctuation", () => {
    expect(detectLikelyLanguage("???!!!...")).toBe("unknown");
  });

  it("returns 'unknown' for a string with only numbers (no letter adjacent)", () => {
    expect(detectLikelyLanguage("12345")).toBe("unknown");
  });
});

describe("detectLikelyLanguage — edge cases from source comments", () => {
  it("example: '9adech el flus mta3 ennhar?' → derja", () => {
    expect(detectLikelyLanguage("9adech el flus mta3 ennhar?")).toBe("derja");
  });

  it("example: 'ما هو إجمالي الإيرادات؟' → ar", () => {
    expect(detectLikelyLanguage("ما هو إجمالي الإيرادات؟")).toBe("ar");
  });

  it("example: 'Combien de revenu pour le mois?' → fr", () => {
    expect(detectLikelyLanguage("Combien de revenu pour le mois?")).toBe("fr");
  });

  it("example: 'What was revenue yesterday?' → en", () => {
    expect(detectLikelyLanguage("What was revenue yesterday?")).toBe("en");
  });

  it("example: '3 days, 9000 calls' → en (digits not letter-adjacent)", () => {
    expect(detectLikelyLanguage("3 days, 9000 calls")).toBe("en");
  });

  it("empty string → unknown", () => {
    expect(detectLikelyLanguage("")).toBe("unknown");
  });
});

// ─── localizedSystemPrefix ───────────────────────────────────────────────────

describe("localizedSystemPrefix", () => {
  it("returns a non-empty string for Derja (Arabizi) input", () => {
    // Arrange
    const input = "9adech el flus?";
    // Act
    const prefix = localizedSystemPrefix(input);
    // Assert: hint prepended
    expect(prefix.length).toBeGreaterThan(0);
    expect(prefix).toContain(DERJA_SYSTEM_HINT);
  });

  it("ends with a double newline for Derja input so it can be concatenated safely", () => {
    const prefix = localizedSystemPrefix("9adech el flus?");
    const doubleNewline = "\n\n";
    expect(prefix.endsWith(doubleNewline)).toBe(true);
  });

  it("returns a non-empty string for Arabic-script Derja input", () => {
    const prefix = localizedSystemPrefix("قداش الفلوس؟");
    expect(prefix.length).toBeGreaterThan(0);
  });

  it("returns a non-empty string for MSA (ar) input — hint still included", () => {
    // Per source: 'ar' also gets the hint (costs little, useful for mislabeled Derja)
    const prefix = localizedSystemPrefix("ما هو إجمالي الإيرادات؟");
    expect(prefix.length).toBeGreaterThan(0);
    expect(prefix).toContain(DERJA_SYSTEM_HINT);
  });

  it("returns empty string for English input", () => {
    const prefix = localizedSystemPrefix("What was revenue yesterday?");
    expect(prefix).toBe("");
  });

  it("returns empty string for French input", () => {
    const prefix = localizedSystemPrefix("Combien de revenu pour le mois?");
    expect(prefix).toBe("");
  });

  it("returns empty string for empty input (unknown language)", () => {
    const prefix = localizedSystemPrefix("");
    expect(prefix).toBe("");
  });

  it("returns empty string for unknown/punctuation-only input", () => {
    const prefix = localizedSystemPrefix("???!!!");
    expect(prefix).toBe("");
  });

  it("can be safely concatenated with an existing system prompt", () => {
    // Arrange
    const existingPrompt = "You are a data analyst assistant.";
    // Act: Derja → hint prepended
    const combined = localizedSystemPrefix("9adech el flus?") + existingPrompt;
    // Assert: both parts present, separated by blank line
    expect(combined).toContain(DERJA_SYSTEM_HINT);
    expect(combined).toContain(existingPrompt);
    expect(combined).toContain("\n\n");
  });

  it("concatenated with existing prompt: English → only existing prompt remains", () => {
    const existingPrompt = "You are a data analyst assistant.";
    const combined = localizedSystemPrefix("Show me revenue") + existingPrompt;
    expect(combined).toBe(existingPrompt);
  });
});
