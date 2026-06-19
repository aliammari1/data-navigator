import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CHARS_PER_CHUNK,
  chunkText,
  normalizeText,
  splitIntoSentences,
} from "@/platform/ai/kokoro-tts";

/**
 * Locks in the shared Kokoro text-preparation primitives (normalizeText,
 * splitIntoSentences, chunkText). The model-load path is intentionally NOT
 * exercised — these are the pure chunking primitives both workers depend on.
 */

describe("normalizeText", () => {
  it("trims and collapses runs of whitespace to single spaces", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
    expect(normalizeText("a\n\tb")).toBe("a b");
  });

  it("strips zero-width and BOM characters", () => {
    // ZWSP, ZWNJ, ZWJ, BOM/ZWNBSP all in one string.
    expect(normalizeText("a​b‌c‍d﻿e")).toBe("abcde");
  });

  it("NFKC-folds compatibility characters", () => {
    // Fullwidth digits fold to ASCII under NFKC.
    expect(normalizeText("１２３")).toBe("123");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeText("   ")).toBe("");
    expect(normalizeText("")).toBe("");
  });

  it("preserves interior single spaces between words", () => {
    expect(normalizeText("one two three")).toBe("one two three");
  });
});

describe("splitIntoSentences", () => {
  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitIntoSentences("")).toEqual([]);
    expect(splitIntoSentences("   ")).toEqual([]);
  });

  it("splits after sentence-final punctuation", () => {
    expect(splitIntoSentences("Hello world. How are you?")).toEqual([
      "Hello world.",
      "How are you?",
    ]);
  });

  it("splits on exclamation and question marks", () => {
    expect(splitIntoSentences("Stop! Really? Yes.")).toEqual([
      "Stop!",
      "Really?",
      "Yes.",
    ]);
  });

  it("splits on the Arabic question mark", () => {
    expect(splitIntoSentences("كيف حالك؟ بخير.")).toEqual([
      "كيف حالك؟",
      "بخير.",
    ]);
  });

  it("returns the whole normalized text as one part when there is no boundary", () => {
    expect(splitIntoSentences("just one sentence with no terminal")).toEqual([
      "just one sentence with no terminal",
    ]);
  });

  it("does not split when punctuation is not followed by whitespace", () => {
    // No whitespace after the period, so the lookbehind+\s+ rule does not fire.
    expect(splitIntoSentences("3.14 is pi")).toEqual(["3.14 is pi"]);
  });

  it("normalizes whitespace before splitting", () => {
    expect(splitIntoSentences("First.\n\n  Second.")).toEqual([
      "First.",
      "Second.",
    ]);
  });
});

describe("chunkText", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("keeps a single short sentence as one chunk", () => {
    expect(chunkText("Hello world.")).toEqual(["Hello world."]);
  });

  it("packs multiple sentences into one chunk under the bound", () => {
    expect(chunkText("One. Two. Three.", 50)).toEqual(["One. Two. Three."]);
  });

  it("starts a new chunk when adding the next sentence would exceed the bound", () => {
    const result = chunkText("aaaa. bbbb. cccc.", 10);
    // "aaaa." (5) + " bbbb." -> 11 > 10, so each lands in its own chunk.
    expect(result).toEqual(["aaaa.", "bbbb.", "cccc."]);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
  });

  it("greedily fills a chunk before opening the next", () => {
    // maxChars 12: "ab. cd." (7) fits; adding " ef." -> 11 fits; adding " gh." -> 15 > 12.
    expect(chunkText("ab. cd. ef. gh.", 12)).toEqual(["ab. cd. ef.", "gh."]);
  });

  it("force-splits a single sentence longer than the bound on a word boundary", () => {
    const sentence = "alpha beta gamma delta epsilon zeta eta theta";
    const chunks = chunkText(sentence, 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
    // No content lost (modulo the spaces collapsed at split points).
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(sentence);
  });

  it("force-splits a long unbroken token without spaces", () => {
    const word = "x".repeat(50);
    const chunks = chunkText(word, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // Every piece is bounded by maxChars.
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
    // All characters are preserved.
    expect(chunks.join("")).toBe(word);
  });

  it("uses the 0.75*maxChars floor when no space precedes the bound", () => {
    // A long token has no space before index 20, so the split index falls back
    // to floor(20 * 0.75) === 15.
    const word = "y".repeat(40);
    const chunks = chunkText(word, 20);
    expect(chunks[0].length).toBe(15);
  });

  it("defaults to DEFAULT_MAX_CHARS_PER_CHUNK when maxChars is omitted", () => {
    const long = "word ".repeat(100).trim();
    const chunks = chunkText(long);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS_PER_CHUNK);
    }
  });

  it("exposes a sensible default bound", () => {
    expect(DEFAULT_MAX_CHARS_PER_CHUNK).toBe(220);
  });
});
