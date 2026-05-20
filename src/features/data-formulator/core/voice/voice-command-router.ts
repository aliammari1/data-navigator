/// <reference lib="webworker" />

/**
 * Voice Command Router
 * Routes transcribed speech through the Ollama normalizer to produce
 * canonical business intents.
 */

export interface VoiceCommand {
  transcript: string;
  normalized: string;
  intent: string;
  confidence: number;
  language: string;
}

export interface VoiceRouteRequest {
  type: "ROUTE_COMMAND";
  transcript: string;
  language: string;
}

export type VoiceRouteResponse =
  | { type: "COMMAND_ROUTED"; command: VoiceCommand }
  | { type: "ROUTE_ERROR"; error: string };

self.onmessage = (e: MessageEvent<VoiceRouteRequest>) => {
  const { type, transcript, language } = e.data;

  if (type !== "ROUTE_COMMAND") {
    self.postMessage({ type: "ROUTE_ERROR", error: "Unknown request type" } as VoiceRouteResponse);
    return;
  }

  if (!transcript.trim()) {
    self.postMessage({ type: "ROUTE_ERROR", error: "Empty transcript" } as VoiceRouteResponse);
    return;
  }

  // Local heuristic routing (fast path) — full Ollama normalization happens in main thread
  const command = heuristicallyRoute(transcript, language);
  self.postMessage({ type: "COMMAND_ROUTED", command } as VoiceRouteResponse);
};

function heuristicallyRoute(transcript: string, language: string): VoiceCommand {
  const text = transcript.toLowerCase().trim();
  let intent = "ask";
  let confidence = 0.5;

  if (/\b(kpi|metric|taux|najah|مؤشر|نسبة)\b/.test(text)) {
    intent = "kpi";
    confidence = 0.8;
  } else if (/\b(dashboard|tableau|vue|لوحة)\b/.test(text)) {
    intent = "dashboard";
    confidence = 0.8;
  } else if (/\b(why|3lech|pourquoi|علاش|investigate|cause|سبب)\b/.test(text)) {
    intent = "investigate";
    confidence = 0.8;
  } else if (/\b(signal|anomaly|alert|spike|drop|anomalie|مشكل)\b/.test(text)) {
    intent = "signal";
    confidence = 0.7;
  } else if (/\b(brief|resume|résumé|summary|dg|executive|ملخص)\b/.test(text)) {
    intent = "brief";
    confidence = 0.8;
  } else if (/\b(scenario|what if|if|simulate|impact|suppose)\b/.test(text)) {
    intent = "scenario";
    confidence = 0.7;
  } else if (/\b(setup|config|model|ollama|install|parametres)\b/.test(text)) {
    intent = "setup";
    confidence = 0.7;
  }

  return {
    transcript,
    normalized: transcript,
    intent,
    confidence,
    language: language || "auto",
  };
}
