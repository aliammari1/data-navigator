// src/features/data-formulator/core/voice/voice-command-router.ts
self.onmessage = (e) => {
  const { type, transcript, language } = e.data;
  if (type !== "ROUTE_COMMAND") {
    self.postMessage({ type: "ROUTE_ERROR", error: "Unknown request type" });
    return;
  }
  if (!transcript.trim()) {
    self.postMessage({ type: "ROUTE_ERROR", error: "Empty transcript" });
    return;
  }
  const command = heuristicallyRoute(transcript, language);
  self.postMessage({ type: "COMMAND_ROUTED", command });
};
function heuristicallyRoute(transcript, language) {
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
    language: language || "auto"
  };
}
