import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-provenance.mjs", import.meta.url));
const names = ["data.msi", "data.exe", "data.AppImage", "data.deb"];
const context = {
  GITHUB_REPOSITORY: "owner/repo",
  GITHUB_RUN_ID: "12345",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SHA: "a".repeat(40),
  RELEASE_TAG: "v1.0.8",
};

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "release-provenance-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of names) writeFileSync(join(dir, name), name);
  return { dir, manifest: join(dir, "release-provenance.json") };
}

function run(mode, { dir, manifest }, env = context) {
  return spawnSync(process.execPath, [script, mode, dir, manifest], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("create records exact binary digests and workflow identity; verify accepts them", (t) => {
  const paths = fixture(t);
  assert.equal(run("create", paths).status, 0);
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  assert.equal(manifest.tag, "v1.0.8");
  assert.equal(manifest.sourceCommit, "a".repeat(40));
  assert.equal(manifest.repository, "owner/repo");
  assert.equal(manifest.runId, "12345");
  assert.equal(manifest.runAttempt, "2");
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.name).sort(), [...names].sort());
  const msi = manifest.artifacts.find((artifact) => artifact.name === "data.msi");
  assert.equal(msi.size, 8);
  assert.equal(msi.sha256, createHash("sha256").update("data.msi").digest("hex"));
  assert.equal(run("verify", paths).status, 0);
});

test("verify rejects modified binary and extra binary", (t) => {
  const paths = fixture(t);
  assert.equal(run("create", paths).status, 0);
  writeFileSync(join(paths.dir, "data.msi"), "tampered");
  assert.notEqual(run("verify", paths).status, 0);
  writeFileSync(join(paths.dir, "data.msi"), "data.msi");
  writeFileSync(join(paths.dir, "extra.exe"), "extra");
  assert.notEqual(run("verify", paths).status, 0);
});

test("verify rejects mismatched release context and malformed manifest", (t) => {
  const paths = fixture(t);
  assert.equal(run("create", paths).status, 0);
  assert.notEqual(run("verify", paths, { ...context, RELEASE_TAG: "v1.0.9" }).status, 0);
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  manifest.artifacts[0].name = "../data.msi";
  writeFileSync(paths.manifest, JSON.stringify(manifest));
  assert.notEqual(run("verify", paths).status, 0);
});

test("create rejects missing binary and missing workflow identity", (t) => {
  const paths = fixture(t);
  rmSync(join(paths.dir, "data.deb"));
  assert.notEqual(run("create", paths).status, 0);
  writeFileSync(join(paths.dir, "data.deb"), "data.deb");
  assert.notEqual(run("create", paths, { ...context, GITHUB_SHA: "" }).status, 0);
});
