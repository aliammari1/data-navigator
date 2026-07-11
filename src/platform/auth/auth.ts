import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/db/schema";
import { authDb } from "@/platform/auth/auth-database";
import { getBetterAuthBaseUrl } from "@/platform/auth/electron-options";

export const authConfig = {
  appName: "DataNavigator",

  database: drizzleAdapter(authDb, {
    provider: "sqlite",
    schema,
  }),

  secret: process.env.BETTER_AUTH_SECRET ?? "data-navigator-local-dev-secret-change-me",

  baseURL: getBetterAuthBaseUrl(),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },

  plugins: [nextCookies()],
};

export const auth = betterAuth(authConfig);

export type AuthSession = typeof auth.$Infer.Session;
