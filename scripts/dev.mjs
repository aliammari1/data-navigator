import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const packageManager = process.env.npm_execpath;
if (!packageManager) {
  console.error("Run this script with pnpm dev.");
  process.exit(1);
}

// Next and Electron are separate processes in development. They must sign and
// verify guest invites with the same session secret.
const env = { ...process.env };
if (!env.DATA_NAVIGATOR_HOST_SECRET || env.DATA_NAVIGATOR_HOST_SECRET.length < 32) {
  env.DATA_NAVIGATOR_HOST_SECRET = randomBytes(32).toString("base64url");
}

// Next.js dev compilation plus Electron can briefly pressure the default V8 heap.
// Keep any existing NODE_OPTIONS while ensuring the dev processes have enough
// headroom to compile the collaboration route and complete guest approval.
if (!/--max-old-space-size(?:=|\s)/.test(env.NODE_OPTIONS ?? "")) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=4096"].filter(Boolean).join(" ");
}

function run(args) {
  const result = spawnSync(process.execPath, [packageManager, ...args], {
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const workerStatus = run(["run", "worker:build"]);
if (workerStatus !== 0) process.exit(workerStatus);

process.exit(
  run([
    "exec",
    "concurrently",
    "-k",
    "-n",
    "next,electron",
    "-c",
    "auto",
    "pnpm run next:dev -- --inspect=127.0.0.1:9230",
    "pnpm run electron:dev",
  ]),
);
