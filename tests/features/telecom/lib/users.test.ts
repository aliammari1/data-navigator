import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for local user management (users.ts).
 *
 * All data is stored in localStorage — jsdom provides it out of the box.
 * We clear it between each test so tests remain isolated.
 *
 * No external I/O is used by this module, so no mocks beyond jsdom are needed.
 */

// Import AFTER any potential mocks (none required here).
import {
  createUser,
  ensureBootstrapUser,
  getCurrentUser,
  getCurrentUserId,
  listUsers,
  removeUser,
  setCurrentUser,
  type TelecomUser,
  type UserRole,
  updateUser,
} from "@/features/telecom/lib/users";

// ── helpers ────────────────────────────────────────────────────────────────

/** Clear all telecom-user keys from localStorage before each test. */
function clearStorage(): void {
  window.localStorage.clear();
}

/** Seed a user array directly into localStorage (bypassing the public API). */
function seedUsers(users: TelecomUser[]): void {
  window.localStorage.setItem("telecom-users-v1", JSON.stringify(users));
}

/** Seed the current user pointer directly into localStorage. */
function seedCurrentUserId(id: string | null): void {
  if (id === null) {
    window.localStorage.removeItem("telecom-current-user-v1");
  } else {
    window.localStorage.setItem("telecom-current-user-v1", id);
  }
}

/** Build a minimal valid TelecomUser for seeding. */
function makeUser(overrides: Partial<TelecomUser> = {}): TelecomUser {
  return {
    id: `usr_test_${Math.random().toString(36).slice(2)}`,
    username: "testuser",
    fullName: "Test User",
    role: "user" as UserRole,
    createdAt: Date.now(),
    lastLoginAt: 0,
    active: true,
    ...overrides,
  };
}

// ── setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  clearStorage();
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── ensureBootstrapUser ────────────────────────────────────────────────────

describe("ensureBootstrapUser", () => {
  it("creates a default admin user when localStorage is empty", () => {
    // Arrange: empty storage (done in beforeEach)
    // Act
    const user = ensureBootstrapUser();
    // Assert
    expect(user.username).toBe("admin");
    expect(user.role).toBe("admin");
    expect(user.active).toBe(true);
  });

  it("persists the admin user to localStorage after bootstrapping", () => {
    // Act
    ensureBootstrapUser();
    // Assert: at least one user stored
    const raw = window.localStorage.getItem("telecom-users-v1");
    expect(raw).not.toBeNull();
    const stored: TelecomUser[] = JSON.parse(raw as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].username).toBe("admin");
  });

  it("sets the current user to the new admin after bootstrapping", () => {
    // Act
    const user = ensureBootstrapUser();
    // Assert
    expect(getCurrentUserId()).toBe(user.id);
  });

  it("returns the admin user with a non-empty id after bootstrapping", () => {
    // Act
    const user = ensureBootstrapUser();
    // Assert
    expect(user.id).toMatch(/^usr_/);
  });

  it("returns the current user when users already exist and one is logged in", () => {
    // Arrange: seed an existing admin and mark them current
    const existing = makeUser({ username: "alice", role: "admin" });
    seedUsers([existing]);
    seedCurrentUserId(existing.id);
    // Act
    const result = ensureBootstrapUser();
    // Assert: returns the already-current user (not a new one)
    expect(result.id).toBe(existing.id);
    expect(result.username).toBe("alice");
  });

  it("returns the first user when users exist but no current user is set", () => {
    // Arrange
    const first = makeUser({ username: "first", createdAt: 100 });
    const second = makeUser({ username: "second", createdAt: 200 });
    seedUsers([first, second]);
    seedCurrentUserId(null);
    // Act
    const result = ensureBootstrapUser();
    // Assert: falls back to first element in the array (not sorted here)
    expect(result.id).toBe(first.id);
  });

  it("does not create duplicate admin users on repeated calls", () => {
    // Act
    ensureBootstrapUser();
    ensureBootstrapUser();
    // Assert
    const all = listUsers();
    expect(all.length).toBeGreaterThanOrEqual(1);
    // Only one admin with username 'admin'
    const admins = all.filter((u) => u.username === "admin");
    expect(admins).toHaveLength(1);
  });
});

// ── listUsers ──────────────────────────────────────────────────────────────

