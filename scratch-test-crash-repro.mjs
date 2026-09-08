/**
 * Crash reproduction: loads granite-4.1-3b inside Electron main process,
 * creates a context + chat session with tool definitions, then sends a prompt.
 *
 * Run: npx electron scratch/test-crash-repro.mjs
 */
import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_FILE = "granite-4.1-3b-instruct-q4_k_m.gguf";
const MODEL_DIR = path.join(app.getPath("userData"), "models", "llm");
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);

const CONTEXT_SIZE = 4096;

app.whenReady().then(async () => {
  console.log("[repro] Electron ready, pid:", process.pid);
  console.log("[repro] Model path:", MODEL_PATH);

  try {
    const {
      getLlama,
      LlamaChatSession,
      defineChatSessionFunction,
    } = await import("node-llama-cpp");

    console.log("[repro] node-llama-cpp imported OK");

    // Match the app's default: CPU-only
    const llama = await getLlama({ gpu: false });
    console.log("[repro] Llama instance created (CPU-only)");

    const model = await llama.loadModel({ modelPath: MODEL_PATH });
    console.log("[repro] Model loaded:", MODEL_FILE);

    const context = await model.createContext({ contextSize: CONTEXT_SIZE });
    console.log("[repro] Context created, size:", CONTEXT_SIZE);

    const sequence = context.getSequence();
    console.log("[repro] Sequence created");

    // Define tools matching what chat-session-service.ts does
    const functions = {
      run_sql: defineChatSessionFunction({
        description: "Execute a read-only SQL query",
        params: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "The SQL query to execute",
            },
          },
        },
        handler: async (params) => {
          console.log("[repro] run_sql called:", params.sql);
          return "name | age\nAlice | 30\nBob | 25";
        },
      }),
      get_schema: defineChatSessionFunction({
        description: "List available datasets and their columns",
        params: { type: "object", properties: {} },
        handler: async () => {
          console.log("[repro] get_schema called");
          return "users (3 rows): name TEXT, age INTEGER";
        },
      }),
      profile_column: defineChatSessionFunction({
        description: "Profile a column: min, max, distinct, nulls",
        params: {
          type: "object",
          properties: {
            table: { type: "string", description: "Table name" },
            column: { type: "string", description: "Column name" },
          },
        },
        handler: async (params) => {
          console.log("[repro] profile_column called:", params);
          return "name (users): min=Alice, max=Bob, distincts=3, nulls=0, total=3";
        },
      }),
      make_chart: defineChatSessionFunction({
        description: "Prepare a chart for the user",
        params: {
          type: "object",
          properties: {
            chart_type: {
              enum: ["bar", "line", "area", "pie", "scatter", "heatmap"],
              description: "Chart type",
            },
            x: { type: "string", description: "X axis column" },
            y: { type: "string", description: "Y axis column" },
            aggregate: {
              enum: ["none", "count", "sum", "avg", "min", "max"],
              description: "Aggregation",
            },
            title: { type: "string", description: "Chart title" },
          },
        },
        handler: async (params) => {
          console.log("[repro] make_chart called:", params);
          return `Chart prepared: ${params.title}`;
        },
      }),
    };

    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt:
        "Tu es Moudir, un assistant d'analyse de données. Tu peux utiliser les outils disponibles.",
      autoDisposeSequence: false,
    });
    console.log("[repro] Chat session created");

    console.log("[repro] Sending prompt...");
    const result = await session.prompt("Bonjour, qu'est-ce que tu sais faire ?", {
      functions,
      documentFunctionParams: true,
      maxTokens: 512,
      onTextChunk: (chunk) => process.stdout.write(chunk),
    });

    console.log("\n[repro] Response complete:", result.slice(0, 200));
    console.log("[repro] SUCCESS - no crash");

    await context.dispose();
    await model.dispose();
    app.quit();
  } catch (error) {
    console.error("[repro] CAUGHT ERROR:", error);
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  console.error("[repro] UNCAUGHT EXCEPTION:", error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  console.error("[repro] UNHANDLED REJECTION:", reason);
  app.quit();
});
