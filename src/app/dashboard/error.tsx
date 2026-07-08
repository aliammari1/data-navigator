"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Dashboard-segment error boundary. Rendered INSIDE the dashboard layout, so the
 * sidebar/topbar/AI panel stay mounted — a render error in one route no longer
 * blows away the whole shell (critic gap #3).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className=" flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-warning/30 bg-warning/10">
        <TriangleAlert className="size-5 text-warning" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        Une erreur est survenue dans cette vue.
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Vos données locales sont intactes. Réessayez, ou revenez à l'accueil.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs text-muted-foreground/70">
            réf. {error.digest}
          </span>
        )}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          <RotateCcw className="size-4" /> Réessayer
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}
