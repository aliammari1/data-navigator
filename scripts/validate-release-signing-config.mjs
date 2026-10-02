import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const loadTs = require("jiti")(fileURLToPath(import.meta.url));
const requireFromBuilder = createRequire(require.resolve("electron-builder"));
const { validateConfiguration } = requireFromBuilder("app-builder-lib/out/util/config/config");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-navigator-signing-config-"));
const certificateFile = path.join(tempDir, "test.pfx");

try {
  // The certificate is not read by schema validation. Its presence selects the
  // same configuration branch used by a signed release build.
  fs.writeFileSync(certificateFile, "");
  process.env.WINDOWS_CERTIFICATE_FILE = certificateFile;
  process.env.WINDOWS_CERTIFICATE_PASSWORD = "test-password";
  process.env.IS_RELEASE = "true";

  const config = loadTs(path.join(root, "electron-builder.config.ts")).createConfiguration();
  if (
    config.win?.forceCodeSigning !== true ||
    config.win?.signtoolOptions?.certificateFile !== certificateFile
  ) {
    throw new Error("The Windows release signing configuration was not selected.");
  }
  await validateConfiguration(config, { isEnabled: false });
  console.log("Windows release signing configuration matches electron-builder's schema.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
