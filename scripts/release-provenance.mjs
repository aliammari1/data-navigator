#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const extensions = [".AppImage", ".deb", ".exe", ".msi"];
const artifactKeys = ["name", "sha256", "size"];
const manifestKeys = [
  "artifacts",
  "repository",
  "runAttempt",
  "runId",
  "schemaVersion",
  "sourceCommit",
  "tag",
];

function requireContext(env) {
  const context = {
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    sourceCommit: env.GITHUB_SHA,
    tag: env.RELEASE_TAG,
  };
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(context.repository ?? "") ||
    !/^\d+$/.test(context.runId ?? "") ||
    !/^\d+$/.test(context.runAttempt ?? "") ||
    !/^[a-f0-9]{40}$/.test(context.sourceCommit ?? "") ||
    !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(context.tag ?? "")
  ) {
    throw new Error("Invalid or missing release workflow context");
  }
  return context;
}

function sameKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}

async function binaryNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter((entry) =>
    extensions.some((extension) => entry.name.endsWith(extension)),
  );
  if (
    names.length !== extensions.length ||
    extensions.some(
      (extension) => names.filter((entry) => entry.name.endsWith(extension)).length !== 1,
    ) ||
    names.some((entry) => !entry.isFile())
  ) {
    throw new Error(
      "Expected exactly one regular release binary for each of .AppImage, .deb, .exe, and .msi",
    );
  }
  return names.map((entry) => entry.name).sort();
}

async function describe(directory, name) {
  const path = join(directory, name);
  const stat = await lstat(path);
  if (!stat.isFile()) throw new Error(`Release binary is not a regular file: ${name}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { name, sha256: hash.digest("hex"), size: stat.size };
}

async function create(directory, manifestPath, context) {
  const names = await binaryNames(directory);
  const artifacts = await Promise.all(names.map((name) => describe(directory, name)));
  const manifest = { schemaVersion: 1, ...context, artifacts };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
}

async function verify(directory, manifestPath, context) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !sameKeys(manifest, manifestKeys) ||
    manifest.schemaVersion !== 1 ||
    Object.entries(context).some(([key, value]) => manifest[key] !== value) ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== extensions.length
  ) {
    throw new Error("Invalid release manifest or workflow context mismatch");
  }
  const names = await binaryNames(directory);
  const manifestNames = manifest.artifacts.map((artifact) => artifact?.name);
  if (
    manifest.artifacts.some(
      (artifact) =>
        !sameKeys(artifact, artifactKeys) ||
        typeof artifact.name !== "string" ||
        artifact.name !== basename(artifact.name) ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        !Number.isSafeInteger(artifact.size) ||
        artifact.size < 0,
    ) ||
    names.join("\0") !== manifestNames.slice().sort().join("\0")
  ) {
    throw new Error("Release manifest does not describe the exact four binaries");
  }
  for (const artifact of manifest.artifacts) {
    const actual = await describe(directory, artifact.name);
    if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size) {
      throw new Error(`Release binary differs from signed manifest: ${artifact.name}`);
    }
  }
}

const [mode, directory, manifestPath] = process.argv.slice(2);
if (
  !["create", "verify"].includes(mode) ||
  !directory ||
  !manifestPath ||
  process.argv.length !== 5
) {
  console.error(
    "Usage: node scripts/release-provenance.mjs <create|verify> <binary-directory> <manifest-path>",
  );
  process.exitCode = 2;
} else {
  try {
    const context = requireContext(process.env);
    await (mode === "create"
      ? create(directory, manifestPath, context)
      : verify(directory, manifestPath, context));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
