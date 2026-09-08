/**
 * Main-process authentication persistence and credential verification.
 *
 * Modeled on Signal Desktop and Bitwarden Desktop architecture:
 * 1. Database Exclusivity: Native better-sqlite3 runs strictly in the Electron
 *    MAIN process under Electron's Node runtime. Zero native binary loading in
 *    Next.js or the renderer, preventing ABI version conflicts.
 * 2. Mandatory Authentication: On every application launch, the desktop is
 *    locked until the verified owner enters their password.
 * 3. Cryptographic Storage: Passwords are never stored in plaintext. They are
 *    hashed using scrypt (N=16384, r=8, p=1, 64-byte key) with cryptographically
 *    random 128-bit salts. Verification uses crypto.timingSafeEqual.
 * 4. Audit Trail: Every authentication event (login success, login failure,
 *    signup, logout, password change, app lock) is recorded to audit_log.
 * 5. Pure Node: This module does not import electron directly, keeping it
 *    fully unit-testable in plain Node environments.
 */

import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { openSqliteHandle } from "../src/platform/storage/db-bootstrap";
import { recordAuditLog } from "./settings-store";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SessionValidationResult = {
  user: AuthUser | null;
  session: AuthSession | null;
  isLocked: boolean;
};

const AUTH_DB_NAME = "auth.db";

/**
 * Calculate the next midnight (00:00:00.000) in the user's local timezone.
 * In Data Navigator's security model, every session lives strictly until
 * 00h00 of the user's local day, after which the admin is locked out and must relogin.
 */
export function getNextLocalMidnight(fromDate: Date = new Date()): Date {
  const next = new Date(fromDate);
  next.setHours(24, 0, 0, 0);
  return next;
}

const DEFAULT_AUTH_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
let authMigrationsFolder: string = DEFAULT_AUTH_MIGRATIONS_FOLDER;

/**
 * Override the Drizzle migrations folder for auth.db.
 */
export function setAuthMigrationsFolder(folder: string): void {
  authMigrationsFolder = folder;
}

let baseDir: string | null = null;
let sqliteHandle: Database.Database | null = null;
let drizzleDb: BetterSQLite3Database<typeof schema> | null = null;

// Mandatory lock state: on initial boot, the app is locked until owner authenticates.
let appIsLocked = true;

/**
 * Configure the directory for the auth database.
 * Call from main.ts with app.getPath("userData")/databases.
 */
export function configureAuthStore(databasesDir: string): void {
  baseDir = databasesDir;
}

/**
 * Open or return the cached SQLite connection for authentication.
 */
function getDb(): {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
} {
  if (sqliteHandle && drizzleDb) {
    return { sqlite: sqliteHandle, db: drizzleDb };
  }

  if (!baseDir) {
    throw new Error("auth-store: configureAuthStore() was not called before database access");
  }

  mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, AUTH_DB_NAME);

  const handle = openSqliteHandle({
    path: dbPath,
    schema,
    migrationsFolder: authMigrationsFolder,
  });

  sqliteHandle = handle.sqlite;
  drizzleDb = handle.db;
  return { sqlite: sqliteHandle, db: drizzleDb };
}

/**
 * Hash a password using scrypt with a random 16-byte salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

/**
 * Verify a password against a stored scrypt hash using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split("$");
    if (parts.length === 3 && parts[0] === "scrypt") {
      const salt = parts[1];
      const expectedKey = Buffer.from(parts[2], "hex");
      const actualKey = crypto.scryptSync(password, salt, expectedKey.length, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 32 * 1024 * 1024,
      });
      return crypto.timingSafeEqual(expectedKey, actualKey);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check whether an owner account has already been registered on this device.
 */
export function hasOwner(): boolean {
  const { db } = getDb();
  const countRow = db.select().from(schema.user).limit(1).all();
  return countRow.length > 0;
}

/**
 * Get public profile info of the registered owner/admin.
 * In Data Navigator's single-admin architecture, exactly one user exists on the desktop installation.
 */
export function getOwnerInfo(): { exists: boolean; email?: string; name?: string } {
  const { db } = getDb();
  const userRow = db.select().from(schema.user).limit(1).get();
  if (!userRow) {
    return { exists: false };
  }
  return {
    exists: true,
    email: userRow.email,
    name: userRow.name,
  };
}

/**
 * Check if the application is currently locked.
 */
export function isAppLocked(): boolean {
  return appIsLocked;
}

/**
 * Explicitly lock the desktop application.
 */
export function lockApp(): void {
  appIsLocked = true;
  recordAuditLog({
    action: "auth.lock",
    category: "auth",
    status: "success",
    metadata: { timestamp: Date.now() },
  });
}

/**
 * Register the owner of this local installation.
 * Rejects if an owner is already registered (single-tenant security model).
 */