describe("listUsers", () => {
  it("returns an empty array when no users exist", () => {
    // Act
    const result = listUsers();
    // Assert
    expect(result).toEqual([]);
  });

  it("returns all users sorted ascending by createdAt", () => {
    // Arrange
    const a = makeUser({ username: "a", createdAt: 300 });
    const b = makeUser({ username: "b", createdAt: 100 });
    const c = makeUser({ username: "c", createdAt: 200 });
    seedUsers([a, b, c]);
    // Act
    const result = listUsers();
    // Assert: sorted by createdAt ascending
    expect(result.map((u) => u.username)).toEqual(["b", "c", "a"]);
  });

  it("returns a single user in a one-element array", () => {
    // Arrange
    const u = makeUser({ username: "solo", createdAt: 1 });
    seedUsers([u]);
    // Act
    const result = listUsers();
    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("solo");
  });

  it("handles corrupted localStorage gracefully by returning empty array", () => {
    // Arrange: inject invalid JSON
    window.localStorage.setItem("telecom-users-v1", "not-valid-json");
    // Act
    const result = listUsers();
    // Assert: JSON.parse throws, caught internally → empty array
    expect(result).toEqual([]);
  });
});

// ── createUser ─────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("creates and returns a new user with the supplied fields", () => {
    // Arrange
    const input = { username: "jane", fullName: "Jane Doe", role: "user" as UserRole };
    // Act
    const user = createUser(input);
    // Assert
    expect(user.username).toBe("jane");
    expect(user.fullName).toBe("Jane Doe");
    expect(user.role).toBe("user");
    expect(user.active).toBe(true);
    expect(user.lastLoginAt).toBe(0);
    expect(user.id).toMatch(/^usr_/);
  });

  it("uses username as fullName when fullName is an empty string", () => {
    // Arrange
    const input = { username: "minnie", fullName: "", role: "user" as UserRole };
    // Act
    const user = createUser(input);
    // Assert: fullName falls back to username
    expect(user.fullName).toBe("minnie");
  });

  it("persists the new user to localStorage", () => {
    // Act
    const user = createUser({ username: "stored", fullName: "Stored", role: "admin" });
    // Assert: user appears in listUsers()
    const all = listUsers();
    expect(all.some((u) => u.id === user.id)).toBe(true);
  });

  it("throws when a duplicate username is used", () => {
    // Arrange
    createUser({ username: "dup", fullName: "Dup", role: "user" });
    // Act / Assert
    expect(() => createUser({ username: "dup", fullName: "Dup2", role: "admin" })).toThrow(
      "Nom d'utilisateur déjà utilisé",
    );
  });

  it("appends the user to existing users without replacing them", () => {
    // Arrange
    const existing = makeUser({ username: "existing" });
    seedUsers([existing]);
    // Act
    createUser({ username: "newcomer", fullName: "New", role: "user" });
    // Assert
    const all = listUsers();
    expect(all).toHaveLength(2);
    expect(all.some((u) => u.username === "existing")).toBe(true);
    expect(all.some((u) => u.username === "newcomer")).toBe(true);
  });

  it("assigns a createdAt timestamp close to Date.now()", () => {
    // Arrange
    const before = Date.now();
    // Act
    const user = createUser({ username: "ts", fullName: "TS", role: "user" });
    const after = Date.now();
    // Assert
    expect(user.createdAt).toBeGreaterThanOrEqual(before);
    expect(user.createdAt).toBeLessThanOrEqual(after);
  });
});

// ── updateUser ─────────────────────────────────────────────────────────────

