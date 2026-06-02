/// <reference lib="webworker" />

/**
 * Voice Command Router
 *
 * Offline deterministic command router.
 *
 * Pipeline stage:
 * VAD → STT transcript → this router → tool-call candidate → UI / agent flow
 *
 * This worker does not call any provider.
 * It performs:
 * - transcript normalization
 * - multilingual / Arabizi heuristic intent routing
 * - lightweight entity extraction
 * - deterministic tool-call candidate creation
 * - UI-friendly routing metadata
 */

import {
  mapLanguageHintToDisplayLabel,
  normalizeLanguageHint,
  type VoiceLanguageHint,
} from "./voice-model-registry";

export type VoiceIntent =
  | "ask"
  | "kpi"
  | "dashboard"
  | "investigate"
  | "signal"
  | "brief"
  | "scenario"
  | "setup"
  | "compare"
  | "forecast"
  | "filter"
  | "export"
  | "explain"
  | "help";

export type VoiceToolSafety = "read-only" | "requires-confirmation";

export interface VoiceEntity {
  type:
    | "metric"
    | "dimension"
    | "time_range"
    | "channel"
    | "format"
    | "threshold"
    | "language"
    | "unknown";
  value: string;
  confidence: number;
}

export interface VoiceToolCall {
  id: string;
  toolName: string;
  displayName: string;
  description: string;
  safety: VoiceToolSafety;
  mutatesState: boolean;
  requiresConfirmation: boolean;
  args: Record<string, unknown>;
}

export interface VoiceRouteTimelineItem {
  id: string;
  label: string;
  status: "done" | "active" | "pending" | "error";
  detail?: string;
}

export interface VoiceCommand {
  transcript: string;
  normalized: string;
  intent: VoiceIntent;
  confidence: number;
  language: VoiceLanguageHint;
  languageLabel: string;
  matchedTerms: string[];
  entities: VoiceEntity[];
  toolCall: VoiceToolCall;
  timeline: VoiceRouteTimelineItem[];
}

export interface VoiceRouteRequest {
  type: "ROUTE_COMMAND";
  transcript: string;
  language?: VoiceLanguageHint | string;
  context?: {
    source?: string;
    currentView?: string;
    datasetName?: string;
    semanticMode?: boolean;
    allowMutations?: boolean;
  };
}

export interface VoiceCapabilitiesRequest {
  type: "GET_CAPABILITIES";
}

export interface VoiceTestRouteRequest {
  type: "TEST_ROUTE";
  transcript: string;
  language?: VoiceLanguageHint | string;
}

export type VoiceRouterRequest =
  | VoiceRouteRequest
  | VoiceCapabilitiesRequest
  | VoiceTestRouteRequest;

export type VoiceRouteResponse =
  | { type: "ROUTER_READY"; intents: VoiceIntent[]; tools: string[] }
  | { type: "CAPABILITIES"; intents: VoiceIntent[]; tools: string[] }
  | { type: "COMMAND_ROUTED"; command: VoiceCommand }
  | { type: "ROUTE_ERROR"; error: string };

interface IntentRule {
  intent: Exclude<VoiceIntent, "ask">;
  confidence: number;
  patterns: RegExp[];
}

interface IntentMatch {
  intent: VoiceIntent;
  confidence: number;
  matchedTerms: string[];
}

const workerSelf = self as unknown as DedicatedWorkerGlobalScope;

