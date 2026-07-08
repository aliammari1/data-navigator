/**
 * Local user management — admin / simple user roles.
 * Stored in localStorage. Bootstraps a default admin on first use.
 */

export type UserRole = "admin" | "user";

export interface TelecomUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  createdAt: number;
  lastLoginAt: number;
  active: boolean;
}

const USERS_KEY = "telecom-users-v1";
const CURRENT_KEY = "telecom-current-user-v1";

function uid(): string {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readUsers(): TelecomUser[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TelecomUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: TelecomUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {}
}

export function ensureBootstrapUser(): TelecomUser {
  const users = readUsers();
  if (users.length === 0) {
    const admin: TelecomUser = {
      id: uid(),
      username: "admin",
      fullName: "Administrateur",
      role: "admin",
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      active: true,
    };
    writeUsers([admin]);
    setCurrentUser(admin.id);
    return admin;
  }
  const cur = getCurrentUser();
  return cur ?? users[0];
}

export function listUsers(): TelecomUser[] {
  return readUsers().sort((a, b) => a.createdAt - b.createdAt);
}

export function createUser(input: {
  username: string;
  fullName: string;
  role: UserRole;
}): TelecomUser {
  const users = readUsers();
  if (users.some((u) => u.username === input.username)) {
    throw new Error("Nom d'utilisateur déjà utilisé");
  }
  const u: TelecomUser = {
    id: uid(),
    username: input.username,
    fullName: input.fullName || input.username,
    role: input.role,
    createdAt: Date.now(),
    lastLoginAt: 0,
    active: true,
  };
  writeUsers([...users, u]);
  return u;
}

export function updateUser(
  id: string,
  patch: Partial<Pick<TelecomUser, "fullName" | "role" | "active">>,
): void {
  writeUsers(readUsers().map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

export function removeUser(id: string): void {
  writeUsers(readUsers().filter((u) => u.id !== id));
  if (getCurrentUserId() === id) setCurrentUser(null);
}

export function getCurrentUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(CURRENT_KEY);
}

export function getCurrentUser(): TelecomUser | null {
  const id = getCurrentUserId();
  if (!id) return null;
  return readUsers().find((u) => u.id === id) ?? null;
}

export function setCurrentUser(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (id === null) localStorage.removeItem(CURRENT_KEY);
  else {
    localStorage.setItem(CURRENT_KEY, id);
    writeUsers(readUsers().map((u) => (u.id === id ? { ...u, lastLoginAt: Date.now() } : u)));
  }
}
