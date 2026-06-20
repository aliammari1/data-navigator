import { bench, describe } from "vitest";
import { chunkText, normalizeText, splitIntoSentences } from "@/platform/ai/kokoro-tts";

/**
 * Performance benchmarks for the Kokoro TTS text-preparation hot path
 * (run with `pnpm run bench`).
 *
 * Before a single byte of audio is synthesized, every narration string is
 * normalized, split into sentences and packed into <=220-char chunks. For a
 * long AI briefing or a multi-paragraph report read-aloud this runs over the
 * whole document on the main thread, so a regression here delays first audio.
 *
 * These are pure string functions — no `kokoro-js` model load, no worker
 * protocol — so they are safe to bench directly. We build a large deterministic
 * synthetic "document" ONCE at module scope so the bench measures chunking, not
 * sentence generation.
 */

/** Counter-based pseudo-word generator — deterministic, no Math.random/Date. */
const LEXICON = [
  "the",
  "telecom",
  "report",
  "revenue",
  "increased",
  "across",
  "every",
  "region",
  "while",
  "transaction",
  "volume",
  "stayed",
  "flat",
  "and",
  "success",
  "rate",
  "improved",
  "slightly",
  "for",
  "the",
  "northern",
  "agencies",
  "compared",
  "with",
  "last",
  "quarter",
  "figures",
];

/** Build a sentence of `wordCount` deterministic words, varied by index. */
function makeSentence(seed: number, wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    // index-varied, fully deterministic pick into the lexicon
    const idx = (seed * 31 + i * 7 + ((seed + i) % 5)) % LEXICON.length;
    words.push(LEXICON[idx]);
  }
  // Terminal punctuation cycles through . ! ? and the Arabic question mark ؟.
  const terminators = [".", "!", "?", "؟"];
  return `${words.join(" ")}${terminators[seed % terminators.length]}`;
}

/**
 * Build a document of `sentenceCount` sentences. Word counts vary 4..23 by index
 * so some sentences exceed the 220-char chunk bound and force a word-boundary
 * split (the most expensive branch of `chunkText`).
 */
function makeDocument(sentenceCount: number): string {
  const parts: string[] = [];
  for (let s = 0; s < sentenceCount; s += 1) {
    const wordCount = 4 + ((s * 3) % 20); // 4..23 words
    parts.push(makeSentence(s, wordCount));
  }
  return parts.join(" ");
}

// One long sentence (no terminal punctuation runs) that blows past maxChars and
// must be force-split on word boundaries — exercises the flatMap split branch.
function makeOversizedSentence(wordCount: number): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    words.push(LEXICON[(i * 13 + 3) % LEXICON.length]);
  }
  return `${words.join(" ")}.`;
}

const SMALL_DOC = makeDocument(1_000); // ~1k sentences
const LARGE_DOC = makeDocument(10_000); // ~10k sentences (long briefing / book chapter)
const OVERSIZED = `${makeOversizedSentence(20_000)} ${makeDocument(2_000)}`;

describe("kokoro-tts chunkText (TTS prep hot path)", () => {
  bench("chunkText over ~1k-sentence document (maxChars=220)", () => {
    chunkText(SMALL_DOC);
  });

  bench("chunkText over ~10k-sentence document (maxChars=220)", () => {
    chunkText(LARGE_DOC);
  });

  bench("chunkText with a giant force-split sentence (~20k words)", () => {
    chunkText(OVERSIZED);
  });
});

describe("kokoro-tts text preparation primitives", () => {
  bench("normalizeText over ~10k-sentence document", () => {
    normalizeText(LARGE_DOC);
  });

  bench("splitIntoSentences over ~10k-sentence document", () => {
    splitIntoSentences(LARGE_DOC);
  });
});
