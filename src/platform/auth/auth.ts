import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";

const dataDir = path.join(process.cwd(), ".data");
mkdirSync(dataDir, { recursive: true });

const pgliteDir = path.join(dataDir, "better-auth-pglite");

const db = new Kysely({
  dialect: new PGliteDialect(new PGlite(pgliteDir)),
});

export const authConfig = {
  appName: "DataNavigator",

  database: {
    db,
    type: "postgres",
    transaction: true,
  },

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

export const auth = betterAuth(authConfig);

export type AuthSession = typeof auth.$Infer.Session;
