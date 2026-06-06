import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { AUTH_DB_FILE } from "@/platform/storage/storage-constants";

type AuthDatabaseOptions = {
  appUserData?: string;
  cwd?: string;
};

const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  email_verified integer DEFAULT false NOT NULL,
  image text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user (email);

CREATE TABLE IF NOT EXISTS session (
  id text PRIMARY KEY NOT NULL,
  expires_at integer NOT NULL,
  token text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS session_token_unique ON session (token);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session (user_id);

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY NOT NULL,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at integer,
  refresh_token_expires_at integer,
  scope text,
  password text,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account (user_id);

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY NOT NULL,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at integer NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

CREATE TABLE IF NOT EXISTS app_setting (
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS app_setting_namespace_idx ON app_setting (namespace);
`;

export function getAuthDatabasePath(options: AuthDatabaseOptions = {}) {
  const runtimeDataDir = options.appUserData
    ? path.join(options.appUserData, "data")
    : path.join(options.cwd ?? process.cwd(), ".data");

  return path.join(runtimeDataDir, AUTH_DB_FILE);
}

export function createAuthDatabase(options: AuthDatabaseOptions = {}) {
  const databasePath = getAuthDatabasePath(options);
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(AUTH_SCHEMA_SQL);

  return {
    db: drizzle({ client: sqlite, schema }),
    path: databasePath,
    sqlite,
  };
}

const authDatabase = createAuthDatabase({
  appUserData: process.env.APP_USER_DATA,
});

export const authDb = authDatabase.db;
export const authSqlite = authDatabase.sqlite;
export const authDatabasePath = authDatabase.path;
