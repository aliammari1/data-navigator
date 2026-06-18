"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
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
    <main className=" relative flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-warning/30 bg-warning/10">
        <TriangleAlert className="size-5 text-warning" />
      </div>
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-warning">
        Erreur inattendue
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Une erreur est survenue lors de l'affichage.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        Vos données locales sont intactes. Réessayez, ou revenez à l'accueil si le problème persiste.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs text-muted-foreground/70">
            réf. {error.digest}
          </span>
        )}
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" size="lg" onClick={reset}>
          <RotateCcw className="size-4" /> Réessayer
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/dashboard">Retour à l'accueil</Link>
        </Button>
      </div>
    </main>
  );
}
