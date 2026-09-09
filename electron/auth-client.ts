import type { ElectronClientOptions, ExposedBridges } from "@better-auth/electron/client";
import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { type BetterAuthClientPlugin, createAuthClient } from "better-auth/client";
import {
  BETTER_AUTH_BASE_URL,
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CLIENT_ID,
  ELECTRON_AUTH_PROTOCOL,
  ELECTRON_AUTH_SIGN_IN_URL,
} from "../src/platform/auth/electron-options";

// better-auth's inlined BetterFetchOption types are not
// exactOptionalPropertyTypes-clean (mode?: RequestMode | undefined vs
// mode?: RequestMode). Upstream: better-auth#9212 / #1578. The plugin object
// is opaque to us, so adapt once at this boundary instead of suppressing a
// config-dependent @ts-expect-error at the use site.
// The renderer Window bridges exposed by @better-auth/electron's
// exposeBridges (getUser/requestAuth/signOut/authenticate). Derived from the
// installed version's own ExposedBridges type — preload's `declare global`
// Window augmentation builds on this (see electron/preload.ts).
export type ElectronAuthBridges = ExposedBridges<ElectronClientOptions>;

const electronPlugin = electronClient({
  callbackPath: ELECTRON_AUTH_CALLBACK_PATH,
  clientID: ELECTRON_AUTH_CLIENT_ID,
  protocol: { scheme: ELECTRON_AUTH_PROTOCOL },
  signInURL: ELECTRON_AUTH_SIGN_IN_URL,
  storage: storage(),
  userImageProxy: { enabled: false },
  // Intersect (don't erase): keeps the electron plugin's inferred $Infer
  // augmentation for preload's AuthBridges while satisfying the constraint.
}) as ReturnType<typeof electronClient> & BetterAuthClientPlugin;

export const authClient = createAuthClient({
  baseURL: BETTER_AUTH_BASE_URL,
  plugins: [electronPlugin],
});
