import "server-only";

import Database from "better-sqlite3";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { AUTH_DB_FILE } from "@/platform/storage/storage-constants";

const dataDir = path.join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, AUTH_DB_FILE));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const authConfig = {
  appName: "DataNavigator",
  database: sqlite,
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "data-navigator-local-dev-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const authReady = getMigrations(authConfig)
  .then(({ runMigrations }) => runMigrations())
  .catch((error) => {
    console.error("[auth] Failed to run Better Auth migrations", error);
    throw error;
  });

export const auth = betterAuth(authConfig);

export type AuthSession = typeof auth.$Infer.Session;