const INTENT_RULES: IntentRule[] = [
  {
    intent: "kpi",
    confidence: 0.84,
    patterns: [
      /\bkpi\b/u,
      /\bmetric(?:s)?\b/u,
      /\bmeasure(?:s)?\b/u,
      /\bindicator(?:s)?\b/u,
      /\bperformance indicator(?:s)?\b/u,
      /\btaux\b/u,
      /\brate\b/u,
      /\bratio\b/u,
      /\bconversion\b/u,
      /\bretention\b/u,
      /\bchurn\b/u,
      /\brevenue\b/u,
      /\bprofit\b/u,
      /\bmargin\b/u,
      /\bnajah\b/u,
      /\bnesba\b/u,
      /\bnisba\b/u,
      /\bmo2acher\b/u,
      /\bmoachir\b/u,
      /مؤشر/u,
      /نسبة/u,
      /مقياس/u,
      /ربح/u,
      /مداخيل/u,
    ],
  },
  {
    intent: "dashboard",
    confidence: 0.82,
    patterns: [
      /\bdashboard\b/u,
      /\bdash\b/u,
      /\btableau(?: de bord)?\b/u,
      /\bview\b/u,
      /\bvue\b/u,
      /\bvisuali[sz]e\b/u,
      /\bvisuali[sz]ation(?:s)?\b/u,
      /\bchart(?:s)?\b/u,
      /\bgraph(?:s)?\b/u,
      /\bplot\b/u,
      /\bshow me\b/u,
      /\bdisplay\b/u,
      /\bdraw\b/u,
      /\baffiche\b/u,
      /\bafficher\b/u,
      /\bmontre\b/u,
      /\bwarini\b/u,
      /\bworini\b/u,
      /وريني/u,
      /اعرض/u,
      /أعرض/u,
      /لوحة/u,
      /رسم/u,
      /بيان/u,
    ],
  },
  {
    intent: "investigate",
    confidence: 0.84,
    patterns: [
      /\bwhy\b/u,
      /\bwhy did\b/u,
      /\bwhat caused\b/u,
      /\bcause(?:s)?\b/u,
      /\breason(?:s)?\b/u,
      /\broot cause\b/u,
      /\binvestigate\b/u,
      /\banaly[sz]e why\b/u,
      /\bexplain why\b/u,
      /\bpourquoi\b/u,
      /\banalyse(?:r)? pourquoi\b/u,
      /\bcause racine\b/u,
      /\b3lech\b/u,
      /\balech\b/u,
      /\bchbih\b/u,
      /\bchnowa sabab\b/u,
      /علاش/u,
      /لماذا/u,
      /سبب/u,
      /شنوة السبب/u,
    ],
  },
  {
    intent: "signal",
    confidence: 0.76,
    patterns: [
      /\bsignal(?:s)?\b/u,
      /\banomal(?:y|ies)\b/u,
      /\banomalie(?:s)?\b/u,
      /\balert(?:s)?\b/u,
      /\bwarning(?:s)?\b/u,
      /\brisk(?:s)?\b/u,
      /\bissue(?:s)?\b/u,
      /\bproblem(?:s)?\b/u,
      /\bspike(?:s)?\b/u,
      /\bdrop(?:s)?\b/u,
      /\bdecrease\b/u,
      /\bincrease\b/u,
      /\bchange(?:s)?\b/u,
      /\boutlier(?:s)?\b/u,
      /\bunusual\b/u,
      /\babnormal\b/u,
      /مشكل/u,
      /مشكلة/u,
      /تنبيه/u,
      /خطر/u,
      /هبوط/u,
      /ارتفاع/u,
      /تغير/u,
    ],
  },
  {
    intent: "brief",
    confidence: 0.82,
    patterns: [
      /\bbrief\b/u,
      /\bsummary\b/u,
      /\bsummar(?:y|ize|ise)\b/u,
      /\bexecutive\b/u,
      /\bexecutive brief\b/u,
      /\bdigest\b/u,
      /\breport\b/u,
      /\brecap\b/u,
      /\bresume\b/u,
      /\brésumé\b/u,
      /\bsynth[eè]se\b/u,
      /\bdg\b/u,
      /\bceo\b/u,
      /ملخص/u,
      /تقرير/u,
      /خلاصة/u,
      /موجز/u,
    ],
  },
  {
    intent: "scenario",
    confidence: 0.76,
    patterns: [
      /\bscenario(?:s)?\b/u,
      /\bwhat if\b/u,
      /\bwhat happens if\b/u,
      /\bsimulat(?:e|ion)\b/u,
      /\bimpact\b/u,
      /\bsuppose\b/u,
      /\bassume\b/u,
      /\bif .* then\b/u,
      /\bsi\b/u,
      /\bsc[eé]nario\b/u,
      /\bsimulation\b/u,
      /\bnfardhou\b/u,
      /\bken\b/u,
      /\bkan\b/u,
      /لو/u,
      /إذا/u,
      /محاكاة/u,
      /فرض/u,
    ],
  },
  {
    intent: "forecast",
    confidence: 0.78,
    patterns: [
      /\bforecast\b/u,
      /\bprojection\b/u,
      /\bpredict\b/u,
      /\bprediction\b/u,
      /\btrend\b/u,
      /\bnext month\b/u,
      /\bnext week\b/u,
      /\bnext quarter\b/u,
      /\bprévision\b/u,
      /\bprevision\b/u,
      /\btendance\b/u,
      /توقع/u,
      /تنبؤ/u,
      /الشهر الجاي/u,
      /الأسبوع الجاي/u,
    ],
  },
  {
    intent: "compare",
    confidence: 0.78,
    patterns: [
      /\bcompare\b/u,
      /\bcomparison\b/u,
      /\bversus\b/u,
      /\bvs\b/u,
      /\bagainst\b/u,
      /\bbetween\b/u,
      /\bcomparez\b/u,
      /\bcomparaison\b/u,
      /\bcontre\b/u,
      /\bfar9\b/u,
      /\b الفرق\b/u,
      /قارن/u,
      /مقارنة/u,
      /بين/u,
    ],
  },
  {
    intent: "filter",
    confidence: 0.74,
    patterns: [
      /\bfilter\b/u,
      /\bwhere\b/u,
      /\bonly\b/u,
      /\bexclude\b/u,
      /\binclude\b/u,
      /\bsegment\b/u,
      /\bfiltre\b/u,
      /\bseulement\b/u,
      /\buniquement\b/u,
      /\bjuste\b/u,
      /فلتر/u,
      /فقط/u,
      /كان/u,
    ],
  },
  {
    intent: "export",
    confidence: 0.74,
    patterns: [
      /\bexport\b/u,
      /\bdownload\b/u,
      /\bsave\b/u,
      /\bpdf\b/u,
      /\bcsv\b/u,
      /\bexcel\b/u,
      /\bxlsx\b/u,
      /\bpowerpoint\b/u,
      /\bppt\b/u,
      /\btélécharge\b/u,
      /\btelecharge\b/u,
      /\benregistre\b/u,
      /صدر/u,
      /حمّل/u,
      /نزل/u,
      /احفظ/u,
    ],
  },
  {
    intent: "setup",
    confidence: 0.74,
    patterns: [
      /\bsetup\b/u,
      /\bconfigure\b/u,
      /\bconfiguration\b/u,
      /\bconfig\b/u,
      /\bsettings\b/u,
      /\bmodel(?:s)?\b/u,
      /\bedge\b/u,
      /\boffline\b/u,
      /\binstall\b/u,
      /\bconnect\b/u,
      /\bprovider\b/u,
      /\bparam(?:e|è)tres\b/u,
      /\bparam[eè]trage\b/u,
      /إعدادات/u,
      /ثبت/u,
      /نموذج/u,
      /ضبط/u,
    ],
  },
  {
    intent: "explain",
    confidence: 0.72,
    patterns: [
      /\bexplain\b/u,
      /\bexplanation\b/u,
      /\bwhat does\b/u,
      /\bwhat is\b/u,
      /\bmeaning\b/u,
      /\bdefine\b/u,
      /\bexplique\b/u,
      /\bdéfinir\b/u,
      /\bdefinition\b/u,
      /\bchnowa\b/u,
      /\bchniya\b/u,
      /اشرح/u,
      /شنوة/u,
      /ما معنى/u,
    ],
  },
  {
    intent: "help",
    confidence: 0.7,
    patterns: [
      /\bhelp\b/u,
      /\bwhat can you do\b/u,
      /\bcommands\b/u,
      /\bexamples\b/u,
      /\baide\b/u,
      /\bhelp me\b/u,
      /\bcomment utiliser\b/u,
      /\ba3wni\b/u,
      /\bawenni\b/u,
      /ساعدني/u,
      /الأوامر/u,
      /أمثلة/u,
    ],
  },
];

