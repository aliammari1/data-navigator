export const BETTER_AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const ELECTRON_AUTH_PROTOCOL = "com.data-navigator.app";
export const ELECTRON_AUTH_CALLBACK_PATH = "/auth/callback";
export const ELECTRON_AUTH_CLIENT_ID = "electron";
export const ELECTRON_AUTH_SIGN_IN_URL = `${BETTER_AUTH_BASE_URL}/login`;
