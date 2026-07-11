import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";
import {
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CLIENT_ID,
  ELECTRON_AUTH_PROTOCOL,
  getBetterAuthBaseUrl,
  getElectronAuthSignInUrl,
} from "../src/platform/auth/electron-options";

export function createElectronAuthClient() {
  const baseUrl = getBetterAuthBaseUrl();

  return createAuthClient({
    baseURL: baseUrl,
    plugins: [
      electronClient({
        callbackPath: ELECTRON_AUTH_CALLBACK_PATH,
        clientID: ELECTRON_AUTH_CLIENT_ID,
        protocol: {
          scheme: ELECTRON_AUTH_PROTOCOL,
        },
        signInURL: getElectronAuthSignInUrl(baseUrl),
        storage: storage(),
        // Offline/defense-in-depth: never register the bypassCSP "user-image://"
        // proxy that net.fetches a remote avatar URL from the main process. Auth is
        // local email/password (no remote avatars), so this only closes a latent,
        // un-CSP'd egress surface.
        userImageProxy: { enabled: false },
      }),
    ],
  });
}

export type ElectronAuthClient = ReturnType<typeof createElectronAuthClient>;