const METRIC_PATTERNS: RegExp[] = [
  /\brevenue\b/u,
  /\bsales\b/u,
  /\bprofit\b/u,
  /\bmargin\b/u,
  /\bconversion\b/u,
  /\bretention\b/u,
  /\bchurn\b/u,
  /\busers?\b/u,
  /\borders?\b/u,
  /\btransactions?\b/u,
  /\bactivation\b/u,
  /\bengagement\b/u,
  /\btaux\b/u,
  /\bvente(?:s)?\b/u,
  /\bchiffre d'affaires\b/u,
  /مداخيل/u,
  /ربح/u,
  /مبيعات/u,
  /مستخدم/u,
  /طلبات/u,
];

const DIMENSION_PATTERNS: RegExp[] = [
  /\bby month\b/u,
  /\bby week\b/u,
  /\bby day\b/u,
  /\bby channel\b/u,
  /\bby region\b/u,
  /\bby product\b/u,
  /\bby category\b/u,
  /\bpar mois\b/u,
  /\bpar semaine\b/u,
  /\bpar jour\b/u,
  /\bpar canal\b/u,
  /\bpar région\b/u,
  /\bpar region\b/u,
  /\bpar produit\b/u,
  /حسب الشهر/u,
  /حسب الأسبوع/u,
  /حسب اليوم/u,
  /حسب القناة/u,
  /حسب المنطقة/u,
];

