import { electronClient } from "@better-auth/electron/client";
import { storage } from "@better-auth/electron/storage";
import { createAuthClient } from "better-auth/client";
import {
  BETTER_AUTH_BASE_URL,
  ELECTRON_AUTH_CALLBACK_PATH,
  ELECTRON_AUTH_CLIENT_ID,
  ELECTRON_AUTH_PROTOCOL,
  ELECTRON_AUTH_SIGN_IN_URL,
} from "../src/platform/auth/electron-options";

export const authClient = createAuthClient({
  baseURL: BETTER_AUTH_BASE_URL,
  plugins: [
    electronClient({
      callbackPath: ELECTRON_AUTH_CALLBACK_PATH,
      clientID: ELECTRON_AUTH_CLIENT_ID,
      protocol: {
        scheme: ELECTRON_AUTH_PROTOCOL,
      },
      signInURL: ELECTRON_AUTH_SIGN_IN_URL,
      storage: storage(),
    }),
  ],
});
