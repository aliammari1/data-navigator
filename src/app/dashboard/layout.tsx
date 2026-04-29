import { headers } from "next/headers";
import { DashboardClientShell } from "@/components/dashboard/dashboard-client-shell";
import { auth, authReady } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await authReady;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <DashboardClientShell user={session?.user ?? undefined}>
      {children}
    </DashboardClientShell>
  );
}
