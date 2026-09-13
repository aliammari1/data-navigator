import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const certsDir = path.join(rootDir, "certs");

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const pfxPath = path.join(certsDir, "windows-code-signing.pfx");
const certPassword = process.env.WINDOWS_CERTIFICATE_PASSWORD || "DataNavigatorLocal2026!";

// 1. Generate Windows code signing certificate if not present
if (!fs.existsSync(pfxPath)) {
  console.log("[certs] Generating local Windows code signing certificate...");
  const keyPath = path.join(certsDir, "codesign.key");
  const crtPath = path.join(certsDir, "codesign.crt");

  try {
    execSync(
      `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${crtPath}" -days 730 -nodes -subj "/CN=Data Navigator Local Signing/O=Data Navigator" -addext "extendedKeyUsage = codeSigning"`,
      { stdio: "inherit" },
    );
    execSync(
      `openssl pkcs12 -export -out "${pfxPath}" -inkey "${keyPath}" -in "${crtPath}" -passout pass:"${certPassword}"`,
      { stdio: "inherit" },
    );
    // Remove individual key and crt files for hygiene
    if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
    if (fs.existsSync(crtPath)) fs.unlinkSync(crtPath);
    console.log(`[certs] Created Windows code signing certificate at ${pfxPath}`);
  } catch (err) {
    console.error("[certs] Failed to generate Windows code signing certificate:", err);
  }
} else {
  console.log(`[certs] Windows certificate already exists at ${pfxPath}`);
}

// 2. Ensure Linux GPG key exists
console.log("[certs] Checking GPG signing key for Linux...");
try {
  const gpgOutput = execSync("gpg --list-secret-keys --with-colons", { encoding: "utf8" });
  if (!gpgOutput.includes("Ali Ammari") && !gpgOutput.includes("Data Navigator")) {
    console.log("[certs] Generating local GPG key...");
    execSync(
      'gpg --batch --passphrase "" --quick-generate-key "Ali Ammari <ammari.ali.0001@gmail.com>" default default never',
      { stdio: "inherit" },
    );
  } else {
    console.log("[certs] Local GPG key is present.");
  }
} catch (err) {
  console.warn("[certs] GPG check/generation skipped or failed:", err.message);
}

console.log("[certs] Local security certificates ready.");