const TIME_RANGE_PATTERNS: RegExp[] = [
  /\btoday\b/u,
  /\byesterday\b/u,
  /\bthis week\b/u,
  /\blast week\b/u,
  /\bthis month\b/u,
  /\blast month\b/u,
  /\bthis quarter\b/u,
  /\blast quarter\b/u,
  /\bthis year\b/u,
  /\blast year\b/u,
  /\b7 days\b/u,
  /\b30 days\b/u,
  /\b90 days\b/u,
  /\baujourd'hui\b/u,
  /\bhier\b/u,
  /\bcette semaine\b/u,
  /\bsemaine dernière\b/u,
  /\bce mois\b/u,
  /\bmois dernier\b/u,
  /\bcette année\b/u,
  /\bannée dernière\b/u,
  /اليوم/u,
  /البارح/u,
  /هذا الأسبوع/u,
  /الشهر هذا/u,
  /الشهر الفارط/u,
  /السنة هذه/u,
];

const FORMAT_PATTERNS: RegExp[] = [
  /\bpdf\b/u,
  /\bcsv\b/u,
  /\bexcel\b/u,
  /\bxlsx\b/u,
  /\bppt\b/u,
  /\bpowerpoint\b/u,
  /\bjson\b/u,
  /\btable\b/u,
  /\bchart\b/u,
  /\bgraph\b/u,
];

const ALL_INTENTS: VoiceIntent[] = [
  "ask",
  "kpi",
  "dashboard",
  "investigate",
  "signal",
  "brief",
  "scenario",
  "setup",
  "compare",
  "forecast",
  "filter",
  "export",
  "explain",
  "help",
];

const ALL_TOOLS = [
  "manager.ask",
  "kpi.create_or_explain",
  "dashboard.create_or_update",
  "analysis.investigate_root_cause",
  "signals.scan",
  "brief.generate",
  "scenario.simulate",
  "forecast.generate",
  "analysis.compare",
  "data.filter",
  "export.prepare",
  "settings.open_voice_or_ai_setup",
  "manager.explain",
  "help.show_voice_commands",
];

workerSelf.onmessage = (event: MessageEvent<VoiceRouterRequest>) => {
  try {
    const request = event.data;

    if (!request || typeof request.type !== "string") {
      postError("Invalid router request.");
      return;
    }

    switch (request.type) {
      case "GET_CAPABILITIES": {
        workerSelf.postMessage({
          type: "CAPABILITIES",
          intents: ALL_INTENTS,
          tools: ALL_TOOLS,
        } satisfies VoiceRouteResponse);
        return;
      }

      case "TEST_ROUTE":
      case "ROUTE_COMMAND": {
        const transcript = String(request.transcript ?? "");
        const normalized = normalizeTranscript(transcript);

        if (!normalized) {
          postError("Empty transcript.");
          return;
        }

        const language = normalizeLanguageHint(request.language);
        const context =
          request.type === "ROUTE_COMMAND" ? request.context : undefined;

        const command = routeCommand({
          transcript,
          normalized,
          language,
          context,
        });

        workerSelf.postMessage({
          type: "COMMAND_ROUTED",
          command,
        } satisfies VoiceRouteResponse);
        return;
      }

      default: {
        const unknown = request as { type?: string };
        postError(`Unknown router request type: ${unknown.type ?? "unknown"}.`);
      }
    }
  } catch (error) {
    postError(error instanceof Error ? error.message : String(error));
  }
};

