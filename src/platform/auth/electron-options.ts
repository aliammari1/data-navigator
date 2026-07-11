const DEFAULT_BETTER_AUTH_BASE_URL = "http://localhost:3000";

function isElectronRenderer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("Electron")
  );
}

export function getBetterAuthBaseUrl(): string {
  if (isElectronRenderer()) {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.BETTER_AUTH_URL ??
    DEFAULT_BETTER_AUTH_BASE_URL
  );
}

export const ELECTRON_AUTH_PROTOCOL = "com.data-navigator.app";
export const ELECTRON_AUTH_CALLBACK_PATH = "/auth/callback";
export const ELECTRON_AUTH_CLIENT_ID = "electron";

export function getElectronAuthSignInUrl(baseUrl: string = getBetterAuthBaseUrl()): string {
  return `${baseUrl}/login`;
}
