# Debugging in Zed

Run `pnpm run dev` in a terminal. Once the app opens, run **debugger: start**
from Zed's command palette (F4) and select an attach profile. Start all three
profiles to debug across the renderer, Next.js server, and Electron main process.

| Profile | Port | Breakpoints belong in |
| --- | --- | --- |
| Electron main | 9231 | `electron/main.ts`, `electron/ipc-validation.ts`, `electron/chat-session-service.ts`, `electron/llama-service.ts` |
| Next.js server | 9230 | Server components, route handlers, server actions, `src/proxy.ts` |
| Electron renderer | 9222 | React components, `src/features/data-formulator/store/moudir-chat-store.ts`, `src/platform/chat/chat-session-client.ts` |

Click the gutter beside a line to add a breakpoint, then trigger the action in
the app. A breakpoint in a route or component can remain unbound until Next.js
compiles and loads that route. Attach the profiles before reproducing the bug.

The Electron watch build emits source maps so breakpoints bind to TypeScript
instead of the bundled `build/main.js`. A normal production build omits these
maps. Next.js development already emits source maps; the profiles map Turbopack
paths back to the workspace. Each runtime has its own debugger connection.

For a chat turn, useful breakpoint locations are:

1. The call to `sendChatPrompt` in `moudir-chat-store.ts` (renderer): inspect the
   final prompt text and `datasetId`.
2. The `chat:prompt` IPC handler in `electron/main.ts` (main): compare the
   validated input with the renderer's input.
3. The call to `entry.session.prompt` in `chat-session-service.ts` (main): inspect
   the actual text, tools, model, and native context.
4. `onTextChunk` in the same file (main): inspect text before IPC streaming.

Electron main edits rebuild automatically, but the running main process does
not hot reload. Restart `pnpm run dev` after editing `electron/*.ts`, then attach
again. Renderer and Next.js changes use their existing development reload.

If attaching fails, check the terminal for the inspector URLs and make sure
another app is not occupying ports 9222, 9230, or 9231. Avoid setting a global
`NODE_OPTIONS=--inspect`: the pnpm launcher, watchers, and server processes would
inherit it and compete for the same inspector port.

Official references: [Zed JavaScript debugging](https://zed.dev/docs/languages/javascript#debugging),
[Electron main-process debugging](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process),
[Next.js debugging](https://nextjs.org/docs/app/guides/debugging).
