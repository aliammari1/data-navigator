# Moudir + Formulator v2 — approved plan (2026-07-05)

User mandate: better UX in both screens, better local technical design, more
features, mid-2026 visual quality; new libraries allowed; features may go
system-wide. Research run: workflow `wf_367b9c16-87b` (runtime / chat-UX /
BI-UX). Hard constraints unchanged: fully offline, node-llama-cpp only,
shadcn tokens + Poppins + Electric Blue, French-first, no loading theater.

## Research verdicts that shaped the plan

- node-llama-cpp is already at 3.19.0 — every needed feature ships today.
- `LlamaChatSession` held per-conversation in the Electron main process is the
  intended pattern (KV kept across turns; `get/setChatHistory` snapshots;
  automatic `contextShift`; checkpoints for SWA models like Gemma). SAFE-BET.
- Function calling (`defineChatSessionFunction`) is generation-level enforced,
  BUT `grammar` and `functions` are mutually exclusive per `prompt()` call.
  Consequence: Moudir chat = prose + tools (no grammar needed); grammar stays
  for Formulator/derive/title/insight side-calls. Small-model reliability
  tricks: all params required + described, human-readable error returns,
  `documentFunctionParams`, tools restated in system prompt. NEEDS-PROTOTYPE
  on Gemma/Granite (generic wrapper); Qwen-class has first-party support.
- Streaming works UNDER grammar (`onTextChunk`); `preloadPrompt` gives
  near-instant first tokens; `responsePrefix` steers small models; parallel
  sequences allow one loaded model to serve chat + side-calls.
- Speculative decoding: NOT viable at 1.5B targets; revisit
  `InputLookupTokenPredictor` (no draft model, near-free) for SQL-echo shapes.
- UI adoption: streamdown 2.5 (already a dep) + `@streamdown/code` (Shiki
  local); shadcn June-2026 chat components (MessageScroller/Message/Bubble/
  Marker + shimmer) vendored via CLI; selected Vercel AI Elements vendored as
  source (Tool, Reasoning, Suggestion, PromptInput). Chat STATE stays a thin
  zustand store over our IPC (assistant-ui's LocalRuntime could wrap it, but a
  runtime abstraction over our custom tool loop buys little — BUILD).
- Formulator libs: react-resizable-panels v4 (pin v4; regenerate the shadcn
  wrapper — v4 renamed exports) + zundo v2.3 (temporal INSIDE persist, with
  partialize/limit/group). Everything else is ECharts/DuckDB/Electron native.
- Microsoft DF's own 2025-26 evolution validates and feeds the backlog: data
  anchoring, recommendation agent (we do it rule-based), report generation
  (defer), thread-memory conversational agent (= our Phase A).

## Phase A — Local AI runtime v2

A1 DONE (2026-07-05): conversation persistence — `electron/chat-store.ts`
(chat.db: moudir_conversation + moudir_message, prune at 200 unpinned,
search), IPC `chatHistory:*` with zod validation, preload
`electronChatHistory`, renderer client `src/platform/chat/chat-history-client.ts`.

A2: chat session runtime in `electron/llama-service.ts`:
- Session registry: conversationId → LlamaChatSession (+ its context), LRU cap
  (2 live sessions on medium PCs), dispose path, `setChatHistory` rehydration
  from chat.db rows, `getChatHistory` snapshot back on save.
- IPC: `chat:open/prompt/preload/abort/history/dispose`; token streaming via
  `webContents.send("chat:token")`; tool events via `"chat:tool"`.
- Tools (defineChatSessionFunction, all params required + described):
  `run_sql` (read-only guard reuse, row/char caps), `get_schema`,
  `profile_column` (SUMMARIZE), `make_chart` (enum-constrained spec → renderer
  artifact event). Human-readable tool errors fed back to the model.
- Auto-title + suggested follow-ups: separate tiny grammar-constrained calls.

## Phase B — Moudir chat experience

Vendored shadcn chat components + AI Elements source, restyled to Moudir
(warm, م). Message thread (MessageScroller) + streamdown rendering + tool
chips ("Requête SQL → 12 lignes" expandable) + inline chart/table artifacts
(OffscreenChart reuse) + honest shimmer status line. Conversation sidebar
(pinned/search/auto-titles from chat.db), message actions (copy / regenerate /
edit-and-fork / branch-to-new-chat), composer with @-mentions of
datasets/columns (cmdk), send-morphs-to-stop, suggested follow-up chips,
voice kept. State: new zustand chat store over the A1/A2 clients.

## Phase C — Formulator UX

Priority order (research impact/effort): column-stats popovers (SUMMARIZE +
mini histogram, Rill-style) → filter pills UI for FilterDef (+ editor popover,
Clear all) → PNG/CSV export + clipboard (getDataURL + Electron clipboard) →
undo/redo (zundo temporal, partialize rows out, group drags) → cross-filter
(chart click → FilterDef pill) → brush-to-filter (brushEnd → range filter) →
derive verification card (sample in→out pairs + code + one-line explanation +
"looks right" accept — the honest DF1) → resizable panes (Group/Panel/
Separator v4) → rule-based reco strip (2-3 alt encodings as mini previews) →
data anchoring (scope thread to a CTE subset). Report generation: deferred.

## Phase D — System-wide dividends

`@/components/ui/resizable` (v4-correct), `@/platform/viz/export` (PNG/CSV/
clipboard helpers), column-stats popover as shared component, streamdown as
the app-wide markdown renderer (ai-briefing, telecom AI panels), zundo pattern
documented for other stores.

## Build order

A2 (agent, single-owner on llama-service/preload/validation) → B fleet
(vendoring + sidebar + thread + composer, disjoint files, then screen
assembly) → C fleet (each feature = one agent, store seams by me) → D
extraction. Verification per wave: biome + scoped tsc + vitest + a manual
smoke on the real GGUF.
