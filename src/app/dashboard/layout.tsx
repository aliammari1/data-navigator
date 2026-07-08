import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardClientShell } from "@/features/dashboard-shell/components/dashboard-client-shell";
import { auth } from "@/platform/auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/login");

  return <DashboardClientShell user={session.user}>{children}</DashboardClientShell>;
}
