"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useShellStore } from "@/features/dashboard-shell/shell/shell-store";

/**
 * Dashboard index.
 *
 * There is no standalone Accueil/home screen for the CLASSIC shell — the
 * telecom report's Vue d'ensemble tab is its landing page, so this route
 * redirects there. It already has its own empty state ("Aucun rapport
 * télécom chargé" + an Upload CTA) for the no-dataset case.
 *
 * The windowed "Bureau" desktop workspace is the OTHER thing that lives at
 * this exact route (`DashboardLayout` renders it whenever
 * `desktopMode && pathname === "/dashboard"` — see `dashboard-layout.tsx`).
 * This must therefore only redirect when Bureau mode is NOT the active
 * surface — an unconditional server-side `redirect()` here (the previous
 * shape of this file) fires regardless of `desktopMode`, which made it
 * structurally impossible for Bureau mode to ever stay active: clicking
 * "Mode bureau" would flash the windowed workspace for an instant and then
 * bounce straight back to the classic shell as this route's redirect
 * resolved. `desktopMode` is client-only (persisted zustand state), so the
 * check has to happen client-side, after hydration.
 */
export default function DashboardIndexPage() {
  const router = useRouter();
  const desktopMode = useShellStore((s) => s.desktopMode);

  useEffect(() => {
    if (!desktopMode) {
      router.replace("/dashboard/telecom-report/overview");
    }
  }, [desktopMode, router]);

  return null;
}
