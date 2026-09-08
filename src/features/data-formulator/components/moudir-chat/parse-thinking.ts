/**
 * Thinking parser — extracts <think>...</think> chain-of-thought blocks from
 * model output (e.g. DeepSeek-R1, QwQ, Gemma 4, reasoning models).
 *
 * Streaming-aware:
 * - If <think> is opened but not yet closed (in-flight thinking token stream),
 *   it marks isThinking: true, thinking: current thinking stream, cleanContent: ""
 * - If <think>...</think> is closed, it extracts the thinking block and returns
 *   isThinking: false, thinking: completed thought, cleanContent: trailing prose
 * - If no thinking tag is present, thinking: "", isThinking: false, cleanContent: full text
 */

export interface ThinkingParseResult {
  /** The extracted chain-of-thought reasoning text (trimmed). */
  thinking: string;
  /** Whether the model is currently in the middle of thinking (unclosed tag). */
  isThinking: boolean;
  /** Content with thinking tags and thinking prose completely stripped. */
  cleanContent: string;
}

const THINK_START_TAGS = ["<think>", "<thought>", "[thinking]"];
const THINK_END_TAGS = ["</think>", "</thought>", "[/thinking]"];

export function parseThinking(content: string): ThinkingParseResult {
  if (!content) {
    return { thinking: "", isThinking: false, cleanContent: "" };
  }

  const lower = content.toLowerCase();

  // Find the earliest start tag
  let startIdx = -1;
  let startTagLength = 0;
  let matchingEndTag = "</think>";

  for (let i = 0; i < THINK_START_TAGS.length; i++) {
    const tag = THINK_START_TAGS[i];
    const idx = lower.indexOf(tag);
    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) {
      startIdx = idx;
      startTagLength = tag.length;
      matchingEndTag = THINK_END_TAGS[i];
    }
  }

  // No thinking tag found
  if (startIdx === -1) {
    return { thinking: "", isThinking: false, cleanContent: content };
  }

  const beforeThink = content.slice(0, startIdx).trim();
  const afterStart = content.slice(startIdx + startTagLength);
  const endIdx = afterStart.toLowerCase().indexOf(matchingEndTag);

  if (endIdx === -1) {
    // Unclosed thinking tag: currently in-flight thinking
    return {
      thinking: afterStart.trim(),
      isThinking: true,
      cleanContent: beforeThink,
    };
  }

  // Closed thinking tag
  const thinking = afterStart.slice(0, endIdx).trim();
  const afterThink = afterStart.slice(endIdx + matchingEndTag.length).trim();
  const cleanContent = [beforeThink, afterThink].filter(Boolean).join("\n\n");

  return {
    thinking,
    isThinking: false,
    cleanContent,
  };
}
