import { rmSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

const WEB_E2E_PROFILE = path.resolve(process.cwd(), ".e2e-web-profile");
const AUTH_STATE_PATH = path.resolve(process.cwd(), ".playwright", "auth.json");

/**
 * Browser E2E must start from a deterministic first-run auth state.
 *
 * The application auth DB is opened lazily by the Next server, so deleting the
 * dedicated profile here happens before the first auth request. Keeping browser
 * E2E out of the generic .data/ directory also prevents Storybook/dev artifacts
 * or a previous local run from putting OsLogin into "lock" mode unexpectedly.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  rmSync(WEB_E2E_PROFILE, { recursive: true, force: true });
  rmSync(AUTH_STATE_PATH, { force: true });
}