export function signUp(params: {
  name: string;
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): { user: AuthUser; session: AuthSession } {
  const { db } = getDb();
  const startTime = Date.now();

  const existingUsers = db.select().from(schema.user).limit(1).all();
  if (existingUsers.length > 0) {
    recordAuditLog({
      action: "auth.signup",
      category: "auth",
      status: "rejected",
      durationMs: Date.now() - startTime,
      metadata: { reason: "Owner account already registered", email: params.email },
    });
    throw new Error("An owner account is already registered on this installation.");
  }

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = getNextLocalMidnight(now);
  const hashedPassword = hashPassword(params.password);

  db.insert(schema.user)
    .values({
      id: userId,
      name: params.name.trim() || "Owner",
      email: params.email.trim().toLowerCase(),
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.account)
    .values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(schema.session)
    .values({
      id: sessionId,
      token,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: params.ipAddress ?? "127.0.0.1",
      userAgent: params.userAgent ?? "DataNavigator Desktop",
    })
    .run();

  appIsLocked = false;

  recordAuditLog({
    userId,
    action: "auth.signup",
    category: "auth",
    status: "success",
    durationMs: Date.now() - startTime,
    metadata: { email: params.email },
  });

  return {
    user: {
      id: userId,
      name: params.name,
      email: params.email,
      emailVerified: true,
      image: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    session: {
      id: sessionId,
      token,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ipAddress: params.ipAddress ?? "127.0.0.1",
      userAgent: params.userAgent ?? "DataNavigator Desktop",
    },
  };
}

/**
 * Authenticate the user with email and password.
 */
export function login(params: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): { user: AuthUser; session: AuthSession } {
  const { db } = getDb();
  const startTime = Date.now();
  const emailClean = params.email.trim().toLowerCase();

  const userRow = db.select().from(schema.user).where(eq(schema.user.email, emailClean)).get();

  if (!userRow) {
    recordAuditLog({
      action: "auth.login",
      category: "auth",
      status: "failure",
      durationMs: Date.now() - startTime,
      metadata: { reason: "User not found", email: emailClean },
    });
    throw new Error("Invalid email or password.");
  }

  const accountRow = db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, userRow.id))
    .get();

  if (!accountRow?.password || !verifyPassword(params.password, accountRow.password)) {
    recordAuditLog({
      userId: userRow.id,
      action: "auth.login",
      category: "auth",
      status: "failure",
      durationMs: Date.now() - startTime,
      metadata: { reason: "Password mismatch" },
    });
    throw new Error("Invalid email or password.");
  }

  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = getNextLocalMidnight(now);

  db.insert(schema.session)
    .values({
      id: sessionId,
      token,
      userId: userRow.id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: params.ipAddress ?? "127.0.0.1",
      userAgent: params.userAgent ?? "DataNavigator Desktop",
    })
    .run();

  appIsLocked = false;

  recordAuditLog({
    userId: userRow.id,
    action: "auth.login",
    category: "auth",
    status: "success",
    durationMs: Date.now() - startTime,
  });

  return {
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      emailVerified: Boolean(userRow.emailVerified),
      image: userRow.image,
      createdAt: new Date(userRow.createdAt).toISOString(),
      updatedAt: new Date(userRow.updatedAt).toISOString(),
    },
    session: {
      id: sessionId,
      token,
      userId: userRow.id,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ipAddress: params.ipAddress ?? "127.0.0.1",
      userAgent: params.userAgent ?? "DataNavigator Desktop",
    },
  };
}

/**
 * Validate a session token.
 * If the application is in the locked state, returns session: null.
 */
export function getSession(token?: string | null): SessionValidationResult {
  if (appIsLocked || !token) {
    return { user: null, session: null, isLocked: appIsLocked };
  }

  const { db } = getDb();
  const sessionRow = db.select().from(schema.session).where(eq(schema.session.token, token)).get();

  if (!sessionRow) {
    return { user: null, session: null, isLocked: appIsLocked };
  }

  const expiresTime = new Date(sessionRow.expiresAt).getTime();
  if (expiresTime <= Date.now()) {
    db.delete(schema.session).where(eq(schema.session.id, sessionRow.id)).run();
    lockApp();
    return { user: null, session: null, isLocked: true };
  }

  const userRow = db.select().from(schema.user).where(eq(schema.user.id, sessionRow.userId)).get();

  if (!userRow) {
    return { user: null, session: null, isLocked: appIsLocked };
  }

  return {
    isLocked: false,
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      emailVerified: Boolean(userRow.emailVerified),
      image: userRow.image,
      createdAt: new Date(userRow.createdAt).toISOString(),
      updatedAt: new Date(userRow.updatedAt).toISOString(),
    },
    session: {
      id: sessionRow.id,
      token: sessionRow.token,
      userId: sessionRow.userId,
      expiresAt: new Date(sessionRow.expiresAt).toISOString(),
      createdAt: new Date(sessionRow.createdAt).toISOString(),
      updatedAt: new Date(sessionRow.updatedAt).toISOString(),
      ipAddress: sessionRow.ipAddress,
      userAgent: sessionRow.userAgent,
    },
  };
}

/**
 * Terminate an active session and lock the app.
 */
export function logout(token?: string | null): void {
  if (token) {
    try {
      const { db } = getDb();
      db.delete(schema.session).where(eq(schema.session.token, token)).run();
    } catch {
      // ignore
    }
  }
  lockApp();
}

/**
 * Change the password of the current user.
 */
export function changePassword(params: {
  token: string;
  currentPassword: string;
  newPassword: string;
}): void {
  const { user } = getSession(params.token);
  if (!user) {
    throw new Error("Authentication required to change password.");
  }

  const { db } = getDb();
  const accountRow = db
    .select()
    .from(schema.account)
    .where(eq(schema.account.userId, user.id))
    .get();

  if (!accountRow?.password || !verifyPassword(params.currentPassword, accountRow.password)) {
    recordAuditLog({
      userId: user.id,
      action: "auth.change_password",
      category: "auth",
      status: "failure",
      metadata: { reason: "Current password incorrect" },
    });
    throw new Error("Current password is not correct.");
  }

  const newHash = hashPassword(params.newPassword);
  db.update(schema.account)
    .set({ password: newHash, updatedAt: new Date() })
    .where(eq(schema.account.id, accountRow.id))
    .run();

  recordAuditLog({
    userId: user.id,
    action: "auth.change_password",
    category: "auth",
    status: "success",
  });
}

/**
 * Close the auth database handle.
 */
export function closeAuthStore(): void {
  if (sqliteHandle) {
    try {
      sqliteHandle.close();
    } catch {
      // best-effort shutdown
    }
    sqliteHandle = null;
    drizzleDb = null;
  }
}
