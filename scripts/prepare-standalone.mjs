import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const standaloneDir = path.join(root, ".next", "standalone");
const publicDir = path.join(root, "public");
const staticDir = path.join(root, ".next", "static");

if (!fs.existsSync(standaloneDir)) {
  throw new Error("Missing .next/standalone. Make sure next.config.js has output: 'standalone'.");
}

if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, "public"), {
    recursive: true,
    force: true,
  });
}

if (fs.existsSync(staticDir)) {
  const standaloneNextDir = path.join(standaloneDir, ".next");
  fs.mkdirSync(standaloneNextDir, { recursive: true });

  fs.cpSync(staticDir, path.join(standaloneNextDir, "static"), {
    recursive: true,
    force: true,
  });
}

console.log("Prepared Next standalone assets for Electron packaging.");
