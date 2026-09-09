import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock better-auth/react before the target module is imported.
// vi.mock factories are hoisted before variable declarations, so we cannot
// reference outer variables inside the factory. Use vi.hoisted() to create
// the stubs before the hoist boundary.
// ---------------------------------------------------------------------------

const { mockSignIn, mockSignOut, mockSignUp, mockUseSession, mockCreateAuthClient } = vi.hoisted(
  () => {
    const mockSignIn = vi.fn();
    const mockSignOut = vi.fn();
    const mockSignUp = vi.fn();
    const mockUseSession = vi.fn();
    const mockCreateAuthClient = vi.fn(() => ({
      signIn: mockSignIn,
      signOut: mockSignOut,
      signUp: mockSignUp,
      useSession: mockUseSession,
    }));
    return { mockSignIn, mockSignOut, mockSignUp, mockUseSession, mockCreateAuthClient };
  },
);

vi.mock("better-auth/react", () => ({
  createAuthClient: mockCreateAuthClient,
}));

// ---------------------------------------------------------------------------
// Import the real module under test (mocks are already in place due to hoisting)
// ---------------------------------------------------------------------------
import { authClient, signIn, signOut, signUp, useSession } from "@/platform/auth/auth-client";

// ---------------------------------------------------------------------------
describe("auth-client.ts", () => {
  it("createAuthClient was called during module initialisation (mock records the call)", () => {
    // The module executes createAuthClient() at import time. Because vitest
    // clearMocks resets call-counts *between* tests, we verify via the return
    // value (authClient) rather than call-count.
    expect(mockCreateAuthClient).toBeDefined();
    // The returned object IS the authClient export, proving the call happened.
    expect(authClient).toHaveProperty("signIn", mockSignIn);
  });

  it("exports the authClient object returned by createAuthClient", () => {
    expect(authClient).toBeTruthy();
    expect(authClient).toHaveProperty("signIn");
    expect(authClient).toHaveProperty("signOut");
    expect(authClient).toHaveProperty("signUp");
    expect(authClient).toHaveProperty("useSession");
  });

  it("exports signIn bound from authClient", () => {
    expect(signIn).toBe(mockSignIn);
  });

  it("exports signOut bound from authClient", () => {
    expect(signOut).toBe(mockSignOut);
  });

  it("exports signUp bound from authClient", () => {
    expect(signUp).toBe(mockSignUp);
  });

  it("exports useSession bound from authClient", () => {
    expect(useSession).toBe(mockUseSession);
  });

  it("authClient.signIn is the same reference as the named signIn export", () => {
    expect(authClient.signIn).toBe(signIn);
  });

  it("authClient.signOut is the same reference as the named signOut export", () => {
    expect(authClient.signOut).toBe(signOut);
  });

  it("authClient.signUp is the same reference as the named signUp export", () => {
    expect(authClient.signUp).toBe(signUp);
  });

  it("authClient.useSession is the same reference as the named useSession export", () => {
    expect(authClient.useSession).toBe(useSession);
  });
});