describe("updateUser", () => {
  it("updates the fullName of a user in place", () => {
    // Arrange
    const u = makeUser({ username: "updateme", fullName: "Old Name" });
    seedUsers([u]);
    // Act
    updateUser(u.id, { fullName: "New Name" });
    // Assert
    const found = listUsers().find((x) => x.id === u.id);
    expect(found?.fullName).toBe("New Name");
  });

  it("updates the role of a user", () => {
    // Arrange
    const u = makeUser({ username: "rolechange", role: "user" });
    seedUsers([u]);
    // Act
    updateUser(u.id, { role: "admin" });
    // Assert
    const found = listUsers().find((x) => x.id === u.id);
    expect(found?.role).toBe("admin");
  });

  it("updates the active flag of a user", () => {
    // Arrange
    const u = makeUser({ username: "deactivate", active: true });
    seedUsers([u]);
    // Act
    updateUser(u.id, { active: false });
    // Assert
    const found = listUsers().find((x) => x.id === u.id);
    expect(found?.active).toBe(false);
  });

  it("can update multiple fields simultaneously via a single patch", () => {
    // Arrange
    const u = makeUser({ username: "multi", fullName: "Old", role: "user", active: true });
    seedUsers([u]);
    // Act
    updateUser(u.id, { fullName: "Updated", role: "admin", active: false });
    // Assert
    const found = listUsers().find((x) => x.id === u.id);
    expect(found?.fullName).toBe("Updated");
    expect(found?.role).toBe("admin");
    expect(found?.active).toBe(false);
  });

  it("does not affect other users when updating one", () => {
    // Arrange
    const a = makeUser({ username: "aaa" });
    const b = makeUser({ username: "bbb" });
    seedUsers([a, b]);
    // Act
    updateUser(a.id, { fullName: "Changed" });
    // Assert: user b is unchanged
    const bAfter = listUsers().find((u) => u.id === b.id);
    expect(bAfter?.fullName).toBe(b.fullName);
  });

  it("is a no-op (no error thrown) when id does not match any user", () => {
    // Arrange
    const u = makeUser({ username: "existing" });
    seedUsers([u]);
    // Act / Assert: must not throw
    expect(() => updateUser("non-existent-id", { fullName: "Ghost" })).not.toThrow();
    // And the real user is unaffected
    const found = listUsers().find((x) => x.id === u.id);
    expect(found?.fullName).toBe(u.fullName);
  });
});

// ── removeUser ─────────────────────────────────────────────────────────────

describe("removeUser", () => {
  it("removes the specified user from storage", () => {
    // Arrange
    const u = makeUser({ username: "todelete" });
    seedUsers([u]);
    // Act
    removeUser(u.id);
    // Assert
    const all = listUsers();
    expect(all.find((x) => x.id === u.id)).toBeUndefined();
  });

  it("does not remove other users", () => {
    // Arrange
    const a = makeUser({ username: "keep" });
    const b = makeUser({ username: "gone" });
    seedUsers([a, b]);
    // Act
    removeUser(b.id);
    // Assert
    const all = listUsers();
    expect(all.some((u) => u.id === a.id)).toBe(true);
    expect(all.some((u) => u.id === b.id)).toBe(false);
  });

  it("clears the current user pointer when the current user is removed", () => {
    // Arrange
    const u = makeUser({ username: "current" });
    seedUsers([u]);
    seedCurrentUserId(u.id);
    // Act
    removeUser(u.id);
    // Assert: current user id is now null
    expect(getCurrentUserId()).toBeNull();
  });

  it("does NOT clear the current user pointer when a different user is removed", () => {
    // Arrange
    const current = makeUser({ username: "logged-in" });
    const other = makeUser({ username: "other" });
    seedUsers([current, other]);
    seedCurrentUserId(current.id);
    // Act
    removeUser(other.id);
    // Assert: current pointer untouched
    expect(getCurrentUserId()).toBe(current.id);
  });

  it("is a no-op when the id does not match any user", () => {
    // Arrange
    const u = makeUser({ username: "safe" });
    seedUsers([u]);
    // Act / Assert: must not throw
    expect(() => removeUser("ghost")).not.toThrow();
    // Real user is still there
    expect(listUsers()).toHaveLength(1);
  });
});

// ── getCurrentUserId ───────────────────────────────────────────────────────

describe("getCurrentUserId", () => {
  it("returns null when no current user is set", () => {
    // Act
    const id = getCurrentUserId();
    // Assert
    expect(id).toBeNull();
  });

  it("returns the stored id string when a current user is set", () => {
    // Arrange
    seedCurrentUserId("usr_abc123");
    // Act
    const id = getCurrentUserId();
    // Assert
    expect(id).toBe("usr_abc123");
  });
});

// ── getCurrentUser ─────────────────────────────────────────────────────────

