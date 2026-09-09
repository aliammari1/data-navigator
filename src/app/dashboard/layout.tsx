import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import * as schema from "@/db/schema";
import { DashboardClientShell } from "@/features/dashboard-shell/components/dashboard-client-shell";
import { auth } from "@/platform/auth/auth";
import { authDb } from "@/platform/auth/auth-database";
import { getHostSecret, verifySessionToken } from "@/platform/lan/lan-common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const guestToken = cookieStore.get("dn_guest_session")?.value;
  if (guestToken) {
    const guest = await verifySessionToken(guestToken, getHostSecret());
    if (guest) {
      return (
        <DashboardClientShell
          user={{
            id: guest.sub,
            name: guest.name,
            role: guest.role,
            isGuest: true,
            permissions: guest.permissions,
          }}
        >
          {children}
        </DashboardClientShell>
      );
    }
  }

  let session = null;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    console.warn("[dashboard-layout] Failed to retrieve session from auth:", error);
  }

  // Resilient SQLite fallback:
  // If Better-Auth session lookup returned null, inspect the session cookie directly against SQLite.
  if (!session) {
    const rawCookie = cookieStore.get("better-auth.session_token")?.value;
    if (rawCookie) {
      try {
        const token = decodeURIComponent(rawCookie).split(".")[0];
        if (token) {
          const sessionRow = authDb
            .select()
            .from(schema.session)
            .where(eq(schema.session.token, token))
            .get();

          if (sessionRow && new Date(sessionRow.expiresAt).getTime() > Date.now()) {
            const userRow = authDb
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, sessionRow.userId))
              .get();

            if (userRow) {
              session = {
                user: userRow,
                session: sessionRow,
              };
            }
          }
        }
      } catch (err) {
        console.warn("[dashboard-layout] Fallback session lookup error:", err);
      }
    }
  }

  if (!session) redirect("/login?reason=expired");

  return <DashboardClientShell user={session.user}>{children}</DashboardClientShell>;
}
