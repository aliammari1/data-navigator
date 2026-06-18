// Screenshot the running app for visual UI iteration.
//
// Usage:
//   node scripts/shot.mjs [route] [outfile]
//   node scripts/shot.mjs /dashboard screenshots/home.png
//   node scripts/shot.mjs current screenshots/current.png   # whatever is on screen
//
// Strategy: prefer the REAL Electron app via CDP (port 9222, enabled by
// `pnpm dev` → `electron --remote-debugging-port=9222`) so DuckDB/IPC data is
// live. Falls back to headless Chromium against the Next dev server (layout
// only — report data needs Electron IPC).
import { chromium } from "playwright";

const route = process.argv[2] ?? "/dashboard";
const out = process.argv[3] ?? "screenshots/shot.png";
const CDP = "http://localhost:9222";
const NEXT = "http://localhost:3000";

async function viaCDP() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("no CDP context");
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  if (route !== "current" && route.startsWith("/")) {
    const url = new URL(route, page.url() || NEXT).toString();
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  await browser.close(); // CDP: disconnects only, does not close the app
  return "electron-cdp";
}

async function viaNext() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(NEXT + (route === "current" ? "/dashboard" : route), {
    waitUntil: "networkidle",
    timeout: 20000,
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  return "next-headless";
}

try {
  const mode = await viaCDP().catch(async (e) => {
    console.error("[shot] CDP failed (", e.message, ") — falling back to Next dev");
    return viaNext();
  });
  console.log(`[shot] saved ${out} via ${mode}`);
} catch (e) {
  console.error("[shot] failed:", e.message);
  console.error("[shot] Is the app running? Start it with: pnpm dev");
  process.exit(1);
}
