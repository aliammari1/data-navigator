import { Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Dashboard-segment 404 — keeps the shell mounted (critic gap #3). */
export default function DashboardNotFound() {
  return (
    <div className=" flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
        <Compass className="size-5 text-primary" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        Page introuvable
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Cette page n'existe pas ou a été déplacée. Utilisez le menu ou la palette de commandes
        (Ctrl + K) pour naviguer.
      </p>
      <div className="mt-7">
        <Button asChild>
          <Link href="/dashboard">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}
