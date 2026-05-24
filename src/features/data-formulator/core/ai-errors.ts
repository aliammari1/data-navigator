"use client";

/**
 * AI Errors
 * Safe, user-facing error types for AI pipeline failures.
 */

export type AiErrorCode =
  | "EDGE_AI_UNAVAILABLE"
  | "MODEL_MISSING"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "TOOL_FAILED"
  | "SQL_UNSAFE"
  | "TIMEOUT"
  | "UNKNOWN";

export interface AiError {
  code: AiErrorCode;
  message: string;
  context?: string;
  retryable: boolean;
  userAction?: string;
}

export function createAiError(
  code: AiErrorCode,
  message: string,
  options?: { context?: string; retryable?: boolean; userAction?: string },
): AiError {
  return {
    code,
    message,
    context: options?.context,
    retryable: options?.retryable ?? false,
    userAction: options?.userAction,
  };
}

export function aiErrorFromUnknown(err: unknown): AiError {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("edge ai") && msg.includes("unavailable")) {
      return createAiError("EDGE_AI_UNAVAILABLE", err.message, {
        retryable: true,
        userAction: "Use a browser runtime with Web Worker support.",
      });
    }
    if (msg.includes("json")) {
      return createAiError("INVALID_JSON", err.message, {
        retryable: true,
        userAction: "Try a more specific prompt or a larger model.",
      });
    }
    if (msg.includes("timeout")) {
      return createAiError("TIMEOUT", err.message, {
        retryable: true,
        userAction: "Try a smaller model or reduce the query complexity.",
      });
    }
    return createAiError("UNKNOWN", err.message);
  }
  return createAiError("UNKNOWN", String(err));
}

export function formatAiErrorForUser(error: AiError): string {
  const parts = [error.message];
  if (error.context) {
    parts.push(`Context: ${error.context}`);
  }
  if (error.userAction) {
    parts.push(`Action: ${error.userAction}`);
  }
  return parts.join(" ").trim();
}