function postError(error: string): void {
  workerSelf.postMessage({
    type: "ROUTE_ERROR",
    error,
  } satisfies VoiceRouteResponse);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeTranscript(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[؟?!.]+$/gu, "")
    .replace(/\s+/g, " ");
}

function removeLatinDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatching(input: string): string {
  return removeLatinDiacritics(normalizeTranscript(input).toLowerCase());
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function collectMatches(text: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[0]) {
      matches.push(match[0]);
    }
  }

  return matches;
}

function scoreRule(baseConfidence: number, matchCount: number): number {
  const bonus = Math.min(0.14, Math.max(0, matchCount - 1) * 0.035);
  return Math.min(0.95, baseConfidence + bonus);
}

function selectIntent(text: string): IntentMatch {
  let bestIntent: VoiceIntent = "ask";
  let bestConfidence = 0.5;
  let bestMatches: string[] = [];

  for (const rule of INTENT_RULES) {
    const matches = collectMatches(text, rule.patterns);

    if (matches.length === 0) continue;

    const confidence = scoreRule(rule.confidence, matches.length);

    if (confidence > bestConfidence) {
      bestIntent = rule.intent;
      bestConfidence = confidence;
      bestMatches = matches;
    }
  }

  if (
    bestIntent === "ask" &&
    /\b(show|display|plot|draw|affiche|afficher|montre|warini|worini)\b/u.test(
      text,
    )
  ) {
    bestIntent = "dashboard";
    bestConfidence = 0.68;
    bestMatches = ["implicit-display-command"];
  }

  if (
    bestIntent === "ask" &&
    /\b(create|define|calculate|compute|build|cr[eé]e|calcule|defini|défini)\b/u.test(
      text,
    ) &&
    /\b(metric|measure|indicator|ratio|rate|taux|revenue|profit|conversion|retention)\b/u.test(
      text,
    )
  ) {
    bestIntent = "kpi";
    bestConfidence = 0.72;
    bestMatches = ["implicit-kpi-command"];
  }

  if (
    bestIntent === "ask" &&
    /\b(what is|what are|how many|how much|combien|chnowa|chniya|شنوة|كم)\b/u.test(
      text,
    )
  ) {
    bestConfidence = 0.62;
    bestMatches = ["question-form"];
  }

  return {
    intent: bestIntent,
    confidence: roundConfidence(bestConfidence),
    matchedTerms: Array.from(new Set(bestMatches)).slice(0, 10),
  };
}

function extractEntities(text: string): VoiceEntity[] {
  const entities: VoiceEntity[] = [];

  for (const value of collectMatches(text, METRIC_PATTERNS)) {
    entities.push({
      type: "metric",
      value,
      confidence: 0.75,
    });
  }

  for (const value of collectMatches(text, DIMENSION_PATTERNS)) {
    entities.push({
      type: "dimension",
      value,
      confidence: 0.72,
    });
  }

  for (const value of collectMatches(text, TIME_RANGE_PATTERNS)) {
    entities.push({
      type: "time_range",
      value,
      confidence: 0.8,
    });
  }

  for (const value of collectMatches(text, FORMAT_PATTERNS)) {
    entities.push({
      type: "format",
      value,
      confidence: 0.82,
    });
  }

  const thresholdMatches = text.match(
    /\b(?:above|below|over|under|greater than|less than|supérieur à|inférieur à)\s+(\d+(?:[.,]\d+)?%?)\b/u,
  );

  if (thresholdMatches?.[0]) {
    entities.push({
      type: "threshold",
      value: thresholdMatches[0],
      confidence: 0.72,
    });
  }

  return dedupeEntities(entities).slice(0, 16);
}