describe("getCurrentUser", () => {
  it("returns null when no current user id is stored", () => {
    // Act
    const result = getCurrentUser();
    // Assert
    expect(result).toBeNull();
  });

  it("returns null when current user id points to a non-existent user", () => {
    // Arrange
    seedCurrentUserId("usr_ghost");
    seedUsers([]);
    // Act
    const result = getCurrentUser();
    // Assert
    expect(result).toBeNull();
  });

  it("returns the user object matching the stored current id", () => {
    // Arrange
    const u = makeUser({ username: "logged" });
    seedUsers([u]);
    seedCurrentUserId(u.id);
    // Act
    const result = getCurrentUser();
    // Assert
    expect(result).not.toBeNull();
    expect(result?.id).toBe(u.id);
    expect(result?.username).toBe("logged");
  });

  it("returns null when users list contains different ids than the current pointer", () => {
    // Arrange
    const a = makeUser({ username: "one" });
    const b = makeUser({ username: "two" });
    seedUsers([a, b]);
    seedCurrentUserId("usr_does_not_match");
    // Act
    const result = getCurrentUser();
    // Assert
    expect(result).toBeNull();
  });
});

// ── setCurrentUser ─────────────────────────────────────────────────────────

describe("setCurrentUser", () => {
  it("stores the provided id as the current user", () => {
    // Arrange
    const u = makeUser({ username: "setting" });
    seedUsers([u]);
    // Act
    setCurrentUser(u.id);
    // Assert
    expect(getCurrentUserId()).toBe(u.id);
  });

  it("removes the current user pointer when called with null", () => {
    // Arrange
    seedCurrentUserId("some-id");
    // Act
    setCurrentUser(null);
    // Assert
    expect(getCurrentUserId()).toBeNull();
  });

  it("updates lastLoginAt on the target user when setting a non-null id", () => {
    // Arrange
    const before = Date.now();
    const u = makeUser({ username: "login-time", lastLoginAt: 0 });
    seedUsers([u]);
    // Act
    setCurrentUser(u.id);
    const after = Date.now();
    // Assert
    const updated = listUsers().find((x) => x.id === u.id);
    expect(updated?.lastLoginAt).toBeGreaterThanOrEqual(before);
    expect(updated?.lastLoginAt).toBeLessThanOrEqual(after);
  });

  it("does not update lastLoginAt on other users", () => {
    // Arrange
    const target = makeUser({ username: "target", lastLoginAt: 0 });
    const bystander = makeUser({ username: "bystander", lastLoginAt: 999 });
    seedUsers([target, bystander]);
    // Act
    setCurrentUser(target.id);
    // Assert: bystander's lastLoginAt is unchanged
    const bAfter = listUsers().find((u) => u.id === bystander.id);
    expect(bAfter?.lastLoginAt).toBe(999);
  });

  it("does not update any lastLoginAt when called with null", () => {
    // Arrange
    const u = makeUser({ username: "nulllogin", lastLoginAt: 42 });
    seedUsers([u]);
    seedCurrentUserId(u.id);
    // Act
    setCurrentUser(null);
    // Assert
    const after = listUsers().find((x) => x.id === u.id);
    expect(after?.lastLoginAt).toBe(42);
  });

  it("is a no-op when localStorage is not available", () => {
    // Arrange: stub localStorage as undefined to simulate SSR
    const original = window.localStorage;
    // We temporarily replace globalThis.localStorage with undefined via vi.stubGlobal
    vi.stubGlobal("localStorage", undefined);
    // Act / Assert: must not throw
    expect(() => setCurrentUser("some-id")).not.toThrow();
    // Restore
    vi.stubGlobal("localStorage", original);
  });
});

// ── integration: full user lifecycle ──────────────────────────────────────

describe("full user lifecycle", () => {
  it("bootstrap → create → login → update → remove flows end-to-end", () => {
    // Step 1: Bootstrap creates admin
    const admin = ensureBootstrapUser();
    expect(admin.username).toBe("admin");

    // Step 2: Create a regular user
    const user = createUser({ username: "joe", fullName: "Joe Smith", role: "user" });
    expect(listUsers()).toHaveLength(2);

    // Step 3: Switch the current session to joe
    setCurrentUser(user.id);
    expect(getCurrentUser()?.username).toBe("joe");

    // Step 4: Promote joe to admin
    updateUser(user.id, { role: "admin" });
    expect(getCurrentUser()?.role).toBe("admin");

    // Step 5: Remove joe — current pointer should be cleared
    removeUser(user.id);
    expect(getCurrentUserId()).toBeNull();
    expect(listUsers()).toHaveLength(1);
    expect(listUsers()[0].username).toBe("admin");
  });
});
