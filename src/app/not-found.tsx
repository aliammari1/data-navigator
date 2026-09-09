import { Radar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className=" relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="aurora absolute -left-1/4 -top-1/3 size-[80vh] rounded-full blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 12%, transparent), transparent 65%)",
          }}
        />
      </div>

      <div className="relative">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
          <Radar className="size-5 text-primary" />
        </div>
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-primary">
          Erreur 404
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Cette page est introuvable.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          La page demandée n'existe pas ou a été déplacée. Vos données sont intactes.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">Ouvrir le tableau de bord</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