function dedupeEntities(entities: VoiceEntity[]): VoiceEntity[] {
  const seen = new Set<string>();
  const result: VoiceEntity[] = [];

  for (const entity of entities) {
    const key = `${entity.type}:${entity.value.toLowerCase()}`;

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(entity);
  }

  return result;
}

function getEntityValues(
  entities: VoiceEntity[],
  type: VoiceEntity["type"],
): string[] {
  return entities
    .filter((entity) => entity.type === type)
    .map((entity) => entity.value);
}

function createCommonArgs({
  transcript,
  normalized,
  language,
  confidence,
  matchedTerms,
  entities,
  context,
}: {
  transcript: string;
  normalized: string;
  language: VoiceLanguageHint;
  confidence: number;
  matchedTerms: string[];
  entities: VoiceEntity[];
  context?: VoiceRouteRequest["context"];
}): Record<string, unknown> {
  return {
    source: "voice",
    transcript,
    request: normalized,
    language,
    languageLabel: mapLanguageHintToDisplayLabel(language),
    confidence,
    matchedTerms,
    entities,
    currentView: context?.currentView,
    datasetName: context?.datasetName,
    semanticMode: context?.semanticMode ?? false,
  };
}

function createToolCall(command: {
  transcript: string;
  normalized: string;
  intent: VoiceIntent;
  confidence: number;
  language: VoiceLanguageHint;
  matchedTerms: string[];
  entities: VoiceEntity[];
  context?: VoiceRouteRequest["context"];
}): VoiceToolCall {
  const commonArgs = createCommonArgs(command);

  switch (command.intent) {
    case "kpi":
      return {
        id: createId("tool"),
        toolName: "kpi.create_or_explain",
        displayName: "KPI tool",
        description: "Create, calculate, or explain a business KPI.",
        safety: "requires-confirmation",
        mutatesState: true,
        requiresConfirmation: true,
        args: {
          ...commonArgs,
          mode: inferKpiMode(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          dimensions: getEntityValues(command.entities, "dimension"),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "dashboard":
      return {
        id: createId("tool"),
        toolName: "dashboard.create_or_update",
        displayName: "Dashboard builder",
        description:
          "Create or update a dashboard view from the voice request.",
        safety: "requires-confirmation",
        mutatesState: true,
        requiresConfirmation: true,
        args: {
          ...commonArgs,
          displayHint: inferDisplayHint(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          dimensions: getEntityValues(command.entities, "dimension"),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "investigate":
      return {
        id: createId("tool"),
        toolName: "analysis.investigate_root_cause",
        displayName: "Root-cause analysis",
        description:
          "Investigate why a metric changed or why a signal happened.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          investigationType: inferInvestigationType(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "signal":
      return {
        id: createId("tool"),
        toolName: "signals.scan",
        displayName: "Signal scanner",
        description: "Scan for anomalies, drops, spikes, alerts, and risks.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          signalType: inferSignalType(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          thresholds: getEntityValues(command.entities, "threshold"),
        },
      };

    case "brief":
      return {
        id: createId("tool"),
        toolName: "brief.generate",
        displayName: "Brief generator",
        description: "Generate a concise business or executive summary.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          audience: inferBriefAudience(command.normalized),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "scenario":
      return {
        id: createId("tool"),
        toolName: "scenario.simulate",
        displayName: "Scenario simulator",
        description: "Run a what-if scenario or impact simulation.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          scenarioMode: inferScenarioMode(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
        },
      };

    case "forecast":
      return {
        id: createId("tool"),
        toolName: "forecast.generate",
        displayName: "Forecast generator",
        description: "Generate trend projections or future metric estimates.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          forecastMode: inferScenarioMode(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "compare":
      return {
        id: createId("tool"),
        toolName: "analysis.compare",
        displayName: "Comparison analysis",
        description: "Compare metrics, segments, periods, or channels.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
          comparisonType: inferComparisonType(command.normalized),
          metrics: getEntityValues(command.entities, "metric"),
          dimensions: getEntityValues(command.entities, "dimension"),
          timeRanges: getEntityValues(command.entities, "time_range"),
        },
      };

    case "filter":
      return {
        id: createId("tool"),
        toolName: "data.filter",
        displayName: "Data filter",
        description:
          "Prepare a filter or semantic search over the current dataset.",
        safety: "requires-confirmation",
        mutatesState: true,
        requiresConfirmation: true,
        args: {
          ...commonArgs,
          filterText: command.normalized,
        },
      };

    case "export":
      return {
        id: createId("tool"),
        toolName: "export.prepare",
        displayName: "Export tool",
        description:
          "Prepare an export such as PDF, CSV, Excel, or PowerPoint.",
        safety: "requires-confirmation",
        mutatesState: true,
        requiresConfirmation: true,
        args: {
          ...commonArgs,
          formats: getEntityValues(command.entities, "format"),
        },
      };

    case "setup":
      return {
        id: createId("tool"),
        toolName: "settings.open_voice_or_ai_setup",
        displayName: "Settings",
        description:
          "Open or adjust voice, model, provider, or edge AI settings.",
        safety: "requires-confirmation",
        mutatesState: true,
        requiresConfirmation: true,
        args: {
          ...commonArgs,
          setupArea: inferSetupArea(command.normalized),
        },
      };

    case "explain":
      return {
        id: createId("tool"),
        toolName: "manager.explain",
        displayName: "Explanation",
        description: "Explain a metric, chart, dashboard, or system behavior.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
        },
      };

    case "help":
      return {
        id: createId("tool"),
        toolName: "help.show_voice_commands",
        displayName: "Voice help",
        description: "Show available voice commands and examples.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
        },
      };

    case "ask":
    default:
      return {
        id: createId("tool"),
        toolName: "manager.ask",
        displayName: "Manager assistant",
        description: "Ask the manager agent a general question.",
        safety: "read-only",
        mutatesState: false,
        requiresConfirmation: false,
        args: {
          ...commonArgs,
        },
      };
  }
}

function createTimeline(command: {
  intent: VoiceIntent;
  confidence: number;
  toolCall: VoiceToolCall;
}): VoiceRouteTimelineItem[] {
  return [
    {
      id: "heard",
      label: "Heard command",
      status: "done",
    },
    {
      id: "normalized",
      label: "Normalized transcript",
      status: "done",
    },
    {
      id: "intent",
      label: "Detected intent",
      status: "done",
      detail: `${command.intent} · ${Math.round(command.confidence * 100)}%`,
    },
    {
      id: "tool",
      label: "Selected tool",
      status: "done",
      detail: command.toolCall.toolName,
    },
    {
      id: "confirm",
      label: command.toolCall.requiresConfirmation
        ? "Waiting for confirmation"
        : "Ready to run",
      status: command.toolCall.requiresConfirmation ? "active" : "done",
    },
  ];
}

function routeCommand({
  transcript,
  normalized,
  language,
  context,
}: {
  transcript: string;
  normalized: string;
  language: VoiceLanguageHint;
  context?: VoiceRouteRequest["context"];
}): VoiceCommand {
  const text = normalizeForMatching(normalized);
  const intentMatch = selectIntent(text);
  const entities = extractEntities(text);

  const base = {
    transcript,
    normalized,
    intent: intentMatch.intent,
    confidence: intentMatch.confidence,
    language,
    matchedTerms: intentMatch.matchedTerms,
    entities,
    context,
  };

  const toolCall = createToolCall(base);

  return {
    transcript,
    normalized,
    intent: intentMatch.intent,
    confidence: intentMatch.confidence,
    language,
    languageLabel: mapLanguageHintToDisplayLabel(language),
    matchedTerms: intentMatch.matchedTerms,
    entities,
    toolCall,
    timeline: createTimeline({
      intent: intentMatch.intent,
      confidence: intentMatch.confidence,
      toolCall,
    }),
  };
}

function inferKpiMode(text: string): "create" | "explain" | "calculate" {
  const normalized = normalizeForMatching(text);

  if (
    /\b(explain|describe|what is|definition|pourquoi|chnowa|شنوة)\b/u.test(
      normalized,
    )
  ) {
    return "explain";
  }

  if (
    /\b(calculate|compute|calcule|count|sum|average|avg|total)\b/u.test(
      normalized,
    )
  ) {
    return "calculate";
  }

  return "create";
}

function inferDisplayHint(
  text: string,
): "dashboard" | "chart" | "table" | "auto" {
  const normalized = normalizeForMatching(text);

  if (/\btable\b|\btableau\b/u.test(normalized)) {
    return "table";
  }

  if (/\bchart\b|\bgraph\b|\bplot\b|رسم/u.test(normalized)) {
    return "chart";
  }

  if (/\bdashboard\b|\bdash\b|\btableau de bord\b|لوحة/u.test(normalized)) {
    return "dashboard";
  }

  return "auto";
}

function inferInvestigationType(
  text: string,
): "root_cause" | "comparison" | "explanation" {
  const normalized = normalizeForMatching(text);

  if (/\bcompare|comparison|vs|versus|comparez|قارن\b/u.test(normalized)) {
    return "comparison";
  }

  if (
    /\bwhy|root cause|cause racine|3lech|alech|علاش|سبب\b/u.test(normalized)
  ) {
    return "root_cause";
  }

  return "explanation";
}

function inferSignalType(
  text: string,
): "anomaly" | "drop" | "spike" | "risk" | "general" {
  const normalized = normalizeForMatching(text);

  if (/\bdrop|decrease|down|هبوط\b/u.test(normalized)) {
    return "drop";
  }

  if (/\bspike|increase|up|ارتفاع\b/u.test(normalized)) {
    return "spike";
  }

  if (/\brisk|warning|danger|خطر\b/u.test(normalized)) {
    return "risk";
  }

  if (/\banomaly|anomalie|outlier|abnormal\b/u.test(normalized)) {
    return "anomaly";
  }

  return "general";
}

function inferBriefAudience(
  text: string,
): "executive" | "technical" | "general" {
  const normalized = normalizeForMatching(text);

  if (/\bexecutive|ceo|dg|director|مدير\b/u.test(normalized)) {
    return "executive";
  }

  if (/\btechnical|developer|engineer|data team|tech\b/u.test(normalized)) {
    return "technical";
  }

  return "general";
}

function inferScenarioMode(
  text: string,
): "what_if" | "forecast" | "impact" | "general" {
  const normalized = normalizeForMatching(text);

  if (/\bwhat if|if|si|ken|kan|لو|إذا\b/u.test(normalized)) {
    return "what_if";
  }

  if (/\bforecast|projection|predict|توقع\b/u.test(normalized)) {
    return "forecast";
  }

  if (/\bimpact|effect|influence|تأثير\b/u.test(normalized)) {
    return "impact";
  }

  return "general";
}

function inferComparisonType(
  text: string,
): "period" | "segment" | "metric" | "general" {
  const normalized = normalizeForMatching(text);

  if (
    /\blast|this|month|week|year|quarter|mois|semaine|année|الشهر|السنة\b/u.test(
      normalized,
    )
  ) {
    return "period";
  }

  if (
    /\bregion|channel|product|category|segment|canal|produit|منطقة|قناة\b/u.test(
      normalized,
    )
  ) {
    return "segment";
  }

  if (
    /\brevenue|profit|sales|conversion|metric|kpi|taux|مؤشر|نسبة\b/u.test(
      normalized,
    )
  ) {
    return "metric";
  }

  return "general";
}

function inferSetupArea(
  text: string,
): "model" | "offline" | "provider" | "voice" | "settings" | "general" {
  const normalized = normalizeForMatching(text);

  if (
    /\bvoice|microphone|mic|tts|stt|speech|صوت|ميكروفون\b/u.test(normalized)
  ) {
    return "voice";
  }

  if (/\bmodel|whisper|llm|kokoro|piper|نموذج\b/u.test(normalized)) {
    return "model";
  }

  if (/\boffline|local|edge\b/u.test(normalized)) {
    return "offline";
  }

  if (/\bprovider|ollama|webllm|transformers\b/u.test(normalized)) {
    return "provider";
  }

  if (
    /\bsettings|config|configuration|parametre|parametres|إعدادات\b/u.test(
      normalized,
    )
  ) {
    return "settings";
  }

  return "general";
}

workerSelf.postMessage({
  type: "ROUTER_READY",
  intents: ALL_INTENTS,
  tools: ALL_TOOLS,
} satisfies VoiceRouteResponse);
